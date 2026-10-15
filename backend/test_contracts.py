import unittest
from unittest.mock import AsyncMock, patch
from contracts import BehavioralContract, BehaviorCase, compatibility, contract_is_grounded, normalize_contract, static_outcome
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

    def test_server_clears_model_ambiguity_for_exact_function_docstring(self):
        candidate=contract().model_copy(update={'behavior_ambiguous':True, 'evidence_path':'sample.py'})
        source='def choose(values):\n    """'+QUOTE+'"""\n    return values[0]\n'
        self.assertTrue(contract_is_grounded(candidate,{'sample.py':source}))
        normalized=normalize_contract(candidate,{'sample.py':source},candidate.finding_id,'sample.py','choose')
        self.assertFalse(normalized.behavior_ambiguous)
        self.assertEqual(normalized.cases,candidate.cases)
        self.assertEqual(normalized.evidence_quote,QUOTE)
        self.assertTrue(candidate.behavior_ambiguous)  # Do not mutate the supplied model artifact.

    def test_model_ambiguity_does_not_bypass_evidence_requirements(self):
        candidate=contract().model_copy(update={'behavior_ambiguous':True, 'evidence_path':'sample.py'})
        sources=[
            'def choose(values):\n    """No boundary contract here."""\n    return values[0]\n',
            'def choose(values):\n    # '+QUOTE+'\n    return values[0]\n',
            'SPEC = "'+QUOTE+'"\ndef choose(values):\n    return values[0]\n',
        ]
        for source in sources:
            with self.subTest(source=source):
                self.assertFalse(contract_is_grounded(candidate,{'sample.py':source}))
                self.assertTrue(normalize_contract(candidate,{'sample.py':source},candidate.finding_id,'sample.py','choose').behavior_ambiguous)

    def test_existing_tests_grounding_ignores_model_flag_but_requires_matching_cases(self):
        source='import pytest\nfrom sample import choose\ndef test_boundary():\n    with pytest.raises(ValueError):\n        choose([])\n'
        candidate=contract().model_copy(update={'behavior_ambiguous':True,
            'contract_source':'existing_tests','evidence_path':'test_sample.py',
            'evidence_quote':source,'desired_behavior':source})
        evidence={'test_sample.py':source}
        self.assertTrue(contract_is_grounded(candidate,evidence))
        self.assertFalse(normalize_contract(candidate,evidence,candidate.finding_id,'sample.py','choose').behavior_ambiguous)
        wrong=candidate.model_copy(update={'cases':[BehaviorCase(arguments=[[]],outcome='raises',exception='IndexError')]})
        self.assertFalse(contract_is_grounded(wrong,evidence))
        self.assertTrue(normalize_contract(wrong,evidence,wrong.finding_id,'sample.py','choose').behavior_ambiguous)

    def test_server_keeps_all_grounding_and_identity_guards(self):
        for flag in [True,False]:
            for update in [
                {'desired_behavior_confidence':89}, {'contract_source':'inferred'},
                {'contract_source':'finding'}, {'cases':[]}, {'desired_behavior':None},
                {'desired_behavior':'Different specification'}, {'evidence_path':'missing.md'},
                {'evidence_quote':'Missing quote'}, {'finding_id':'other'},
                {'file':'other.py'}, {'function':'other'},
            ]:
                with self.subTest(flag=flag,update=update):
                    candidate=contract().model_copy(update={'behavior_ambiguous':flag,**update})
                    normalized=normalize_contract(candidate,{'README.md':QUOTE},contract().finding_id,'sample.py','choose')
                    self.assertTrue(normalized.behavior_ambiguous)
                    self.assertEqual((normalized.finding_id,normalized.file,normalized.function),(contract().finding_id,'sample.py','choose'))

    def test_text_spec_formats_remain_grounded_with_model_ambiguity(self):
        for path in ['README.md','behavior.txt','behavior.rst']:
            with self.subTest(path=path):
                candidate=contract().model_copy(update={'behavior_ambiguous':True,'evidence_path':path})
                self.assertFalse(normalize_contract(candidate,{path:QUOTE},candidate.finding_id,'sample.py','choose').behavior_ambiguous)

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
