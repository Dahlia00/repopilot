"""No generated code execution: arithmetic policy and full pipeline regression fixtures."""
import ast
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from contracts import static_outcome, Unknown
from verification import computation_errors, execution_source_errors, verify_one, Check
from test_generation import generate_tests, ModelProposal
from test_existing_test_reuse import client_with
from test_test_generation import repository, review
from context import FullChangedFile
from fix_generation import generate_fixes
from pipeline import combine_review
from static_analysis import StaticResult
from test_verification import scans
import json


class ArithmeticTests(unittest.TestCase):
    def test_four_numeric_operators(self):
        for expression,expected in [('x+y',9),('x-y',3),('x*y',18),('x/y',2),('x*(1-y/100)',5.82)]:
            with self.subTest(expression=expression):
                source=f'def calculate(x,y):\n    return {expression}\n'
                self.assertEqual(execution_source_errors(source,'calculate'),[])
                self.assertEqual(static_outcome(source,'calculate',[6,3]),('returns',expected))

    def test_discount_before_after(self):
        for sign,expected in [('+',120),('-',80)]:
            source=f'def apply_discount(price,percent):\n    return price * (1 {sign} percent / 100)\n'
            self.assertEqual(execution_source_errors(source,'apply_discount'),[])
            self.assertEqual(static_outcome(source,'apply_discount',[100,20]),('returns',expected))

    def test_zero_nonfinite_size_and_nonnumeric_rejected(self):
        for expression,args in [('x/y',[1,0]),('x*y',[10000,10000]),('x/y',[1,1e-300]),
                                ('x+y',['a','b']),('x*y',[[1],2]),('x+y',[True,2]),
                                ('x+y',[float('nan'),2]),('x+y',[float('inf'),2])]:
            with self.subTest(expression=expression,args=args):
                with self.assertRaises(Unknown):
                    static_outcome(f'def calculate(x,y):\n    return {expression}', 'calculate',args)
        self.assertTrue(computation_errors(ast.parse('1 / 0')))
        self.assertTrue(computation_errors(ast.parse('1e999 + 1')))

    def test_unsupported_and_dangerous_nodes_remain_rejected(self):
        for expression in ['x**y','x//y','x%y','x<<y','x&y','x|y','x^y',
                           'x[0]*y','len(x)*y','x.real+y','[x]*y','"a"*y',
                           '(lambda: x)()*y','sum(v for v in x)*y','eval(x)*y']:
            source=f'def calculate(x,y):\n    return {expression}'
            with self.subTest(expression=expression):
                self.assertTrue(execution_source_errors(source,'calculate'))
                with self.assertRaises(Unknown):
                    static_outcome(source,'calculate',[2,1])


class ArithmeticPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_existing_test_arithmetic_fix_compatibility_and_verification(self):
        before='def apply_discount(price, percent):\n    return price * (1 + percent / 100)\n'
        after=before.replace('1 +','1 -')
        ai=review(file='backend/demo_discount.py')
        ai.findings[0].line=2
        repo=repository()
        repo.context_files=[]
        repo.changed_files=[FullChangedFile(path=ai.findings[0].file,status='modified',patch=None,content=before),
            FullChangedFile(path='backend/test_demo_discount.py',status='added',patch=None,
                content='from demo_discount import apply_discount\ndef test_discount():\n    assert apply_discount(100, 20) == 80\n')]
        tests=await generate_tests(ai,repo,client_with(SimpleNamespace(status='completed',output_parsed=ModelProposal(proposal=None,reason='Existing test'))))
        self.assertEqual(tests.safe_tests,1)
        async def generate(**kwargs):
            payload=json.loads(kwargs['input'])
            return SimpleNamespace(status='completed',output_parsed={'proposal':{
                'finding_id':payload['finding_id'],'file':payload['file'],'title':'Correct arithmetic',
                'explanation':'Match the existing test.','original_code':before.rstrip(),'fixed_code':after.rstrip(),
                'confidence':95,'safe_to_verify':True},'reason':''})
        client=client_with()
        client.responses.parse.side_effect=generate
        fixes=await generate_fixes(combine_review(ai,StaticResult(findings=[],scanners=[],skipped_files=[])),repo,tests,client)
        self.assertTrue(fixes.fixes[0].compatibility.compatible,fixes.fixes[0].compatibility.reason)
        async def run(root):
            self.assertEqual((root/'tests'/'test_proposal_0.py').read_text(),tests.tests[0].test_code)
            code=(root/'target'/'backend'/'demo_discount.py').read_text()
            # Trusted AST evaluator checks expected before/after; pytest itself is mocked.
            outcome=static_outcome(code,'apply_discount',[100,20])
            self.assertEqual(outcome,('returns',120 if root.name=='before' else 80))
            return Check(status='FAILED',failed=1,exit_code=1) if root.name=='before' else Check(status='PASSED',passed=1,exit_code=0)
        with patch('verification.execute_tests',side_effect=run) as execution, patch('verification.run_static_analysis',new=AsyncMock(side_effect=[scans(),scans()])):
            result=await verify_one(fixes.fixes[0],repo,tests)
        self.assertEqual(execution.call_count,2)
        self.assertEqual(result.status,'PASSED',result.verification_summary)
        self.assertTrue(result.safe_to_apply)
