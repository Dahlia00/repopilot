"""Test proposal validation only: generated code is never executed."""
import json
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException
from openai import AsyncOpenAI

from context import FullChangedFile, RepositoryContext, ContextFile, ContextMetadata
from contracts import BehavioralContract, BehaviorCase
from review import Finding, ReviewResponse
from test_generation import TestProposal, generate_tests, identified, target_for, validate_code

SOURCE = 'def choose(values):\n    return values[0]\n'
VALID = 'import pytest\nfrom sample import choose\n\ndef test_empty():\n    with pytest.raises(ValueError):\n        choose([])\n'


QUOTE = 'choose([]) must raise ValueError.'
def contract(finding_id=None):
    return BehavioralContract(finding_id=finding_id or identified(review().findings)[0].finding_id,
        file='sample.py',function='choose',current_behavior='Empty input raises IndexError.',
        problem='Required validation is missing.',desired_behavior=QUOTE,desired_behavior_confidence=95,
        contract_source='repository_context',evidence_path='README.md',evidence_quote=QUOTE,
        cases=[BehaviorCase(arguments=[[]],outcome='raises',exception='ValueError')],behavior_ambiguous=False)


def proposal(code=VALID, **overrides):
    return TestProposal(finding_id='test-id', file='sample.py', framework='pytest',
        test_name='test_empty', test_code=code, purpose='Characterize empty input.',
        expected_behavior='An error is observed for empty input.', execution_safe=True, **overrides)


def review(category='Bug', file='sample.py'):
    finding = Finding(severity='MEDIUM', category=category, file=file, line=2,
        title='Empty input boundary failure', explanation='Empty input fails.',
        suggested_fix='Handle the boundary input.', confidence=90)
    return ReviewResponse(repository='owner/repo', pull_request=1, title='Test', state='open',
        author='owner', base_branch='main', head_branch='feature', head_sha='a'*40,
        head_repository='owner/repo', changed_files=1, additions=1, deletions=0, files=[],
        files_truncated=False, findings=[finding], reviewed_files=[file], skipped_files=[],
        model='test', repository_context=[ContextMetadata(path='README.md',reason='Contract',used_for=[file])], context_warnings=[], skipped_file_details=[], input_characters=0)


def repository():
    return RepositoryContext(repository='owner/repo', commit='a'*40,
        changed_files=[FullChangedFile(path='sample.py', status='modified', patch='@@ -1 +1 @@\n+change', content=SOURCE)],
        context_files=[ContextFile(path='README.md',reason='Contract',content=QUOTE)], warnings=[])


class ValidationTests(unittest.TestCase):
    def test_valid_minimal_pytest(self):
        self.assertEqual(validate_code(proposal(), 'sample', 'choose'), [])

    def test_syntax_errors_and_wrong_name(self):
        self.assertTrue(validate_code(proposal('def broken('), 'sample', 'choose'))
        self.assertTrue(validate_code(proposal(VALID.replace('test_empty', 'test_other')), 'sample', 'choose'))

    def test_reject_dangerous_code_and_aliases(self):
        snippets = [
            'import subprocess\nsubprocess.run(["echo", "x"])',
            'import os\nos.system("echo x")',
            'import shutil\nshutil.rmtree("/")',
            'import requests\nrequests.get("https://example.com")',
            'import socket\nsocket.socket()',
            'eval("1+1")', 'exec("pass")', 'open("file", "w")',
            'choose("rm -rf /")',
            '__import__("os").system("x")', 'getattr(choose, "__globals__")',
            'choose.__globals__["os"].system("x")',
            'from sample import choose as eval\ndef test_empty():\n    assert eval([])',
            'from sample import choose as len\ndef test_empty():\n    assert len([])',
        ]
        for snippet in snippets:
            with self.subTest(snippet=snippet):
                code = 'from sample import choose\n' + snippet if snippet.startswith(('import', 'from')) else 'from sample import choose\ndef test_empty():\n    ' + snippet + '\n    assert True\n'
                self.assertTrue(validate_code(proposal(code), 'sample', 'choose'))

    def test_forbid_escaping_target_import_and_external_functions(self):
        self.assertTrue(validate_code(proposal(VALID.replace('from sample import choose', 'from other import choose')), 'sample', 'choose'))
        self.assertTrue(validate_code(proposal(VALID.replace('choose([])', 'dangerous([])')), 'sample', 'choose'))
        self.assertTrue(validate_code(proposal(VALID.replace('choose([])', 'choose = len\n        choose([])')), 'sample', 'choose'))

    def test_require_target_call_and_assertion(self):
        self.assertTrue(validate_code(proposal('from sample import choose\ndef test_empty():\n    assert True\n'), 'sample', 'choose'))
        self.assertTrue(validate_code(proposal('from sample import choose\ndef test_empty():\n    choose([])\n'), 'sample', 'choose'))

    def test_reject_loops_fixtures_decorators_and_nested_functions(self):
        cases = [VALID.replace('def test_empty():', 'def test_empty(tmp_path):'),
                 VALID.replace('def test_empty():', '@pytest.mark.skip\ndef test_empty():'),
                 VALID.replace('choose([])', 'while True:\n            choose([])'),
                 VALID.replace('choose([])', 'def helper():\n            choose([])')]
        for code in cases:
            self.assertTrue(validate_code(proposal(code), 'sample', 'choose'))

    def test_testable_source_and_unsupported_findings(self):
        finding = review().findings[0]
        self.assertEqual(target_for(finding, SOURCE), ('choose', None))
        self.assertIsNotNone(target_for(review('Security').findings[0], SOURCE)[1])
        self.assertIsNotNone(target_for(review(file='sample.ts').findings[0], SOURCE)[1])
        for source in ['import os\n' + SOURCE, 'print("effect")\n' + SOURCE,
                       'def choose(values):\n    return eval(values)\n',
                       '@decorator\n' + SOURCE, 'def choose(values=[]):\n    return values[0]\n']:
            self.assertIsNotNone(target_for(finding, source)[1])

    def test_finding_ids_are_deterministic_and_distinct(self):
        first = identified(review().findings)
        self.assertEqual(first, identified(review().findings))
        self.assertNotEqual(first[0].finding_id, identified(review('Security').findings)[0].finding_id)


