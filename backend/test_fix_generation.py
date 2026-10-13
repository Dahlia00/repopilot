"""Proposals are inert strings: validation tests never execute fixed code."""
import ast
import json
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException
from openai import AsyncOpenAI

from fix_generation import FixProposal, generate_fixes, validate_fix, target_function
from pipeline import combine_review
from static_analysis import StaticResult, StaticFinding
from test_generation import TestGenerationResponse
from test_test_generation import review, repository, SOURCE

FIX = 'def choose(values):\n    if not values:\n        raise ValueError("Expected nonempty values")\n    return values[0]'


def proposal(code=FIX, **overrides):
    values = dict(finding_id='id', file='sample.py', title='Validate input', explanation='Reject invalid empty input.',
                  original_code=SOURCE.rstrip('\n'), fixed_code=code, confidence=85, safe_to_verify=True)
    values.update(overrides)
    return FixProposal(**values)


def tests():
    return TestGenerationResponse(repository='owner/repo', pull_request=1, head_sha='a'*40,
        findings=[], tests=[], skipped_findings=[], total_tests=0, safe_tests=0, rejected_tests=0)


class ValidationTests(unittest.TestCase):
    def validate(self, code=FIX, **overrides):
        return validate_fix(proposal(code, **overrides), SOURCE, target_function(SOURCE, 2))

    def test_valid_fix_and_server_generated_diff(self):
        errors, diff = self.validate()
        self.assertEqual(errors, [])
        self.assertIn('--- a/sample.py', diff)
        self.assertIn('+++ b/sample.py', diff)
        self.assertIn('+    if not values:', diff)

    def test_invalid_syntax_and_structure(self):
        for code in ['def broken(', 'print("x")', FIX+'\ndef another():\n    pass', FIX.replace('choose(values)', 'choose(other)'), '@decorator\n'+FIX]:
            self.assertTrue(self.validate(code)[0])

    def test_exact_match_and_noop(self):
        self.assertTrue(self.validate(original_code='wrong')[0])
        self.assertTrue(self.validate(SOURCE.rstrip())[0])

    def test_reject_new_multi_value_return_contract(self):
        errors, _ = self.validate('def choose(values):\n    return values, ()')
        self.assertTrue(any('caller contract' in error for error in errors))

    def test_reject_unsafe_code(self):
        for expression in ['subprocess.run(["ls"])', 'os.system("echo hi")', 'eval(values)', 'exec(values)',
                           'open("file", "w")', 'requests.get("https://example.com")',
                           'shutil.rmtree("/")', 'values.__class__', 'getattr(values, "x")',
                           '"rm -rf /"', '"sk-placeholderabcdefghijklmnop"',
                           'password = "hardcoded"', 'password = "hard" + "coded"',
                           'data = {"api_key": "credential"}', 'len = values', 'values.attr = "x"',
                           'import os', 'from subprocess import run']:
            code = 'def choose(values):\n    '+expression+'\n    return values[0]'
            with self.subTest(expression=expression):
                self.assertTrue(self.validate(code)[0])

    def test_existing_network_call_cannot_be_changed(self):
        content = 'import requests as r\ndef choose(values):\n    return r.get(values)\n'
        p = proposal('def choose(values):\n    return r.get("https://new.example")',
                     original_code=content.split('\n',1)[1].rstrip())
        self.assertTrue(validate_fix(p, content, target_function(content, 3))[0])

    def test_preserves_other_functions(self):
        content = SOURCE + '\ndef untouched():\n    return 42\n'
        errors, diff = validate_fix(proposal(), content, target_function(content, 2))
        self.assertEqual(errors, [])
        self.assertNotIn('-def untouched', diff)
        self.assertNotIn('+def untouched', diff)

    def test_diff_handles_source_without_final_newline(self):
        content = SOURCE.rstrip('\n')
        errors, diff = validate_fix(proposal(), content, target_function(content, 2))
        self.assertEqual(errors, [])
        self.assertTrue(diff.endswith('\n'))
        self.assertNotIn('values[0]+', diff)

    def test_unsupported_locations(self):
        self.assertIsNone(target_function(SOURCE, None))
        self.assertIsNone(target_function(SOURCE, 50))
        self.assertIsNone(target_function('invalid(', 1))


