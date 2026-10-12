"""Repository selection and read bounds tested without network or model calls."""

import base64
import gzip
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException

from context import (
    MAX_FILE_BYTES, FullChangedFile, build_repository_context, exclusion_reason,
    imported_paths, select_candidates,
)
from github import ChangedFile, PullRequestResponse

HEAD = 'a' * 40


def make_pr(files=None):
    return PullRequestResponse(
        repository='owner/project', pull_request=1, title='Test', state='open', author='owner',
        base_branch='main', head_branch='feature', head_sha=HEAD, head_repository='fork/project',
        changed_files=len(files or [1]), additions=1, deletions=0, files_truncated=False,
        files=files or [ChangedFile(filename='pkg/main.py', status='modified', additions=1,
                                  deletions=0, patch='@@ -3 +3 @@\n-old\n+return validate(value)')],
    )


class ImportSelectionTests(unittest.TestCase):
    def test_python_absolute_relative_and_from_package_imports(self):
        paths = {'pkg/helper.py', 'pkg/__init__.py', 'src/core/logic.py', 'pkg/nested/part.py'}
        source = 'from .helper import check\nfrom . import helper\nimport core.logic\nfrom .nested import part\nimport os\n'
        self.assertEqual(imported_paths('pkg/main.py', source, paths),
                         ['pkg/__init__.py', 'pkg/helper.py', 'pkg/nested/part.py', 'src/core/logic.py'])

    def test_js_import_export_require_dynamic_and_ts_extension(self):
        source = '''import { check } from './helper.js';
export { thing } from './shared';
const other = require('../common');
const later = import('./lazy');
import 'external-package';
// import fake from './notReal';
const text = "import './notReal'";
'''
        paths = {'src/helper.ts', 'src/shared/index.ts', 'common.js', 'src/lazy.ts', 'src/notReal.ts'}
        self.assertEqual(imported_paths('src/main.ts', source, paths),
                         ['common.js', 'src/helper.ts', 'src/lazy.ts', 'src/shared/index.ts'])

    def test_no_arbitrary_nearby_files_or_transitive_expansion(self):
        changed = [FullChangedFile(path='pkg/main.py', status='modified', patch='+change',
                                   content='from .helper import check')]
        candidates = select_candidates(changed, {'README.md', 'pkg/helper.py', 'pkg/__init__.py',
                                                 'pkg/README.md', 'pkg/unrelated.py', 'pkg/test_other.py'})
        self.assertEqual([file.path for file in candidates],
                         ['README.md', 'pkg/helper.py', 'pkg/README.md', 'pkg/__init__.py'])
        self.assertIn('Direct local import', candidates[1].reason)

    def test_ignore_paths_and_types(self):
        for path in ['node_modules/a.ts', '.git/config', 'build/code.py', 'dist/code.js',
                     'src/generated/a.py', 'package-lock.json', 'poetry.lock', 'image.png',
                     'src/type.d.ts', 'bundle.min.js', 'src/a.generated.ts', '.env',
                     '../../secret.py', '/root/code.py', 'src/../code.py']:
            with self.subTest(path=path):
                self.assertIsNotNone(exclusion_reason(path))
        self.assertIsNone(exclusion_reason('pkg/main.py'))


class ContextRetrievalTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.sources = {
            'README.md': b'# Project conventions\n',
            'pkg/main.py': b'from .helper import validate\n\ndef main(value):\n    return validate(value)\n',
            'pkg/helper.py': b'def validate(value):\n    return bool(value)\n',
            'pkg/README.md': b'# Package documentation\n',
            'pkg/__init__.py': b'from .main import main\n',
            'pkg/unrelated.py': b'pass\n',
        }
        self.requests = []
        self.entry_overrides = {}
        self.error_status = None
        self.tree_truncated = False
        self.bad_tree = False
        self.bad_blob = False

    def transport(self, request):
        self.requests.append(request)
        entries = [{**{'path': path, 'sha': f'{index + 1:040x}', 'size': len(content),
                       'type': 'blob', 'mode': '100644'}, **self.entry_overrides.get(path, {})}
                   for index, (path, content) in enumerate(self.sources.items())]
        if self.error_status:
            return httpx.Response(self.error_status, json={'message': 'private error details'})
        if '/git/trees/' in request.url.path:
            self.assertEqual(request.url.path, f'/repos/fork/project/git/trees/{HEAD}')
            self.assertEqual(request.url.params['recursive'], '1')
            return httpx.Response(200, json=[] if self.bad_tree else {'tree': entries, 'truncated': self.tree_truncated})
        self.assertTrue(request.url.path.startswith('/repos/fork/project/'))
        if '/git/blobs/' in request.url.path:
            sha = request.url.path.rsplit('/', 1)[1]
            entry = next(entry for entry in entries if entry['sha'] == sha)
            path = entry['path']
        else:
            path = request.url.path.split('/contents/', 1)[1]
            self.assertEqual(request.url.params['ref'], HEAD)
        if path not in self.sources:
            return httpx.Response(404, json={})
        content = self.sources[path]
        return httpx.Response(200, json={'encoding': 'base64', 'size': len(content),
            'content': 1 if self.bad_blob else base64.b64encode(content).decode()})

    async def build(self, pr=None):
        async with httpx.AsyncClient(base_url='https://api.github.com', transport=httpx.MockTransport(self.transport)) as client:
            return await build_repository_context(pr or make_pr(), client)

    async def test_full_content_and_context_at_fork_head_commit(self):
        result = await self.build()
        self.assertEqual(result.commit, HEAD)
        self.assertEqual(result.changed_files[0].content, self.sources['pkg/main.py'].decode())
        self.assertIn('from .helper', result.changed_files[0].content)  # Outside the patch.
        self.assertEqual([file.path for file in result.context_files],
                         ['README.md', 'pkg/helper.py', 'pkg/README.md', 'pkg/__init__.py'])
        self.assertNotIn('pkg/unrelated.py', [file.path for file in result.context_files])
        self.assertEqual(len(self.requests), 6)  # One tree, five selected blobs, no archive/clone.

    async def test_readme_is_optional(self):
        del self.sources['README.md']
        result = await self.build()
        self.assertNotIn('README.md', [file.path for file in result.context_files])
        self.assertTrue(result.changed_files[0].content)

    async def test_context_file_limit(self):
        with patch('context.MAX_CONTEXT_FILES', 2):
            result = await self.build()
        self.assertEqual(len(result.context_files), 2)
        self.assertTrue(any('Context file limit' in note for note in result.warnings))
        self.assertEqual(len(self.requests), 4)

    async def test_candidate_limit(self):
        with patch('context.MAX_CONTEXT_CANDIDATES', 2):
            result = await self.build()
        self.assertEqual(len(result.context_files), 2)
        self.assertTrue(any('candidate limit' in note for note in result.warnings))

    async def test_changed_file_limit(self):
        files = make_pr().files + [ChangedFile(filename='pkg/helper.py', status='modified',
            additions=1, deletions=0, patch='@@ -1 +1 @@\n+pass')]
        with patch('context.MAX_CHANGED_FILES', 1):
            result = await self.build(make_pr(files))
        self.assertIsNotNone(result.changed_files[0].content)
        self.assertIn('retrieval limit', result.changed_files[1].skip_reason)
        self.assertIsNone(result.changed_files[1].content)

    async def test_total_source_budget(self):
        source_cost = len(self.sources['pkg/main.py'].decode()) + len(make_pr().files[0].patch)
        with patch('context.MAX_SOURCE_CHARS', source_cost + len(self.sources['README.md'])):
            result = await self.build()
        self.assertEqual([file.path for file in result.context_files], ['README.md'])
        self.assertTrue(any('source character limit' in note for note in result.warnings))

    async def test_large_binary_generated_and_images(self):
        self.sources['pkg/helper.py'] = b'x' * (MAX_FILE_BYTES + 1)
        self.sources['pkg/main.py'] = b'from .helper import validate\n'
        self.sources['bad.py'] = b'\x00binary'
        self.sources['generated.py'] = b'# Automatically generated - do not edit\npass\n'
        self.sources['image.png'] = b'binary'
        files = make_pr().files + [ChangedFile(filename=path, status='added', additions=1,
                    deletions=0, patch='@@ -0,0 +1 @@\n+pass')
                    for path in ['bad.py', 'generated.py', 'image.png']]
        result = await self.build(make_pr(files))
        details = {file.path: file.skip_reason for file in result.changed_files}
        self.assertEqual(details['bad.py'], 'Binary content')
        self.assertEqual(details['generated.py'], 'Generated-file header')
        self.assertEqual(details['image.png'], 'Binary or unsupported file type')
        self.assertTrue(any('pkg/helper.py' in note and 'limit' in note for note in result.warnings))
        helper_sha = f'{list(self.sources).index("pkg/helper.py") + 1:040x}'
        self.assertFalse(any(request.url.path.endswith(helper_sha) for request in self.requests))

    async def test_symlinks_and_removed_files(self):
        self.entry_overrides['pkg/main.py'] = {'mode': '120000'}
        files = make_pr().files + [ChangedFile(filename='gone.py', status='removed',
                                              additions=0, deletions=1, patch='@@ -1 +0,0 @@\n-pass')]
        result = await self.build(make_pr(files))
        self.assertIn('Symlink', result.changed_files[0].skip_reason)
        self.assertIn('Removed file', result.changed_files[1].skip_reason)
        self.assertFalse(any('/contents/' in request.url.path for request in self.requests))

    async def test_truncated_tree_uses_immutable_contents_fallback(self):
        self.tree_truncated = True
        with patch('context.MAX_TREE_ENTRIES', 1):
            result = await self.build()
        self.assertTrue(any('truncated' in note for note in result.warnings))
        self.assertIsNotNone(result.changed_files[0].content)
        self.assertTrue(any('/contents/pkg/main.py' in request.url.path for request in self.requests))

    async def test_missing_changed_file_is_explicit(self):
        del self.sources['pkg/main.py']
        result = await self.build()
        self.assertIsNone(result.changed_files[0].content)
        self.assertIn('unavailable', result.changed_files[0].skip_reason)

    async def test_response_byte_limits(self):
        with patch('context.MAX_TREE_RESPONSE_BYTES', 10):
            with self.assertRaises(HTTPException) as caught:
                await self.build()
            self.assertEqual(caught.exception.status_code, 413)
        with patch('context.MAX_FILE_RESPONSE_BYTES', 10):
            result = await self.build()
        self.assertIn('response exceeds', result.changed_files[0].skip_reason)

    async def test_compressed_github_responses_are_decoded_once(self):
        def compressed_transport(request):
            response = self.transport(request)
            return httpx.Response(response.status_code, headers={'Content-Encoding': 'gzip'},
                                  stream=httpx.ByteStream(gzip.compress(response.content)))
        async with httpx.AsyncClient(base_url='https://api.github.com', transport=httpx.MockTransport(compressed_transport)) as client:
            result = await build_repository_context(make_pr(), client)
        self.assertEqual(result.changed_files[0].content, self.sources['pkg/main.py'].decode())
        self.assertTrue(result.context_files)

    async def test_github_errors_and_invalid_data(self):
        for status, expected in [(403, 502), (429, 429), (500, 502)]:
            self.error_status = status
            with self.assertRaises(HTTPException) as caught:
                await self.build()
            self.assertEqual(caught.exception.status_code, expected)
            self.assertNotIn('private error', caught.exception.detail)
        self.error_status = None
        self.bad_tree = True
        with self.assertRaises(HTTPException) as caught:
            await self.build()
        self.assertEqual(caught.exception.status_code, 502)
        self.bad_tree = False
        self.bad_blob = True
        with self.assertRaises(HTTPException) as caught:
            await self.build()
        self.assertEqual(caught.exception.status_code, 502)


if __name__ == '__main__':
    unittest.main()
