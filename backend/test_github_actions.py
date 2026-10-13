import os
import time
import unittest
from unittest.mock import AsyncMock,patch
import httpx
from fastapi import HTTPException
from agents import AgentReviewResponse,ReviewRecord,normalize_agents,senior_review
from github_actions import review_plan,fix_plan,post_review,create_fix_pr,safe_branch,api,redact
from test_agents import artifacts
from test_test_generation import review,repository
from test_verification import scans,fix,tests
from verification import VerificationResult,Check
from contracts import Compatibility


def record(verified=True):
    generated,proposed,verification=artifacts()
    verification.results=[VerificationResult(finding_id=proposed.fixes[0].finding_id,file='sample.py',title='Synthetic fix',
        proposal=proposed.fixes[0],status='PASSED' if verified else 'FAILED',safe_to_apply=verified,
        compatibility=Compatibility(compatible=verified,behavior_ambiguous=False,reason='Synthetic explicit contract'))]
    pr=review();pr.head_branch='feature';pr.files=[]
    findings=normalize_agents({'bug':pr},scans())
    response=AgentReviewResponse(review_id='a'*8+'-'+ 'a'*4+'-'+ 'a'*4+'-'+ 'a'*4+'-'+ 'a'*12,
        pr=pr,repository_context=[],agents=[],findings=findings,tests=generated,fixes=proposed,verification=verification,
        senior_review=senior_review(findings,verification,[]),recommended_github_actions=[])
    return ReviewRecord(response,repository(),time.monotonic()+600)


class PreviewTests(unittest.TestCase):
    def test_review_preview_event_is_only_comment(self):
        with patch.dict(os.environ,{'GITHUB_WRITE_ENABLED':'false'}):
            preview=review_plan(record())
        self.assertTrue(preview['dry_run'])
        self.assertEqual(preview['mode'],'READ_ONLY')
        self.assertEqual(preview['actions'][0]['json']['event'],'COMMENT')

    def test_no_unverified_fix_is_offered(self):
        preview=fix_plan(record(False),'issue-fixture')
        self.assertFalse(preview['available']);self.assertEqual(preview['actions'],[])
        preview=fix_plan(record(),None)
        self.assertFalse(preview['available'])

    def test_verified_fix_preview_contains_exact_files_test_and_evidence(self):
        preview=fix_plan(record(),'issue-fixture')
        self.assertTrue(preview['available'])
        self.assertEqual(preview['branch'],'repopilot/fix-issue-fixture')
        self.assertIn('sample.py',preview['files'])
        self.assertTrue(preview['verification']['safe_to_apply'])
        self.assertIn('test_empty',preview['regression_test']['test_code'])
        self.assertEqual([a['method'] for a in preview['actions']],['POST']*4)
        self.assertTrue(preview['actions'][-1]['json']['draft'])
        self.assertEqual(preview['actions'][-1]['json']['base'],'feature')

    def test_main_master_and_unsafe_branches_refused(self):
        for branch in ['main','master','../bad','x..y','x@{a','/main','a//b','a.lock']:
            with self.subTest(branch=branch),self.assertRaises(HTTPException):safe_branch(branch)
        rec=record();rec.response.pr.head_branch='main'
        self.assertFalse(fix_plan(rec,'issue-fixture')['available'])

    def test_secrets_are_redacted_and_not_publishable(self):
        token='ghp_'+'a'*30
        with patch.dict(os.environ,{'GITHUB_TOKEN':token}):self.assertNotIn(token,redact('token '+token))
        rec=record();rec.response.tests.tests[0].test_code+='\n# sk-'+'a'*30
        self.assertFalse(fix_plan(rec,'issue-fixture')['available'])


class WriteGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_or_unconfirmed_performs_zero_requests(self):
        for enabled,confirmed in [('false',True),('true',False),('',True)]:
            client=AsyncMock()
            with patch.dict(os.environ,{'GITHUB_WRITE_ENABLED':enabled,'GITHUB_TOKEN':'test-placeholder'}):
                result=await post_review(record(),client,confirmed)
                fix_result=await create_fix_pr(record(),client,'issue-fixture',confirmed)
            self.assertTrue(result['dry_run']);self.assertTrue(fix_result['dry_run'])
            client.request.assert_not_awaited()

    async def test_token_missing_and_unverified_fix_refused(self):
        with patch.dict(os.environ,{'GITHUB_WRITE_ENABLED':'true','GITHUB_TOKEN':''}):
            with self.assertRaises(HTTPException) as missing:await post_review(record(),AsyncMock(),True)
            self.assertEqual(missing.exception.status_code,503)
            with self.assertRaises(HTTPException) as unsafe:await create_fix_pr(record(False),AsyncMock(),'issue-fixture',True)
            self.assertEqual(unsafe.exception.status_code,409)

    async def test_duplicate_branch_and_stale_snapshot_prevent_write(self):
        rec=record()
        with patch.dict(os.environ,{'GITHUB_WRITE_ENABLED':'true','GITHUB_TOKEN':'placeholder'}), \
             patch('github_actions.current',new=AsyncMock(return_value=rec.response.pr)), \
             patch('github_actions.api',new=AsyncMock(return_value={'ref':'existing'})) as api_mock:
            with self.assertRaises(HTTPException) as duplicate:await create_fix_pr(rec,AsyncMock(),'issue-fixture',True)
        self.assertEqual(duplicate.exception.status_code,409)
        self.assertTrue(all(call.args[1]=='GET' for call in api_mock.await_args_list))
        stale=rec.response.pr.model_copy(update={'head_sha':'b'*40})
        with patch.dict(os.environ,{'GITHUB_WRITE_ENABLED':'true','GITHUB_TOKEN':'placeholder'}), \
             patch('github_actions.fetch_pull_request',new=AsyncMock(return_value=stale)):
            with self.assertRaises(HTTPException) as error:await post_review(rec,AsyncMock(),True)
        self.assertEqual(error.exception.status_code,409)

    async def test_mocked_review_write_and_duplicate_attempt(self):
        rec=record()
        async with httpx.AsyncClient(base_url='https://api.github.com',transport=httpx.MockTransport(lambda req:httpx.Response(200,json={'id':1,'state':'COMMENTED','commit_id':'a'*40}))) as client:
            with patch.dict(os.environ,{'GITHUB_WRITE_ENABLED':'true','GITHUB_TOKEN':'placeholder'}),patch('github_actions.current',new=AsyncMock(return_value=rec.response.pr)):
                result=await post_review(rec,client,True)
                self.assertFalse(result['dry_run'])
                with self.assertRaises(HTTPException):await post_review(rec,client,True)

    async def test_mocked_fix_pr_publication_uses_only_predefined_actions(self):
        rec=record(); requests=[]
        branch='repopilot/fix-issue-fixture'
        def transport(request):
            requests.append(request)
            path=request.url.path
            if request.method=='GET':
                if path.endswith('/git/ref/heads/'+branch) or '/contents/' in path:
                    return httpx.Response(404,json={'message':'Not found'})
                if path.endswith('/git/ref/heads/feature'):
                    return httpx.Response(200,json={'object':{'sha':'a'*40}})
                if '/git/commits/' in path:
                    return httpx.Response(200,json={'sha':'a'*40,'tree':{'sha':'b'*40}})
                if '/git/trees/' in path:
                    return httpx.Response(200,json={'truncated':False,'tree':[{'path':'sample.py','type':'blob','mode':'100644'}]})
            if path.endswith('/git/trees'):return httpx.Response(201,json={'sha':'c'*40})
            if path.endswith('/git/commits'):return httpx.Response(201,json={'sha':'d'*40})
            if path.endswith('/git/refs'):return httpx.Response(201,json={'ref':'refs/heads/'+branch,'object':{'sha':'d'*40}})
            if path.endswith('/pulls'):return httpx.Response(201,json={'number':2,'head':{'ref':branch,'sha':'d'*40},'base':{'ref':'feature','sha':'a'*40},'draft':True})
            raise AssertionError('Unexpected GitHub action '+path)
        async with httpx.AsyncClient(base_url='https://api.github.com',transport=httpx.MockTransport(transport)) as client:
            with patch.dict(os.environ,{'GITHUB_WRITE_ENABLED':'true','GITHUB_TOKEN':'test-placeholder'}), \
                 patch('github_actions.current',new=AsyncMock(return_value=rec.response.pr)), \
                 patch('github_actions.verify_one',new=AsyncMock(return_value=rec.response.verification.results[0])) as verify:
                result=await create_fix_pr(rec,client,'issue-fixture',True)
        verify.assert_awaited_once()
        self.assertFalse(result['dry_run'])
        posts=[r for r in requests if r.method=='POST']
        self.assertEqual(len(posts),4)
        self.assertFalse(any(r.method in {'PATCH','DELETE','PUT'} for r in requests))
        import json
        self.assertEqual(json.loads(posts[2].content)['ref'],'refs/heads/'+branch)
        self.assertTrue(json.loads(posts[-1].content)['draft'])

    async def test_malformed_review_receipt_stops_unsafe_retry(self):
        rec=record()
        async with httpx.AsyncClient(base_url='https://api.github.com',transport=httpx.MockTransport(lambda req:httpx.Response(200,json={}))) as client:
            with patch.dict(os.environ,{'GITHUB_WRITE_ENABLED':'true','GITHUB_TOKEN':'test-placeholder'}),patch('github_actions.current',new=AsyncMock(return_value=rec.response.pr)):
                with self.assertRaises(HTTPException) as error:await post_review(rec,client,True)
        self.assertEqual(error.exception.status_code,502)
        self.assertTrue(rec.review_attempted)

    async def test_fresh_verification_failure_prevents_all_git_writes(self):
        rec=record()
        async def fake_api(client,method,path,body=None,allow_missing=False):
            if allow_missing:return None
            return {'object':{'sha':'a'*40}}
        with patch.dict(os.environ,{'GITHUB_WRITE_ENABLED':'true','GITHUB_TOKEN':'test-placeholder'}), \
             patch('github_actions.current',new=AsyncMock(return_value=rec.response.pr)), \
             patch('github_actions.api',new=AsyncMock(side_effect=fake_api)) as calls, \
             patch('github_actions.verify_one',new=AsyncMock(return_value=VerificationResult(finding_id='issue-fixture',file='sample.py',title='Rejected'))):
            with self.assertRaises(HTTPException):await create_fix_pr(rec,AsyncMock(),'issue-fixture',True)
        self.assertTrue(all(call.args[1]=='GET' for call in calls.await_args_list))

    async def test_api_failure_malformed_response_and_timeout(self):
        for status,data in [(500,{}),(200,[]),(422,{}),(403,{})]:
            async with httpx.AsyncClient(base_url='https://api.github.com',transport=httpx.MockTransport(lambda req:httpx.Response(status,json=data))) as client:
                with self.assertRaises(HTTPException):await api(client,'POST','/repos/owner/repo/pulls/1/reviews',{})
        async def timeout(req):raise httpx.ReadTimeout('test timeout',request=req)
        async with httpx.AsyncClient(base_url='https://api.github.com',transport=httpx.MockTransport(timeout)) as client:
            with self.assertRaises(HTTPException) as error:await api(client,'POST','/repos/owner/repo/pulls/1/reviews',{})
        self.assertEqual(error.exception.status_code,504)

