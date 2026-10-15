"""Repository tests become inert validated artifacts; all AI/tool execution is mocked."""
import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from context import FullChangedFile
from contracts import test_cases
from fix_generation import generate_fixes
from pipeline import combine_review
from static_analysis import StaticResult
from test_generation import generate_tests, ModelProposal, existing_test_artifact, identified
from test_test_generation import review, repository, VALID
from test_fix_generation import proposal as fix_proposal
from verification import Check, verify_one
from test_verification import scans


def client_with(response=None, error=None):
    return SimpleNamespace(responses=SimpleNamespace(parse=AsyncMock(return_value=response, side_effect=error)))


def with_existing():
    repo=repository()
    repo.context_files=[]
    repo.changed_files.append(FullChangedFile(path='test_sample.py',status='added',patch=None,content=VALID))
    return repo


class ExistingArtifactTests(unittest.IsolatedAsyncioTestCase):
    async def test_declined_generation_reuses_test_through_fix_and_verification(self):
        repo=with_existing()
        ai=review()
        client=client_with(SimpleNamespace(status='completed',output_parsed=ModelProposal(proposal=None,reason='Ambiguous',contract=None)))
        artifacts=await generate_tests(ai,repo,client)
        self.assertEqual((artifacts.total_tests,artifacts.safe_tests),(1,1))
        test=artifacts.tests[0]
        self.assertIn('Existing repository test: test_sample.py',test.purpose)
        self.assertFalse(test.contract.behavior_ambiguous)
        self.assertEqual(test_cases(test.test_code,'choose'),test.contract.cases)
        pipeline=combine_review(ai,StaticResult(findings=[],scanners=[],skipped_files=[]))
        async def generate(**kwargs):
            payload=json.loads(kwargs['input'])
            self.assertEqual(payload['behavioral_contract'],test.contract.model_dump())
            self.assertEqual(payload['unexecuted_test_proposals'][0]['test_code'],test.test_code)
            return SimpleNamespace(status='completed',output_parsed={'proposal':fix_proposal(finding_id=payload['finding_id']).model_dump(),'reason':''})
        fix_client=client_with()
        fix_client.responses.parse.side_effect=generate
        fixes=await generate_fixes(pipeline,repo,artifacts,fix_client)
        self.assertTrue(fixes.fixes[0].safe_to_verify)
        self.assertTrue(fixes.fixes[0].compatibility.compatible)
        self.assertEqual(fixes.test_artifacts,artifacts)
        before=Check(status='FAILED',failed=1,exit_code=1)
        after=Check(status='PASSED',passed=1,exit_code=0)
        async def execute(root):
            # Verify that the real temporary-workspace path receives the reused artifact.
            self.assertEqual((root/'tests'/'test_proposal_0.py').read_text(),test.test_code)
            return before if root.name=='before' else after
        with patch('verification.execute_tests',side_effect=execute) as runner, patch('verification.run_static_analysis',new=AsyncMock(side_effect=[scans(),scans()])):
            verified=await verify_one(fixes.fixes[0],repo,artifacts)
        self.assertEqual(runner.call_count,2)
        self.assertTrue(verified.safe_to_apply,verified.verification_summary)
        self.assertTrue(verified.compatibility.compatible)

    async def test_provider_unavailable_reuses_existing_test(self):
        from openai import APIConnectionError
        import httpx
        client=client_with(error=APIConnectionError(request=httpx.Request('POST','https://example.invalid')))
        result=await generate_tests(review(),with_existing(),client)
        self.assertEqual(result.safe_tests,1)
        self.assertEqual(result.contracts[0].contract_source,'existing_tests')

    async def test_no_evidence_keeps_declined_finding_skipped(self):
        client=client_with(SimpleNamespace(status='completed',output_parsed=ModelProposal(proposal=None,reason='No evidence')))
        result=await generate_tests(review(),repository(),client)
        self.assertEqual(result.total_tests,0)
        self.assertTrue(result.contracts[0].behavior_ambiguous)

    async def test_exact_nested_demo_import_resolves_only_to_sibling_implementation(self):
        ai=review(file='backend/demo_discount.py')
        ai.findings[0].line=2
        repo=repository()
        repo.changed_files=[FullChangedFile(path='backend/demo_discount.py',status='modified',patch=None,
            content='def apply_discount(price, percent):\n    return price\n'),
            FullChangedFile(path='backend/test_demo_discount.py',status='added',patch=None,
            content='from demo_discount import apply_discount\n\ndef test_twenty_percent_discount():\n    assert apply_discount(100, 20) == 80\n')]
        client=client_with(SimpleNamespace(status='completed',output_parsed=ModelProposal(proposal=None,reason='No new test needed')))
        result=await generate_tests(ai,repo,client)
        self.assertEqual(result.safe_tests,1)
        test=result.tests[0]
        self.assertIn('from backend.demo_discount import apply_discount',test.test_code)
        self.assertEqual(test.contract.cases[0].value,80)
        self.assertFalse(test.contract.behavior_ambiguous)
        repo.changed_files[1].path='other/test_demo_discount.py'
        result=await generate_tests(ai,repo,client)
        self.assertEqual(result.total_tests,0)

    async def test_multiple_existing_functions_preserve_cases_in_one_artifact(self):
        repo=with_existing()
        repo.changed_files[-1].content=VALID+'\ndef test_nonempty():\n    assert choose([3]) == 3\n'
        finding=identified(review().findings)[0]
        test=existing_test_artifact(finding,'choose','sample',{f.path:f.content for f in repo.changed_files})
        self.assertIsNotNone(test)
        self.assertEqual(test_cases(test.test_code,'choose'),test.contract.cases)
        self.assertEqual(len(test.contract.cases),2)

    async def test_unsupported_existing_tests_never_become_artifacts(self):
        for prefix in ['import os\n','print("effect")\n','def broken(\n']:
            repo=with_existing()
            repo.changed_files[-1].content=prefix+VALID
            finding=identified(review().findings)[0]
            self.assertIsNone(existing_test_artifact(finding,'choose','sample',{f.path:f.content for f in repo.changed_files}))
