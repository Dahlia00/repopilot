"""Verification fixtures are synthetic; the analyzed repository is never altered."""
import asyncio
import ast
import tempfile
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock, patch

from context import RepositoryContext
from fix_generation import ValidatedFix, FixGenerationResponse
from static_analysis import StaticResult, ScannerReport, StaticFinding
from test_generation import TestGenerationResponse, ValidatedProposal, identified
from test_test_generation import SOURCE, review, repository, contract
from contracts import BehaviorCase
from verification import (Check, verify_one, verify_fixes, execute_tests, execution_source_errors,
                          module_path, sandbox_command, bounded_process, severe_regression, execution_source_violations)

FIXED = 'def choose(values):\n    if not values:\n        raise ValueError("nonempty input required")\n    return values[0]'
TEST = 'import pytest\nfrom sample import choose\ndef test_empty():\n    with pytest.raises(ValueError):\n        choose([])'


def fix(**overrides):
    data = dict(finding_id='issue-fixture', file='sample.py', title='Validate empty input',
                explanation='Reject empty input explicitly', original_code=SOURCE.rstrip(), fixed_code=FIXED,
                confidence=90, safe_to_verify=True, finding_title='Boundary failure', sources=['AI'],
                unified_diff='not trusted', validation_errors=[], contract=contract())
    data.update(overrides)
    return ValidatedFix(**data)


def tests(code=TEST, **overrides):
    findings = identified(review().findings)
    proposal = ValidatedProposal(finding_id=findings[0].finding_id, finding_title=findings[0].title,
        file='sample.py', framework='pytest', test_name='test_empty', test_code=code, purpose='Validate empty input',
        expected_behavior='Explicit validation', execution_safe=True, validation_errors=[], contract=contract())
    data = dict(repository='owner/repo', pull_request=1, head_sha='a'*40, findings=findings, tests=[proposal],
                skipped_findings=[], total_tests=1, safe_tests=1, rejected_tests=0, contracts=[contract()])
    data.update(overrides)
    return TestGenerationResponse(**data)


def scans(findings=None, semgrep='completed', bandit='completed'):
    return StaticResult(findings=findings or [], skipped_files=[], scanners=[
        ScannerReport(source='bandit',status=bandit,message='Bandit fixture',files=['sample.py']),
        ScannerReport(source='semgrep',status=semgrep,message='Semgrep fixture',files=['sample.py'])])


def issue(severity='HIGH'):
    return StaticFinding(source='bandit',severity=severity,category='Security',file='sample.py',line=2,
                         rule_id='B-fixture',title='Synthetic scanner issue',explanation='Synthetic issue')