class ActionEndpointTests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from agents import STORE
        from main import app
        from github import get_github_client
        self.app=app;self.store=STORE;self.rec=record();self.spy=AsyncMock()
        self.store.records[self.rec.response.review_id]=self.rec
        async def client():yield self.spy
        self.app.dependency_overrides[get_github_client]=client
        self.addCleanup(self.app.dependency_overrides.clear)
        self.addCleanup(self.store.records.clear)
        self.client=TestClient(app);self.addCleanup(self.client.close)
        self.payload={'repository':'owner/repo','pull_request':1,'review_id':self.rec.response.review_id}

    def test_preview_routes_are_always_dry_even_when_switch_and_confirmation_true(self):
        with patch.dict(os.environ,{'GITHUB_WRITE_ENABLED':'true'}):
            response=self.client.post('/github/preview-review',json={**self.payload,'confirm_write':True})
        self.assertEqual(response.status_code,200,response.text)
        self.assertTrue(response.json()['dry_run'])
        self.spy.request.assert_not_awaited()

    def test_disabled_write_route_returns_preview(self):
        with patch.dict(os.environ,{'GITHUB_WRITE_ENABLED':'false'}):
            response=self.client.post('/github/post-review',json={**self.payload,'confirm_write':True})
        self.assertEqual(response.status_code,200,response.text)
        self.assertTrue(response.json()['dry_run'])
        self.spy.request.assert_not_awaited()

    def test_arbitrary_urls_actions_branches_and_nonboolean_confirmation_refused(self):
        for extra in [{'url':'https://example.com'},{'action':'merge'},{'branch':'main'},{'confirm_write':'true'}]:
            response=self.client.post('/github/post-review',json={**self.payload,**extra})
            self.assertEqual(response.status_code,422,response.text)
        self.spy.request.assert_not_awaited()

    def test_record_binding_and_expiry(self):
        response=self.client.post('/github/preview-review',json={**self.payload,'repository':'different/repo'})
        self.assertEqual(response.status_code,422)
        self.rec.expires=0
        response=self.client.post('/github/preview-review',json=self.payload)
        self.assertEqual(response.status_code,404)