class GenerationTests(unittest.IsolatedAsyncioTestCase):
    async def generate(self, transform=None, file='sample.py', static=False):
        self.requests = []
        def transport(request):
            body = json.loads(request.content)
            self.requests.append(body)
            payload = json.loads(body['input'])
            data = {'proposal': proposal(finding_id=payload['finding_id'], file=payload['file']).model_dump(), 'reason':''}
            if transform:
                data = transform(data)
            return httpx.Response(200,json={'id':'resp_fix','object':'response','created_at':1,'model':'test',
                'status':'completed','output':[{'id':'msg_fix','type':'message','role':'assistant','status':'completed',
                'content':[{'type':'output_text','text':json.dumps(data),'annotations':[]}]}]})
        ai = review(file=file)
        scanner = StaticResult(findings=[], scanners=[], skipped_files=[])
        if static:
            ai.findings = []
            scanner.findings = [StaticFinding(source='bandit', severity='HIGH', category='Security', file=file,
                line=2, rule_id='B000', title='Synthetic vulnerability', explanation='Synthetic evidence')]
        pipeline = combine_review(ai, scanner)
        async with AsyncOpenAI(api_key='test-placeholder',max_retries=0,
                http_client=httpx.AsyncClient(transport=httpx.MockTransport(transport))) as client:
            return await generate_fixes(pipeline, repository(), tests(), client)

    async def test_valid_generation_uses_full_source_and_strict_json(self):
        result = await self.generate()
        self.assertEqual((result.total_fixes,result.safe_fixes,result.rejected_fixes),(1,1,0))
        self.assertEqual(result.fixes[0].sources, ['AI'])
        self.assertIn('+    if not values:',result.fixes[0].unified_diff)
        body = self.requests[0]
        self.assertFalse(body['store'])
        self.assertTrue(body['text']['format']['strict'])
        self.assertEqual(json.loads(body['input'])['full_content'],SOURCE)

    async def test_static_only_issue_is_used(self):
        result = await self.generate(static=True)
        self.assertEqual(result.fixes[0].sources,['bandit'])
        self.assertEqual(json.loads(self.requests[0]['input'])['evidence'][0]['rule_id'],'B000')

    async def test_invalid_and_unsafe_rejected(self):
        for code in ['def broken(', 'def choose(values):\n    return eval(values)']:
            def transform(data):
                data['proposal']['fixed_code']=code
                return data
            result = await self.generate(transform)
            self.assertEqual(result.rejected_fixes,1)
            self.assertFalse(result.fixes[0].safe_to_verify)

    async def test_wrong_identity_and_model_unsafe(self):
        for field, value in [('file','wrong.py'), ('finding_id','wrong'), ('safe_to_verify',False)]:
            def transform(data):
                data['proposal'][field]=value
                return data
            result = await self.generate(transform)
            self.assertEqual(result.rejected_fixes,1)

    async def test_malformed_response(self):
        with self.assertRaises(HTTPException) as error:
            await self.generate(lambda data:{'unexpected':1})
        self.assertEqual(error.exception.status_code,502)

    async def test_declined_and_unsupported(self):
        result=await self.generate(lambda data:{'proposal':None,'reason':'Insufficient API context'})
        self.assertEqual(result.total_fixes,0)
        self.assertEqual(result.skipped_findings[0].reason,'Insufficient API context')
        result=await self.generate(file='sample.ts')
        self.assertEqual(self.requests,[])
        self.assertEqual(result.total_fixes,0)

    async def test_accepted_test_evidence_same_commit_only(self):
        from test_generation import ValidatedProposal
        result_tests = tests()
        result_tests.tests = [ValidatedProposal(finding_id='test-id', finding_title='Empty input',
            file='sample.py', framework='pytest', test_name='test_empty',
            test_code='from sample import choose\ndef test_empty():\n    assert choose([1]) == 1',
            purpose='Check input', expected_behavior='First value returned', execution_safe=True,
            validation_errors=[])]
        with patch(__name__+'.tests', return_value=result_tests):
            result = await self.generate()
        self.assertEqual(result.test_proposals_used, 1)
        self.assertEqual(len(json.loads(self.requests[0]['input'])['unexecuted_test_proposals']), 1)
        result_tests.head_sha = 'b'*40
        with patch(__name__+'.tests', return_value=result_tests):
            result = await self.generate()
        self.assertEqual(result.test_proposals_used, 0)

    async def test_fix_generation_consumes_shared_contract_unchanged(self):
        from test_verification import tests as shared_tests
        artifacts=shared_tests()
        with patch(__name__+'.tests',return_value=artifacts):
            result=await self.generate()
        payload=json.loads(self.requests[0]['input'])
        self.assertEqual(payload['behavioral_contract'],artifacts.contracts[0].model_dump())
        self.assertEqual(result.fixes[0].contract,artifacts.contracts[0])
        self.assertTrue(result.fixes[0].compatibility.compatible)

    async def test_limits(self):
        for limit in ['MAX_FIXES','MAX_INPUT_CHARS','MAX_TOTAL_INPUT_CHARS']:
            with patch('fix_generation.'+limit,0):
                result=await self.generate()
            self.assertEqual(self.requests,[])
            self.assertTrue(result.skipped_findings)