class ExecutionGateTests(unittest.TestCase):
    def test_full_source_gate(self):
        self.assertEqual(execution_source_errors(SOURCE,'choose'), [])
        self.assertEqual(execution_source_errors(FIXED,'choose'), [])
        for code in ['import os\n'+SOURCE, 'print("side effect")\n'+SOURCE,
                     'def choose(values):\n    return eval(values)',
                     'def choose(values):\n    return values.__class__',
                     'def choose(values):\n    return list(range(10000))',
                     'def choose(values):\n    return "a" * 10000',
                     'def choose(values):\n    return values + values',
                     'def choose(values):\n    len = values\n    return len([])']:
            self.assertTrue(execution_source_errors(code,'choose'))

    def test_ordinary_guards_comparisons_assignments_and_exceptions(self):
        sources = [
            'def choose(values):\n    return values[0] if values else None',
            'def choose(values):\n    return values[0] if len(values) > 0 else None',
            'def choose(values):\n    first = None\n    if values is not None and len(values) > 0:\n        first = values[0]\n    return first',
            'def choose(values):\n    if not values:\n        raise ValueError("nonempty input required")\n    return values[0]',
        ]
        for source in sources:
            with self.subTest(source=source):
                self.assertEqual(execution_source_errors(source, 'choose'), [])

    def test_conditional_branches_never_escape_call_checks(self):
        for call in ['eval(values)', 'exec(values)', 'open(values)', 'os.system(values)',
                     'subprocess.run(values)', 'requests.get(values)', 'getattr(values, "x")',
                     'values.__class__', 'shutil.rmtree(values)']:
            source = 'def choose(values):\n    return values[0] if values else '+call
            with self.subTest(call=call):
                violations=execution_source_violations(source,'choose','after')
                self.assertTrue(violations)
                self.assertTrue(any(v.rule in {'call_allowlist','no_attributes','reserved_name'} for v in violations))
                self.assertTrue(any(v.line==2 for v in violations))

    def test_exact_diagnostics_for_calls_imports_and_unsupported_nodes(self):
        violations=execution_source_violations('def choose(values):\n    return open(values)', 'choose', 'after')
        call = next(v for v in violations if v.rule=='call_allowlist')
        self.assertEqual((call.phase,call.node,call.call,call.line),('after','Call','open',2))
        violations=execution_source_violations('import os\ndef choose(values):\n    return values[0]', 'choose')
        self.assertTrue(any(v.node=='Import' and v.rule=='no_imports' for v in violations))
        violations=execution_source_violations('def choose(values):\n    while values:\n        pass', 'choose')
        self.assertTrue(any(v.node=='While' and v.rule=='ast_allowlist' for v in violations))

    def test_path_isolation(self):
        self.assertEqual(module_path('package/sample.py'), 'package.sample')
        for path in ['/tmp/sample.py','../sample.py','package/../sample.py','pytest.py','os.py',
                     'a/b/c/d/e/f.py','sample.ts','conftest.py','pkg/__init__.py']:
            self.assertIsNone(module_path(path))

    def test_severity_comparison_ignores_line_shifts(self):
        original = issue()
        moved = original.model_copy(update={'line':3})
        self.assertFalse(severe_regression(Check(findings=[original]),Check(findings=[moved])))
        self.assertTrue(severe_regression(Check(),Check(findings=[original])))
        self.assertFalse(severe_regression(Check(),Check(findings=[issue('MEDIUM')])))

    def test_severe_rule_replacement_cannot_hide_a_new_issue(self):
        old = Check(findings=[issue()])
        new = Check(findings=[issue().model_copy(update={'line': 3})])
        self.assertFalse(severe_regression(old, new, 'header\nunsafe()\n', 'header\n# inserted\nunsafe()\n'))
        self.assertTrue(severe_regression(old, new, 'header\nunsafe()\n', 'header\nfixed()\nnew_unsafe()\n'))


