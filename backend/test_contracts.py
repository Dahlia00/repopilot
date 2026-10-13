import unittest
from unittest.mock import AsyncMock, patch
from contracts import BehavioralContract, BehaviorCase, compatibility, normalize_contract, static_outcome
from test_test_generation import contract, QUOTE, repository
from test_verification import fix, tests
from verification import verify_one


class ContractTests(unittest.TestCase):
    def test_explicit_contract_proves_fail_before_pass_after_semantics(self):
        proposal=fix(); test=tests().tests[0]
        result=compatibility(proposal,test,{'README.md':QUOTE})
        self.assertTrue(result.compatible)
        self.assertEqual(static_outcome(proposal.original_code,'choose',[[]]),('raises','IndexError'))
        self.assertEqual(static_outcome(proposal.fixed_code,'choose',[[]]),('raises','ValueError'))

    def test_reject_incompatible_fix_and_test(self):
        test=tests().tests[0]
        result=compatibility(fix(fixed_code='def choose(values):\n    return None'),test,{'README.md':QUOTE})
        self.assertFalse(result.compatible)
        self.assertIn('Proposed fix',result.reason)
        test.test_code=test.test_code.replace('ValueError','IndexError')
        result=compatibility(fix(),test,{'README.md':QUOTE})
        self.assertFalse(result.compatible)
        self.assertIn('Test expectations',result.reason)

    def test_inferred_missing_and_unverified_behavior_is_ambiguous(self):
        for candidate in [None,contract().model_copy(update={'contract_source':'inferred'}),
                          contract().model_copy(update={'evidence_quote':'invented'}),
                          contract().model_copy(update={'desired_behavior_confidence':50})]:
            normalized=normalize_contract(candidate,{'README.md':QUOTE},contract().finding_id,'sample.py','choose')
            self.assertTrue(normalized.behavior_ambiguous)
        result=compatibility(fix(),tests().tests[0],{})
        self.assertTrue(result.behavior_ambiguous)
        self.assertFalse(result.compatible)

    def test_implementation_fragment_is_not_desired_behavior_evidence(self):
        code='def choose(values):\n    return values[0]'
        candidate=contract().model_copy(update={'evidence_path':'sample.py','evidence_quote':code,'desired_behavior':code})
        normalized=normalize_contract(candidate,{'sample.py':code},candidate.finding_id,'sample.py','choose')
        self.assertTrue(normalized.behavior_ambiguous)

    def test_contracts_must_be_identical(self):
        test=tests().tests[0]
        test.contract=test.contract.model_copy(update={'desired_behavior':'Another behavior'})
        self.assertFalse(compatibility(fix(),test,{'README.md':QUOTE}).compatible)

    def test_current_behavior_characterization_cannot_be_regression_evidence(self):
        c=contract().model_copy(update={'desired_behavior':'choose([]) must raise IndexError.',
            'evidence_quote':'choose([]) must raise IndexError.',
            'cases':[BehaviorCase(arguments=[[]],outcome='raises',exception='IndexError')]})
        test=tests().tests[0]
        test.contract=c;test.test_code=test.test_code.replace('ValueError','IndexError')
        proposed=fix(fixed_code='def choose(values):\n    if not values:\n        raise IndexError("empty")\n    return values[0]',contract=c)
        result=compatibility(proposed,test,{'README.md':c.evidence_quote})
        self.assertFalse(result.compatible)
        self.assertIn('already pass',result.reason)


class PairTests(unittest.IsolatedAsyncioTestCase):
    async def test_incompatible_and_ambiguous_pairs_never_execute(self):
        cases=[fix(fixed_code='def choose(values):\n    return None'),fix(contract=None)]
        for proposed in cases:
            with patch('verification.execute_tests',new=AsyncMock(side_effect=AssertionError('Must reject before execution'))) as runner:
                result=await verify_one(proposed,repository(),tests())
            runner.assert_not_awaited()
            self.assertFalse(result.safe_to_apply)
            self.assertFalse(result.compatibility.compatible)

    async def test_real_synthetic_end_to_end_contract_without_openai(self):
        import os
        with patch.dict(os.environ,{'OPENAI_API_KEY':''}), patch('main.review_patches',new=AsyncMock(side_effect=AssertionError('No OpenAI'))):
            result=await verify_one(fix(),repository(),tests())
        if result.status=='SKIPPED' and 'sandbox' in result.verification_summary:
            self.skipTest(result.verification_summary)
        self.assertEqual(result.status,'PASSED',result.model_dump())
        self.assertTrue(result.safe_to_apply)
        self.assertTrue(result.compatibility.compatible)
        self.assertEqual(result.generated_test.failed,1)
        self.assertEqual(result.regression_tests.passed,1)
        self.assertEqual(result.bandit_after.status,'PASSED')
