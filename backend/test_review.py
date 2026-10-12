"""Offline review tests exercise the real SDK with mocked HTTP responses."""
import asyncio
import json
import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from openai import AsyncOpenAI

from github import get_github_client
from main import app
from review import MAX_FINDINGS_PER_FILE, MODEL, get_openai_client, visible_new_lines

PR_PATH = '/repos/Dahlia00/repopilot/pulls/1'
FILES = [
    {'filename': 'sample.py', 'status': 'modified', 'additions': 1, 'deletions': 1,
     'patch': '@@ -1,2 +1,2 @@\n def compute(items):\n-    return len(items)\n+    return items[0]'},
    {'filename': 'second.py', 'status': 'added', 'additions': 1, 'deletions': 0,
     'patch': '@@ -0,0 +1 @@\n+print("example")'},
    {'filename': 'image.png', 'status': 'added', 'additions': 0, 'deletions': 0},
]
METADATA = {
    'title': 'Review test', 'state': 'open', 'user': {'login': 'Dahlia00'},
    'base': {'ref': 'main'}, 'head': {'ref': 'test-pr'},
    'changed_files': 3, 'additions': 2, 'deletions': 1,
}
FINDING = {
    'severity': 'MEDIUM', 'category': 'Bug', 'file': 'sample.py', 'line': 2,
    'title': 'Possible empty list access', 'explanation': 'The list might be empty.',
    'suggested_fix': 'Handle the empty list before accessing the first item.', 'confidence': 90,
}


def model_response(findings, status='completed'):
    return httpx.Response(200, json={
        'id': 'resp_test', 'object': 'response', 'created_at': 1, 'status': status,
        'model': MODEL, 'parallel_tool_calls': False, 'tool_choice': 'auto', 'tools': [],
        'output': [{'id': 'msg_test', 'type': 'message', 'role': 'assistant',
                    'status': 'completed', 'content': [{'type': 'output_text',
                    'text': json.dumps({'findings': findings}), 'annotations': []}]}],
    })