class VerificationTests(unittest.IsolatedAsyncioTestCase):
    async def run_fixture(self, proposal=None, generated=None, execution=None, scan_results=None):
        self.workspaces = []
        async def runner(root):
            self.workspaces.append(root)
            target = root/'target'/'sample.py'
            expected = SOURCE if root.name=='before' else FIXED+'\n'
            self.assertEqual(target.read_text(),expected)
            self.assertNotEqual(root,Path.cwd())
            self.assertTrue((root/'pytest.ini').is_file())
            self.assertFalse((root/'target'/'conftest.py').exists())
            if execution:
                return execution(root)
            return Check(status='FAILED',exit_code=1,collected=1,failed=1) if root.name=='before' else Check(status='PASSED',exit_code=0,collected=1,passed=1)
        with patch('verification.execute_tests', side_effect=runner), patch('verification.run_static_analysis',new=AsyncMock(side_effect=scan_results or [scans(),scans()])):
            result = await verify_one(proposal or fix(),repository(),generated or tests())
        self.assertTrue(all(not root.exists() for root in self.workspaces))
        return result

    async def test_isolated_application_cleanup_and_approval(self):
        result = await self.run_fixture()
        self.assertEqual(result.status,'PASSED')
        self.assertTrue(result.safe_to_apply)
        self.assertEqual(result.generated_test.failed,1)
        self.assertEqual(result.regression_tests.passed,1)
        self.assertEqual(repository().changed_files[0].content,SOURCE)

    async def test_conditional_fix_can_pass_all_verification_checks(self):
        conditional='def choose(values):\n    return values[0] if values else None'
        regression='from sample import choose\ndef test_empty():\n    assert choose([]) is None'
        async def runner(root):
            content=(root/'target'/'sample.py').read_text()
            self.assertEqual(content, SOURCE if root.name=='before' else conditional+'\n')
            return Check(status='FAILED',exit_code=1,collected=1,failed=1) if root.name=='before' else Check(status='PASSED',exit_code=0,collected=1,passed=1)
        with patch('verification.execute_tests',side_effect=runner), patch('verification.run_static_analysis',new=AsyncMock(side_effect=[scans(),scans()])):
            alternative=contract().model_copy(update={'desired_behavior':'choose([]) must return null.', 'evidence_quote':'choose([]) must return null.',
                'cases':[BehaviorCase(arguments=[[]],outcome='returns',value=None)]})
            snapshot=repository()
            snapshot.context_files[0].content=alternative.evidence_quote
            artifacts=tests(regression)
            artifacts.tests[0].contract=alternative
            result=await verify_one(fix(fixed_code=conditional,contract=alternative),snapshot,artifacts)
        self.assertTrue(result.safe_to_apply)
        self.assertEqual(result.status,'PASSED')
        self.assertEqual(result.safety_violations,[])

    async def test_skipped_construct_has_actionable_diagnostics(self):
        code='def choose(values):\n    try:\n        return values[0]\n    except IndexError:\n        return None'
        result=await self.run_fixture(proposal=fix(fixed_code=code))
        self.assertEqual(result.status,'SKIPPED')
        self.assertFalse(result.safe_to_apply)
        self.assertTrue(any(v.node=='Try' and v.rule=='ast_allowlist' and v.phase=='after' for v in result.safety_violations))
        self.assertIn('Try', result.verification_summary)
        self.assertIn('ast_allowlist', result.verification_summary)
        self.assertEqual(self.workspaces,[])

    async def test_rejected_fix_skipped(self):
        result = await self.run_fixture(proposal=fix(safe_to_verify=False))
        self.assertEqual(result.status,'SKIPPED')
        self.assertFalse(result.safe_to_apply)
        self.assertEqual(self.workspaces,[])

    async def test_syntax_failure_never_executes(self):
        result = await self.run_fixture(proposal=fix(fixed_code='def broken('))
        self.assertEqual(result.status,'FAILED')
        self.assertEqual(result.syntax_check.status,'FAILED')
        self.assertEqual(self.workspaces,[])

    async def test_unsafe_fixed_source_never_executes(self):
        result = await self.run_fixture(proposal=fix(fixed_code='def choose(values):\n    return eval(values)'))
        self.assertFalse(result.safe_to_apply)
        self.assertEqual(self.workspaces,[])

    async def test_unsafe_generated_test_never_executes(self):
        result = await self.run_fixture(generated=tests('import os\n'+TEST))
        self.assertEqual(result.status,'FAILED')
        self.assertEqual(self.workspaces,[])

    async def test_no_test_or_stale_snapshot_skipped(self):
        for data in [tests(tests=[]),tests(head_sha='b'*40)]:
            result = await self.run_fixture(generated=data)
            self.assertEqual(result.status,'SKIPPED')
            self.assertFalse(result.safe_to_apply)

    async def test_characterization_failure_not_rewritten(self):
        result = await self.run_fixture(execution=lambda root:Check(status='PASSED',exit_code=0,collected=1,passed=1) if root.name=='before' else Check(status='FAILED',exit_code=1,collected=1,failed=1))
        self.assertEqual(result.status,'FAILED')
        self.assertFalse(result.safe_to_apply)

    async def test_requires_real_fail_before_pass_after(self):
        for before in [Check(status='PASSED',exit_code=0,collected=1,passed=1),
                       Check(status='FAILED',exit_code=2,errors=1),Check(status='FAILED',message='timeout')]:
            result = await self.run_fixture(execution=lambda root: before if root.name=='before' else Check(status='PASSED',exit_code=0,collected=1,passed=1))
            self.assertFalse(result.safe_to_apply)
            self.assertEqual(result.status,'SKIPPED')

    async def test_new_severe_scanner_findings_prevent_approval(self):
        result = await self.run_fixture(scan_results=[scans(),scans([issue()])])
        self.assertEqual(result.status,'FAILED')
        self.assertFalse(result.safe_to_apply)
        result = await self.run_fixture(scan_results=[scans([issue()]),scans()])
        self.assertTrue(result.safe_to_apply)

    async def test_scanner_errors_and_optional_semgrep(self):
        result=await self.run_fixture(scan_results=[scans(semgrep='unavailable'),scans(semgrep='unavailable')])
        self.assertTrue(result.safe_to_apply)
        for available in ['error','partial','timeout','unavailable']:
            result=await self.run_fixture(scan_results=[scans(bandit=available),scans()])
            self.assertFalse(result.safe_to_apply)
        result=await self.run_fixture(scan_results=[scans(),scans(semgrep='error')])
        self.assertFalse(result.safe_to_apply)

    async def test_unavailable_sandbox_skips(self):
        result=await self.run_fixture(execution=lambda root:Check(message='No sandbox'))
        self.assertEqual(result.status,'SKIPPED')
        self.assertFalse(result.safe_to_apply)

    async def test_workspace_limits_and_cancellation_cleanup(self):
        with patch('verification.MAX_FILES',0):
            result=await self.run_fixture()
        self.assertEqual(result.status,'SKIPPED')
        roots=[]
        async def cancel(root):
            roots.append(root)
            raise asyncio.CancelledError()
        with patch('verification.execute_tests',side_effect=cancel):
            with self.assertRaises(asyncio.CancelledError):
                await verify_one(fix(),repository(),tests())
        self.assertTrue(all(not root.exists() for root in roots))

    async def test_fixed_file_size_limit_never_executes(self):
        with patch('verification.MAX_FILE_BYTES', len(SOURCE.encode()) + 1):
            result = await self.run_fixture()
        self.assertEqual(result.status, 'SKIPPED')
        self.assertEqual(self.workspaces, [])

    async def test_summary_and_snapshot_mismatch(self):
        proposals=FixGenerationResponse(repository='owner/repo',pull_request=1,head_sha='b'*40,
            fixes=[fix()],skipped_findings=[],total_fixes=1,safe_fixes=1,rejected_fixes=0,test_proposals_used=1)
        result=await verify_fixes(proposals,repository(),tests())
        self.assertEqual((result.passed,result.failed,result.skipped),(0,0,1))