class GenerationTests(unittest.IsolatedAsyncioTestCase):
    async def generate(self, transform=None, category='Bug'):
        self.requests = []
        def transport(request):
            body = json.loads(request.content)
            self.requests.append(body)
            payload = json.loads(body['input'])
            code = VALID
            data = {'proposal': {
                'finding_id': payload['finding_id'], 'file': payload['file'], 'framework': 'pytest',
                'test_name': 'test_empty', 'test_code': code, 'purpose': 'Characterize empty input.',
                'expected_behavior': 'Current error is observed.', 'execution_safe': True,
            }, 'reason': '', 'contract':contract(payload['finding_id']).model_dump()}
            if transform:
                data = transform(data)
            return httpx.Response(200, json={'id':'resp_test','object':'response','created_at':1,
                'model':'test','status':'completed','output':[{'id':'msg_test','type':'message',
                'role':'assistant','status':'completed','content':[{'type':'output_text',
                'text': json.dumps(data),'annotations':[]}]}]})
        async with AsyncOpenAI(api_key='test-only-placeholder', max_retries=0,
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(transport))) as client:
            return await generate_tests(review(category), repository(), client)

    async def test_structured_generation_validates_and_preserves_proposal(self):
        result = await self.generate()
        self.assertEqual((result.total_tests,result.safe_tests,result.rejected_tests), (1,1,0))
        self.assertEqual(result.tests[0].test_code, VALID)
        self.assertEqual(result.tests[0].finding_id, result.findings[0].finding_id)
        self.assertFalse(self.requests[0]['store'])
        self.assertTrue(self.requests[0]['text']['format']['strict'])
        self.assertEqual(json.loads(self.requests[0]['input'])['full_content'], SOURCE)

    async def test_dangerous_and_invalid_syntax_are_returned_rejected(self):
        for code in ['def broken(', VALID.replace('choose([])', 'eval("1+1")')]:
            def transform(data):
                data['proposal']['test_code'] = code
                return data
            result = await self.generate(transform)
            self.assertEqual((result.safe_tests,result.rejected_tests), (0,1))
            self.assertFalse(result.tests[0].execution_safe)
            self.assertTrue(result.tests[0].validation_errors)

    async def test_wrong_identity_is_rejected(self):
        def transform(data):
            data['proposal']['finding_id'] = 'wrong'
            return data
        result = await self.generate(transform)
        self.assertEqual(result.rejected_tests, 1)

    async def test_unsupported_security_finding_makes_no_generation_call(self):
        result = await self.generate(category='Security')
        self.assertEqual(result.tests, [])
        self.assertEqual(self.requests, [])
        self.assertTrue(result.skipped_findings)

    async def test_malformed_model_response(self):
        with self.assertRaises(HTTPException) as caught:
            await self.generate(lambda data: {'unexpected': 'response'})
        self.assertEqual(caught.exception.status_code, 502)

    async def test_model_decline_and_unsafe_assessment(self):
        result = await self.generate(lambda data: {**data, 'proposal':None, 'reason':'Not deterministic.'})
        self.assertEqual(result.tests, [])
        self.assertEqual(result.skipped_findings[0].reason, 'Not deterministic.')
        def transform(data):
            data['proposal']['execution_safe'] = False
            data['reason'] = 'Unsafe assessment'
            return data
        result = await self.generate(transform)
        self.assertEqual(result.rejected_tests, 1)

    async def test_ambiguous_behavior_does_not_generate_characterization_test(self):
        def transform(data):
            data['contract']['contract_source']='inferred'
            return data
        result=await self.generate(transform)
        self.assertEqual(result.tests,[])
        self.assertTrue(result.contracts[0].behavior_ambiguous)
        self.assertIn('behavior_ambiguous',result.skipped_findings[0].reason)

    async def test_regression_test_must_match_desired_not_current_behavior(self):
        def transform(data):
            data['proposal']['test_code']=data['proposal']['test_code'].replace('ValueError','IndexError')
            return data
        result=await self.generate(transform)
        self.assertEqual(result.rejected_tests,1)
        self.assertIn('desired behavioral contract',result.tests[0].validation_errors[0])

    async def test_input_budget_skips_generation(self):
        with patch('test_generation.MAX_INPUT_CHARS', 1):
            result = await self.generate()
        self.assertEqual(self.requests, [])
        self.assertEqual(result.total_tests, 0)
        self.assertTrue(result.skipped_findings)

    async def test_proposal_count_and_total_budget_limits(self):
        for field in ['MAX_PROPOSALS', 'MAX_TOTAL_INPUT_CHARS']:
            with patch('test_generation.' + field, 0):
                result = await self.generate()
            self.assertEqual(result.tests, [])
            self.assertEqual(self.requests, [])
            self.assertTrue(result.skipped_findings)


if __name__ == '__main__':
    unittest.main()