class ReviewEndpointTests(unittest.TestCase):
    def setUp(self):
        self.github_requests = []
        self.ai_requests = []
        self.files = FILES
        self.github_error = None
        self.ai_handler = self.success

        def github_transport(request):
            self.github_requests.append(request)
            if self.github_error:
                return httpx.Response(self.github_error, json={'message': 'Not Found'})
            if request.url.path == PR_PATH:
                return httpx.Response(200, json=METADATA)
            if request.url.path == PR_PATH + '/files':
                return httpx.Response(200, json=self.files)
            return httpx.Response(404, json={})

        def ai_transport(request):
            self.ai_requests.append(request)
            return self.ai_handler(request)

        async def github_client():
            async with httpx.AsyncClient(base_url='https://api.github.com', transport=httpx.MockTransport(github_transport)) as client:
                yield client

        async def ai_client():
            async with AsyncOpenAI(api_key='test-only-placeholder', max_retries=0,
                http_client=httpx.AsyncClient(transport=httpx.MockTransport(ai_transport))) as client:
                yield client

        app.dependency_overrides[get_github_client] = github_client
        app.dependency_overrides[get_openai_client] = ai_client
        self.client = TestClient(app)
        self.addCleanup(app.dependency_overrides.clear)
        self.addCleanup(self.client.close)

    def success(self, request):
        file = json.loads(json.loads(request.content)['input'])['file']
        return model_response([FINDING] if file == 'sample.py' else [])

    def review(self, **kwargs):
        return self.client.post('/review', json={'repository': 'Dahlia00/repopilot', 'pull_request': 1, **kwargs})

    def test_sdk_structured_review_and_patch_coverage(self):
        response = self.review()
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body['title'], 'Review test')
        self.assertEqual(body['findings'], [FINDING])
        self.assertEqual(body['reviewed_files'], ['sample.py', 'second.py'])
        self.assertEqual(body['skipped_files'], ['image.png'])
        self.assertEqual(body['model'], MODEL)
        self.assertEqual(len(self.ai_requests), 2)
        for request, file in zip(self.ai_requests, FILES[:2]):
            body = json.loads(request.content)
            payload = json.loads(body['input'])
            self.assertEqual(payload['file'], file['filename'])
            self.assertEqual(payload['patch'], file['patch'])
            self.assertFalse(body['store'])
            self.assertNotIn('tools', body)
            schema = body['text']['format']
            self.assertEqual(schema['type'], 'json_schema')
            self.assertTrue(schema['strict'])
            self.assertFalse(schema['schema']['additionalProperties'])

    def test_multiple_findings_in_different_hunks_are_preserved(self):
        # Synthetic parser fixtures, not expected findings for the live PR.
        self.files = [{**FILES[0], 'patch': FILES[0]['patch'] + '\n@@ -20 +20 @@\n-old\n+pass'}]
        expected = [
            {'severity': 'HIGH', 'category': 'Bug', 'file': 'sample.py', 'line': 2,
             'title': 'Parser fixture A', 'explanation': 'Synthetic first finding.',
             'suggested_fix': 'Synthetic first recommendation.', 'confidence': 80},
            {'severity': 'MEDIUM', 'category': 'Error Handling', 'file': 'sample.py', 'line': 20,
             'title': 'Parser fixture B', 'explanation': 'Synthetic second finding.',
             'suggested_fix': 'Synthetic second recommendation.', 'confidence': 70},
        ]
        self.ai_handler = lambda request: model_response(expected)
        response = self.review()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['findings'], expected)
        request = json.loads(self.ai_requests[0].content)
        self.assertEqual(json.loads(request['input'])['patch'], self.files[0]['patch'])
        self.assertEqual(json.loads(request['input'])['visible_new_lines'], [1, 2, 20])

    def test_ten_findings_per_file_are_preserved_across_files(self):
        def handler(request):
            filename = json.loads(json.loads(request.content)['input'])['file']
            return model_response([
                {'severity': 'LOW', 'category': 'Code Quality', 'file': filename, 'line': None,
                 'title': f'Parser fixture {index}', 'explanation': 'Synthetic parser payload.',
                 'suggested_fix': 'Synthetic recommendation.', 'confidence': 50}
                for index in range(MAX_FINDINGS_PER_FILE)
            ])
        self.ai_handler = handler
        response = self.review()
        self.assertEqual(response.status_code, 200, response.text)
        findings = response.json()['findings']
        self.assertEqual(len(findings), 2 * MAX_FINDINGS_PER_FILE)
        for filename in ['sample.py', 'second.py']:
            self.assertEqual(sum(finding['file'] == filename for finding in findings), MAX_FINDINGS_PER_FILE)
        for request in self.ai_requests:
            schema = json.loads(request.content)['text']['format']['schema']
            self.assertEqual(schema['properties']['findings']['maxItems'], MAX_FINDINGS_PER_FILE)

    def test_over_limit_response_is_rejected_not_silently_truncated(self):
        self.ai_handler = lambda request: model_response([
            {'severity': 'LOW', 'category': 'Code Quality', 'file': 'sample.py', 'line': None,
             'title': f'Parser fixture {index}', 'explanation': 'Synthetic parser payload.',
             'suggested_fix': 'Synthetic recommendation.', 'confidence': 50}
            for index in range(MAX_FINDINGS_PER_FILE + 1)
        ])
        response = self.review()
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('findings', response.json())

    def test_missing_key(self):
        del app.dependency_overrides[get_openai_client]
        with patch.dict(os.environ, {'OPENAI_API_KEY': ''}):
            response = self.review()
        self.assertEqual(response.status_code, 503)
        self.assertIn('OPENAI_API_KEY', response.json()['detail'])
        self.assertEqual(self.github_requests, [])
        self.assertEqual(self.ai_requests, [])

    def test_invalid_input(self):
        self.assertEqual(self.review(repository='wrong').status_code, 422)
        self.assertEqual(self.review(pull_request=0).status_code, 422)
        self.assertEqual(self.ai_requests, [])

    def test_github_errors_do_not_call_openai(self):
        self.github_error = 404
        response = self.review()
        self.assertEqual(response.status_code, 404)
        self.assertIn('Repository not found', response.json()['detail'])
        self.assertEqual(self.ai_requests, [])

    def test_fetch_works_without_ai_key(self):
        del app.dependency_overrides[get_openai_client]
        with patch.dict(os.environ, {'OPENAI_API_KEY': ''}):
            response = self.client.post('/analyze', json={'repository': 'Dahlia00/repopilot', 'pull_request': 1})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('findings', response.json())
        self.assertEqual(self.ai_requests, [])

    def test_no_patches_calls_no_model(self):
        self.files = [FILES[2]]
        response = self.review()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['findings'], [])
        self.assertEqual(response.json()['reviewed_files'], [])
        self.assertEqual(response.json()['skipped_files'], ['image.png'])
        self.assertEqual(self.ai_requests, [])

    def test_nullable_line_and_zero_findings(self):
        self.ai_handler = lambda request: model_response([])
        self.assertEqual(self.review().json()['findings'], [])
        self.ai_handler = lambda request: model_response([{**FINDING, 'line': None,
            'file': json.loads(json.loads(request.content)['input'])['file'], 'confidence': 25.5}])
        response = self.review()
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()['findings'][0]['line'])

    def test_invalid_findings_are_not_returned(self):
        for change in [{'confidence': 101}, {'confidence': -1}, {'severity': 'UNKNOWN'},
                       {'category': 'Unknown'}, {'line': 99}, {'line': 0},
                       {'file': 'invented.py'}, {'confidence': True}, {'line': '2'}, {'title': ''}]:
            with self.subTest(change=change):
                self.ai_handler = lambda request: model_response([{**FINDING, **change}])
                response = self.review()
                self.assertEqual(response.status_code, 502, response.text)
                self.assertNotIn('findings', response.json())

    def test_invalid_json(self):
        self.ai_handler = lambda request: httpx.Response(200, json={
            'id': 'resp_test', 'status': 'completed', 'output': [{'type': 'message',
            'content': [{'type': 'output_text', 'text': 'not json'}]}],
        })
        response = self.review()
        self.assertEqual(response.status_code, 502, response.text)

    def test_refusal_and_incomplete_response(self):
        self.ai_handler = lambda request: httpx.Response(200, json={
            'id': 'resp_test', 'status': 'completed', 'output': [{'type': 'message',
            'content': [{'type': 'refusal', 'refusal': 'Cannot review'}]}],
        })
        self.assertEqual(self.review().status_code, 502)
        self.ai_handler = lambda request: model_response([], status='incomplete')
        self.assertEqual(self.review().status_code, 502)

    def test_openai_errors_are_sanitized(self):
        for status, expected in [(401, 502), (403, 502), (429, 429), (500, 502)]:
            with self.subTest(status=status):
                self.ai_handler = lambda request: httpx.Response(status, json={'error': {
                    'message': 'test-only-placeholder sensitive provider detail', 'type': 'api_error',
                }})
                response = self.review()
                self.assertEqual(response.status_code, expected)
                self.assertNotIn('test-only-placeholder', response.text)
                self.assertNotIn('sensitive provider detail', response.text)

    def test_openai_connection_and_timeout(self):
        for error, status in [(httpx.ConnectError, 502), (httpx.ReadTimeout, 504)]:
            def handler(request):
                raise error('sensitive transport detail', request=request)
            self.ai_handler = handler
            response = self.review()
            self.assertEqual(response.status_code, status)
            self.assertNotIn('sensitive transport detail', response.text)

    def test_no_partial_findings_on_failure(self):
        def handler(request):
            if len(self.ai_requests) == 1:
                return self.success(request)
            return httpx.Response(500, json={'error': {'message': 'Failure'}})
        self.ai_handler = handler
        response = self.review()
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('findings', response.json())

    def test_overall_review_timeout(self):
        async def timed_out(pr, client):
            raise asyncio.TimeoutError()
        with patch('main.review_patches', timed_out):
            response = self.review()
        self.assertEqual(response.status_code, 504)

    def test_review_cors(self):
        response = self.client.options('/review', headers={
            'Origin': 'http://localhost:3000', 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:3000')


class DiffLineTests(unittest.TestCase):
    def test_new_line_numbers_across_hunks_and_deletions(self):
        self.assertEqual(visible_new_lines('@@ -4,3 +10,3 @@\n context\n-deleted\n+added\n context\n@@ -20 +30 @@\n-old\n+new\n\\ No newline at end of file'), {10, 11, 12, 30})
        self.assertEqual(visible_new_lines('@@ -1 +0,0 @@\n-deleted'), set())


if __name__ == '__main__':
    unittest.main()
