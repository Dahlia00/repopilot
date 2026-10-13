import unittest
from unittest.mock import AsyncMock,patch
from agents import normalize_agents,deduplicate,senior_review,orchestrate,ArtifactStore
from test_test_generation import review,repository
from test_verification import scans,tests,fix,issue
from fix_generation import FixGenerationResponse
from verification import VerificationResponse


def artifacts():
    generated=tests()
    proposed=FixGenerationResponse(repository='owner/repo',pull_request=1,head_sha='a'*40,
        fixes=[fix()],skipped_findings=[],total_fixes=1,safe_fixes=1,rejected_fixes=0,test_proposals_used=1,test_artifacts=generated)
    verified=VerificationResponse(repository='owner/repo',pull_request=1,head_sha='a'*40,
        results=[],fixes_verified=0,passed=0,failed=0,skipped=0)
    return generated,proposed,verified


class AgentLogicTests(unittest.TestCase):
    def test_normalization_categories_dedup_evidence_and_ranking(self):
        security=review('Security')
        security.findings[0].title='SQL injection'
        security.findings[0].explanation='SQL injection in query'
        security.findings[0].severity='HIGH'
        static=scans([issue()])
        static.findings[0].title='SQL injection'
        static.findings[0].explanation='SQL injection observation'
        low=review();low.findings[0].severity='LOW'
        observations=normalize_agents({'security':security,'bug':low},static)
        combined=deduplicate(observations)
        self.assertEqual(len(combined),2)
        self.assertEqual(combined[0].severity,'HIGH')
        self.assertEqual({e.source for e in combined[0].evidence},{'AI','Bandit'})
        self.assertEqual(combined[0].status,'LIKELY')
        self.assertEqual(normalize_agents({'performance':security},scans()),[])

    def test_unknown_locations_do_not_merge(self):
        base=review();base.findings[0].line=None
        observations=normalize_agents({'bug':base},scans())
        second=observations[0].model_copy(update={'finding_id':'other'})
        self.assertEqual(len(deduplicate(observations+[second])),2)

    def test_senior_decision_is_evidence_only_and_advisory(self):
        _,_,verified=artifacts()
        finding=review();finding.findings[0].severity='HIGH'
        normalized=normalize_agents({'bug':finding},scans())
        self.assertEqual(senior_review(normalized,verified,[]).decision,'CHANGES_REQUESTED')
        self.assertEqual(senior_review([],verified,['Role failed']).decision,'REVIEW_RECOMMENDED')
        self.assertEqual(senior_review([],verified,[]).decision,'CLEAN')
        self.assertEqual(senior_review(normalized,verified,[]).verified_fixes,[])


class OrchestratorTests(unittest.IsolatedAsyncioTestCase):
    async def test_shared_snapshot_no_extra_review_calls_and_verification_authority(self):
        pr=review();snapshot=repository();generated,proposed,verified=artifacts()
        async def role_review(pr,client,snapshot,**kwargs):
            if 'Security Agent' in kwargs['role_instructions']: return review('Security')
            if 'Performance Agent' in kwargs['role_instructions']: return review('Performance')
            return review()
        with patch('agents.review_patches',new=AsyncMock(side_effect=role_review)) as review_mock, \
             patch('agents.generate_tests',new=AsyncMock(return_value=generated)) as test_mock, \
             patch('agents.generate_fixes',new=AsyncMock(return_value=proposed)) as fix_mock, \
             patch('agents.verify_fixes',new=AsyncMock(return_value=verified)) as verification_mock:
            result=await orchestrate(pr,snapshot,scans(),object())
        self.assertEqual(review_mock.await_count,3)
        self.assertEqual(test_mock.await_count,1)
        self.assertEqual(fix_mock.await_count,1)
        self.assertEqual(verification_mock.await_count,1)
        self.assertEqual({a.agent for a in result.agents},{'bug','security','performance','test','fix','verification'})
        self.assertEqual(result.senior_review.verified_fixes,[])
        self.assertFalse(result.github_writes_performed)
        store=ArtifactStore(capacity=1,ttl=-1);store.put(result,snapshot)
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):store.get(result.review_id,'owner/repo',1)

    async def test_role_failure_never_produces_clean_review(self):
        from fastapi import HTTPException
        generated,proposed,verified=artifacts()
        with patch('agents.review_patches',new=AsyncMock(side_effect=HTTPException(504,'Role failed'))), \
             patch('agents.generate_tests',new=AsyncMock(return_value=generated)), \
             patch('agents.generate_fixes',new=AsyncMock(return_value=proposed)), \
             patch('agents.verify_fixes',new=AsyncMock(return_value=verified)):
            result=await orchestrate(review(),repository(),scans(),object())
        self.assertEqual(result.senior_review.decision,'REVIEW_RECOMMENDED')
        self.assertTrue(result.senior_review.coverage_gaps)
