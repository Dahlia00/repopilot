"""Offline endpoint tests using GitHub-shaped HTTP responses."""

import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from github import get_github_client
from main import app


METADATA = {
    'title': 'Add sample', 'state': 'open', 'user': {'login': 'Dahlia00'},
    'base': {'ref': 'main'}, 'head': {'ref': 'sample'},
    'changed_files': 2, 'additions': 8, 'deletions': 1,
}
FILES = [
    {'filename': 'sample.py', 'status': 'modified', 'additions': 8, 'deletions': 1, 'patch': '@@ -1 +1 @@\n-old\n+new'},
    {'filename': 'image.png', 'status': 'added', 'additions': 0, 'deletions': 0},
]
PR_PATH = '/repos/Dahlia00/repopilot/pulls/1'


class GitHubEndpointTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.handler = self.success

        def transport(request):
            self.requests.append(request)
            return self.handler(request)

        async def mock_client():
            async with httpx.AsyncClient(base_url='https://api.github.com', transport=httpx.MockTransport(transport)) as client:
                yield client

        app.dependency_overrides[get_github_client] = mock_client
        self.client = TestClient(app)
        self.addCleanup(app.dependency_overrides.clear)
        self.addCleanup(self.client.close)

    def success(self, request):
        if request.url.path == PR_PATH:
            return httpx.Response(200, json=METADATA)
        if request.url.path == PR_PATH + '/files':
            return httpx.Response(200, json=FILES)
        raise AssertionError(f'Unexpected request: {request.url}')

    def analyze(self, **kwargs):
        return self.client.post('/analyze', json={'repository': 'Dahlia00/repopilot', 'pull_request': 1, **kwargs})

    def test_health(self):
        self.assertEqual(self.client.get('/health').json(), {'status': 'ok', 'service': 'RepoPilot API'})
        self.assertEqual(self.requests, [])

    def test_real_response_shape_and_optional_patch(self):
        response = self.analyze()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'repository': 'Dahlia00/repopilot', 'pull_request': 1, 'title': 'Add sample',
            'state': 'open', 'author': 'Dahlia00', 'base_branch': 'main', 'head_branch': 'sample',
            'changed_files': 2, 'additions': 8, 'deletions': 1,
            'files': [FILES[0], {**FILES[1], 'patch': None}], 'files_truncated': False,
        })
        self.assertEqual(self.requests[1].url.params['per_page'], '100')

    def test_invalid_inputs_do_not_call_github(self):
        for repository in ['wrong', 'https://github.com/o/r', 'o/r/more', 'o/..', 'o/.', 'o/r?x=1']:
            with self.subTest(repository=repository):
                self.assertEqual(self.analyze(repository=repository).status_code, 422)
        for number in [0, -1, 1.5, True, '1']:
            with self.subTest(number=number):
                self.assertEqual(self.analyze(pull_request=number).status_code, 422)
        self.assertEqual(self.requests, [])

    def test_strips_repository_whitespace(self):
        self.assertEqual(self.analyze(repository=' Dahlia00/repopilot ').status_code, 200)

    def test_pagination(self):
        def handler(request):
            if request.url.path == PR_PATH:
                return httpx.Response(200, json=METADATA)
            if request.url.params['page'] == '1':
                return httpx.Response(200, json=FILES[:1], headers={'Link': '<https://api.github.com/repos/Dahlia00/repopilot/pulls/1/files?page=2>; rel="next"'})
            return httpx.Response(200, json=FILES[1:])
        self.handler = handler
        response = self.analyze()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['files']), 2)
        self.assertEqual([r.url.params['page'] for r in self.requests[1:]], ['1', '2'])

    def test_file_limit_is_reported(self):
        def handler(request):
            if request.url.path == PR_PATH:
                return httpx.Response(200, json={**METADATA, 'changed_files': 3001})
            return httpx.Response(200, json=[{**FILES[0], 'filename': f'{request.url.params["page"]}-{i}.py'} for i in range(100)], headers={'Link': '<https://api.github.com/next>; rel="next"'})
        self.handler = handler
        response = self.analyze()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['files']), 3000)
        self.assertTrue(response.json()['files_truncated'])
        self.assertEqual(len(self.requests), 31)

    def test_repository_not_found(self):
        self.handler = lambda request: httpx.Response(404, json={'message': 'Not Found'})
        response = self.analyze()
        self.assertEqual(response.status_code, 404)
        self.assertIn('Repository not found', response.json()['detail'])

    def test_pr_not_found(self):
        self.handler = lambda request: httpx.Response(200, json={}) if request.url.path == '/repos/Dahlia00/repopilot' else httpx.Response(404, json={})
        response = self.analyze()
        self.assertEqual(response.status_code, 404)
        self.assertIn('Pull request #1', response.json()['detail'])

    def test_rate_limits(self):
        cases = [
            (403, {'x-ratelimit-remaining': '0'}, 'API rate limit exceeded'),
            (403, {'Retry-After': '120'}, 'Secondary rate limit'),
            (429, {'Retry-After': '120'}, ''),
            (403, {}, 'You have exceeded a secondary rate limit'),
        ]
        for status, headers, message in cases:
            with self.subTest(status=status, headers=headers):
                self.handler = lambda request: httpx.Response(status, headers=headers, json={'message': message})
                response = self.analyze()
                self.assertEqual(response.status_code, 429)
                self.assertTrue(response.headers['retry-after'].isdigit())
                self.assertIn('rate limit', response.json()['detail'])

    def test_github_errors_are_sanitized(self):
        for status in [401, 403, 422, 500, 503]:
            with self.subTest(status=status):
                self.handler = lambda request: httpx.Response(status, json={'message': 'sensitive upstream detail'})
                response = self.analyze()
                self.assertEqual(response.status_code, 502)
                self.assertNotIn('sensitive upstream detail', response.text)

    def test_network_and_timeout_errors(self):
        for exception, expected in [(httpx.ConnectError, 502), (httpx.ReadTimeout, 504)]:
            def handler(request):
                raise exception('private connection detail', request=request)
            self.handler = handler
            response = self.analyze()
            self.assertEqual(response.status_code, expected)
            self.assertNotIn('private connection detail', response.text)

    def test_bad_github_data(self):
        for data in [{}, [], {'title': 'incomplete'}]:
            self.handler = lambda request: httpx.Response(200, json=data)
            self.assertEqual(self.analyze().status_code, 502)
        self.handler = lambda request: httpx.Response(200, text='not JSON')
        self.assertEqual(self.analyze().status_code, 502)

    def test_cors(self):
        response = self.client.options('/analyze', headers={
            'Origin': 'http://localhost:3000', 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:3000')


class GitHubClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_no_token_and_optional_token_headers(self):
        for token in ['', 'test-only-placeholder']:
            with patch.dict('os.environ', {'GITHUB_TOKEN': token}):
                generator = get_github_client()
                client = await anext(generator)
                try:
                    self.assertEqual(client.base_url, httpx.URL('https://api.github.com'))
                    if token:
                        self.assertEqual(client.headers['Authorization'], 'Bearer test-only-placeholder')
                    else:
                        self.assertNotIn('Authorization', client.headers)
                finally:
                    await generator.aclose()


if __name__ == '__main__':
    unittest.main()