class TrustedRunnerTests(unittest.IsolatedAsyncioTestCase):
    def prepare(self, root):
        (root/'target').mkdir()
        (root/'target'/'sample.py').write_text(FIXED+'\n')
        (root/'tests').mkdir()
        (root/'tests'/'test_proposal.py').write_text(TEST)
        (root/'pytest.ini').write_text('[pytest]\n')

    async def test_missing_sandbox_and_probe_failure_do_not_run_pytest(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            self.prepare(root)
            with patch('verification.sandbox_command',return_value=None):
                self.assertEqual((await execute_tests(root)).status,'SKIPPED')
            with patch('verification.bounded_process',new=AsyncMock(return_value=(1,'','')) ) as process:
                self.assertEqual((await execute_tests(root)).status,'SKIPPED')
                self.assertEqual(process.await_count,1)
                self.assertFalse((root/'runner.py').exists())

    async def test_timeout_and_output_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            self.prepare(root)
            for failure in [asyncio.TimeoutError(),ValueError('output exceeded')]:
                with patch('verification.bounded_process',new=AsyncMock(side_effect=[(0,'isolation-confirmed',''),failure])):
                    result=await execute_tests(root)
                self.assertEqual(result.status,'FAILED')

    async def test_actual_pytest_in_os_sandbox(self):
        if sys.platform!='darwin':
            self.skipTest('OS sandbox execution currently requires macOS')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            self.prepare(root)
            result=await execute_tests(root)
            if result.status=='SKIPPED':
                self.skipTest(result.message)
            self.assertEqual(result.status,'PASSED',result.model_dump())
            self.assertEqual(result.collected,1)
            self.assertEqual(result.passed,1)

    async def test_process_timeout_kills_and_collects(self):
        # Known trusted synthetic sleep, not model output; validates process cleanup.
        with tempfile.TemporaryDirectory() as directory:
            with patch('verification.TEST_TIMEOUT',0.05):
                with self.assertRaises(asyncio.TimeoutError):
                    await bounded_process([sys.executable,'-I','-c','import time; time.sleep(5)'],Path(directory))
