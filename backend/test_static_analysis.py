"""Scanner normalization, isolation, limits, and failure tests."""
import asyncio
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from context import FullChangedFile, RepositoryContext
from static_analysis import (
    MAX_SCAN_FILE_BYTES, normalize_bandit, normalize_semgrep, run_process,
    run_scanner, run_static_analysis, severity,
)


def repository(files):
    return RepositoryContext(repository='owner/repo', commit='a' * 40, changed_files=files,
                             context_files=[], warnings=[])


def changed(path='src/example.py', content='first\nsecond\n'):
    return FullChangedFile(path=path, status='modified', patch='+change', content=content)


def bandit_json(path):
    return {'errors': [], 'results': [{'filename': path, 'line_number': 2, 'test_id': 'B301',
        'test_name': 'pickle', 'issue_severity': 'MEDIUM', 'issue_text': 'Unsafe deserialization may execute code.'}]}


def semgrep_json(path):
    return {'errors': [], 'results': [{'path': path, 'start': {'line': 1}, 'check_id': 'test-rule',
        'extra': {'severity': 'WARNING', 'message': 'Synthetic normalization fixture.',
                  'metadata': {'category': 'correctness', 'title': 'Test title'}}}]}


class NormalizationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.path = self.root / 'src/example.py'
        self.path.parent.mkdir()
        self.path.write_text('first\nsecond\n')
        self.files = {str(self.path.resolve()): 'src/example.py'}

    def test_bandit_normalization_and_original_path(self):
        result = normalize_bandit(bandit_json(str(self.path)), self.root, self.files)[0]
        self.assertEqual(result.model_dump(), {
            'source': 'bandit', 'severity': 'MEDIUM', 'category': 'Security',
            'file': 'src/example.py', 'line': 2, 'rule_id': 'B301', 'title': 'Pickle',
            'explanation': 'Unsafe deserialization may execute code.',
        })

    def test_semgrep_normalization_and_category(self):
        result = normalize_semgrep(semgrep_json('src/example.py'), self.root, self.files)[0]
        self.assertEqual(result.source, 'semgrep')
        self.assertEqual(result.category, 'Bug')
        self.assertEqual(result.severity, 'MEDIUM')
        self.assertEqual(result.line, 1)
        self.assertEqual(result.rule_id, 'test-rule')

    def test_severity_mapping(self):
        for level in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']:
            self.assertEqual(severity(level.lower(), 'bandit'), level)
        for level, expected in [('ERROR', 'HIGH'), ('WARNING', 'MEDIUM'), ('INFO', 'LOW')]:
            self.assertEqual(severity(level, 'semgrep'), expected)
        with self.assertRaises(KeyError):
            severity('UNKNOWN', 'bandit')

    def test_unknown_file_and_invalid_line_are_rejected(self):
        data = bandit_json('../outside.py')
        with self.assertRaises(KeyError):
            normalize_bandit(data, self.root, self.files)
        for line in [0, 99, True, '2']:
            data = bandit_json(str(self.path))
            data['results'][0]['line_number'] = line
            with self.assertRaises(ValueError):
                normalize_bandit(data, self.root, self.files)

    def test_optional_line_and_malformed_structure(self):
        data = bandit_json(str(self.path))
        del data['results'][0]['line_number']
        self.assertIsNone(normalize_bandit(data, self.root, self.files)[0].line)
        with self.assertRaises(ValueError):
            normalize_bandit({'results': {}}, self.root, self.files)


class ScannerExecutionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.path = self.root / 'test.py'
        self.path.write_text('first\nsecond\n')
        self.files = {str(self.path.resolve()): 'test.py'}

    async def scan(self, source='bandit'):
        return await run_scanner(source, [self.path], self.root, {}, self.files)

    async def test_findings_exit_code_is_success(self):
        with patch('static_analysis.scanner_command', return_value=['scanner']), patch(
                'static_analysis.run_process', new=AsyncMock(return_value=(1, json.dumps(bandit_json(str(self.path))).encode()))):
            findings, report = await self.scan()
        self.assertEqual(report.status, 'completed')
        self.assertEqual(len(findings), 1)

    async def test_missing_scanner(self):
        with patch('static_analysis.scanner_command', return_value=None):
            findings, report = await self.scan('semgrep')
        self.assertEqual(findings, [])
        self.assertEqual(report.status, 'unavailable')
        self.assertIn('pipx install semgrep', report.message)

    async def test_timeout_execution_and_malformed_output(self):
        cases = [(asyncio.TimeoutError(), 'timeout'), (OSError('private path'), 'error'),
                 (ValueError('private oversized output'), 'error')]
        for error, expected in cases:
            with patch('static_analysis.scanner_command', return_value=['scanner']), patch(
                    'static_analysis.run_process', new=AsyncMock(side_effect=error)):
                findings, report = await self.scan()
            self.assertEqual(findings, [])
            self.assertEqual(report.status, expected)
            self.assertNotIn('private', report.message)
        for code, output in [(2, b'private error'), (0, b'not JSON'), (0, b'{"results":{}}')]:
            with patch('static_analysis.scanner_command', return_value=['scanner']), patch(
                    'static_analysis.run_process', new=AsyncMock(return_value=(code, output))):
                _, report = await self.scan()
            self.assertEqual(report.status, 'error')
            self.assertNotIn('private error', report.message)

    async def test_partial_errors_and_output_finding_limit(self):
        data = bandit_json(str(self.path))
        data['errors'] = [{'reason': 'Syntax error'}]
        with patch('static_analysis.scanner_command', return_value=['scanner']), patch(
                'static_analysis.run_process', new=AsyncMock(return_value=(0, json.dumps(data).encode()))):
            findings, report = await self.scan()
        self.assertEqual(report.status, 'partial')
        self.assertEqual(len(findings), 1)
        data['errors'] = []
        data['results'] *= 201
        with patch('static_analysis.scanner_command', return_value=['scanner']), patch(
                'static_analysis.run_process', new=AsyncMock(return_value=(1, json.dumps(data).encode()))):
            findings, report = await self.scan()
        self.assertEqual(report.status, 'partial')
        self.assertEqual(len(findings), 200)

    async def test_semgrep_local_configuration_no_cloud_or_fix_flags(self):
        fake = AsyncMock(return_value=(0, json.dumps(semgrep_json(str(self.path))).encode()))
        with patch('static_analysis.scanner_command', return_value=['semgrep', 'scan']), patch('static_analysis.run_process', new=fake):
            findings, report = await self.scan('semgrep')
        self.assertEqual(report.status, 'completed')
        self.assertEqual(len(findings), 1)
        command = fake.call_args.args[0]
        self.assertIn('--metrics=off', command)
        self.assertIn('--no-autofix', command)
        self.assertIn('--disable-version-check', command)
        self.assertTrue(Path(command[command.index('--config') + 1]).is_file())
        self.assertNotIn('ci', command)

    async def test_process_timeout_and_output_limit_stop_process(self):
        with patch('static_analysis.SCAN_TIMEOUT_SECONDS', 0.1):
            with self.assertRaises(asyncio.TimeoutError):
                await run_process([sys.executable, '-c', 'import time; time.sleep(10)'], self.root, {})
        with patch('static_analysis.MAX_OUTPUT_BYTES', 10):
            with self.assertRaises(ValueError):
                await run_process([sys.executable, '-c', 'print("x" * 1000)'], self.root, {})


class ScanLayerTests(unittest.IsolatedAsyncioTestCase):
    async def test_unsupported_files(self):
        with patch('static_analysis.run_process', new=AsyncMock()) as process:
            result = await run_static_analysis(repository([changed('README.md')]))
        self.assertEqual(len(result.skipped_files), 1)
        self.assertTrue(all(report.status == 'skipped' for report in result.scanners))
        process.assert_not_called()

    async def test_size_limits_and_unsafe_paths(self):
        files = [changed('too-big.py', 'é' * (MAX_SCAN_FILE_BYTES // 2 + 1)),
                 changed('../escape.py'), changed('valid.py'), changed('second.py')]
        with patch('static_analysis.MAX_SCAN_FILES', 1), patch('static_analysis.scanner_command', return_value=None):
            result = await run_static_analysis(repository(files))
        self.assertEqual({file.path for file in result.skipped_files}, {'too-big.py', '../escape.py', 'second.py'})

    async def test_sanitized_environment_and_temporary_copies_are_removed(self):
        observed = []
        async def fake_process(command, cwd, env):
            observed.append(cwd)
            self.assertTrue((cwd / 'src/example.py').is_file())
            self.assertNotIn('OPENAI_API_KEY', env)
            self.assertNotIn('GITHUB_TOKEN', env)
            return 0, b'{"results":[],"errors":[]}'
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-only-placeholder', 'GITHUB_TOKEN': 'test-only-placeholder'}), patch(
                'static_analysis.scanner_command', side_effect=lambda source: ['scanner']), patch('static_analysis.run_process', new=fake_process):
            await run_static_analysis(repository([changed()]))
        self.assertTrue(observed)
        self.assertTrue(all(not path.exists() for path in observed))

    async def test_total_scan_byte_budget(self):
        files = [changed(f'file{index}.py', 'x' * 20) for index in range(3)]
        with patch('static_analysis.MAX_SCAN_TOTAL_BYTES', 40), patch('static_analysis.scanner_command', return_value=None):
            result = await run_static_analysis(repository(files))
        self.assertEqual([file.path for file in result.skipped_files], ['file2.py'])
        self.assertIn('total size limit', result.skipped_files[0].reason)

    @unittest.skipUnless(importlib.util.find_spec('bandit'), 'Bandit is not installed')
    async def test_real_bandit_scans_without_executing_python(self):
        with patch('static_analysis.shutil.which', return_value=None):
            result = await run_static_analysis(repository([changed(content='raise RuntimeError("must not execute")\neval("1+1")\n')]))
        self.assertEqual(result.scanners[0].status, 'completed', result.scanners[0].message)
        self.assertTrue(result.findings)
        self.assertTrue(all(finding.source == 'bandit' for finding in result.findings))


if __name__ == '__main__':
    unittest.main()
