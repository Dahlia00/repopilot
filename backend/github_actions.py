"""Predefined GitHub actions. Default dry-run; never execute model action plans."""
import ast
import difflib
import json
import os
import re
import time
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field
from agents import STORE
from github import fetch_pull_request
from review import visible_new_lines
from verification import verify_one

SHA=re.compile(r'^[0-9a-f]{40}$')
SECRET=re.compile(r'(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|AKIA[A-Z0-9]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?i:password|passwd|api_key|secret|token)\s*=\s*[\"\'][^\"\']+[\"\'])')


def write_enabled():
    return os.environ.get('GITHUB_WRITE_ENABLED','false').strip().lower()=='true'


def redact(text):
    text=SECRET.sub('[REDACTED]',text)
    for key in ['GITHUB_TOKEN','OPENAI_API_KEY']:
        value=os.environ.get(key,'')
        if value: text=text.replace(value,'[REDACTED]')
    return text


def public_data(value):
    if isinstance(value,str): return redact(value)
    if isinstance(value,list): return [public_data(v) for v in value]
    if isinstance(value,dict): return {k:public_data(v) for k,v in value.items()}
    return value


def envelope(actions,available=True,reason='Preview only; no GitHub writes performed.',**details):
    return {'dry_run':True,'write_enabled':write_enabled(),'mode':'READ_ONLY' if not write_enabled() else 'WRITE_ENABLED_PREVIEW',
            'available':available,'reason':reason,'actions':actions,**details}


def review_plan(record):
    response=record.response;pr=response.pr
    comments=[]
    patches={f.filename:f.patch or '' for f in pr.files}
    for f in response.findings:
        if f.confidence<90 or f.line is None or f.status in {'AMBIGUOUS','INFORMATIONAL'} or f.line not in visible_new_lines(patches.get(f.file,'')):
            continue
        if len(comments)>=20: break
        comments.append({'path':f.file,'line':f.line,'side':'RIGHT',
            'body':redact(f'RepoPilot · {f.severity} · {f.title}\n\n{f.explanation}\n\nEvidence: '+', '.join(e.source for e in f.evidence))[:4000]})
    body='RepoPilot engineering review — advisory, human review required.\n\n'+response.senior_review.summary+'\n\n'
    body+='\n'.join(f'- {f.severity}: {f.title} ({f.file}:{f.line or "unknown"}; {f.status})' for f in response.findings[:30])
    action={'method':'POST','path':f'/repos/{pr.repository}/pulls/{pr.pull_request}/reviews',
            'json':{'commit_id':pr.head_sha,'event':'COMMENT','body':redact(body)[:12000],'comments':comments}}
    return envelope([action],head_sha=pr.head_sha)


def safe_branch(branch):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/-]{0,199}',branch) or '..' in branch or '@{' in branch or branch.endswith(('/', '.', '.lock')) or '//' in branch:
        raise HTTPException(422,'Unsafe target branch name.')
    if branch.lower() in {'main','master'}:
        raise HTTPException(409,'Fix automation refuses main/master targets; use a feature PR branch.')


def fix_plan(record,finding_id):
    response=record.response;pr=response.pr
    fix=next((f for f in response.fixes.fixes if f.finding_id==finding_id),None)
    verified=next((r for r in response.verification.results if r.finding_id==finding_id),None)
    if not fix or not verified or not fix.safe_to_verify or fix.validation_errors or not verified.safe_to_apply or verified.status!='PASSED' or not verified.compatibility.compatible:
        return envelope([],available=False,reason='No validated, compatible, deterministically verified fix is available for this finding.')
    try:
        safe_branch(pr.head_branch)
    except HTTPException as exc:
        return envelope([],available=False,reason=str(exc.detail))
    if not re.fullmatch(r'[A-Za-z0-9-]{1,80}',finding_id): raise HTTPException(422,'Unsafe finding ID.')
    source=next((f for f in record.snapshot.changed_files if f.path==fix.file),None)
    target=next((n for n in ast.parse(source.content).body if isinstance(n,ast.FunctionDef) and ast.get_source_segment(source.content,n)==fix.original_code),None) if source and source.content else None
    if target is None: raise HTTPException(409,'Verified source no longer matches the fix.')
    lines=source.content.splitlines(keepends=True)
    updated=''.join(lines[:target.lineno-1])+fix.fixed_code.rstrip('\n')+'\n'+''.join(lines[target.end_lineno:])
    tests=[t for t in response.tests.tests if t.contract==fix.contract and t.file==fix.file and t.execution_safe and not t.validation_errors]
    if len(tests)!=1: raise HTTPException(409,'Exactly one matching verified regression test is required.')
    test=tests[0]
    branch='repopilot/fix-'+finding_id
    # Dedicated, deterministic test path. Refuse overwrite in preflight below.
    test_path='tests/test_repopilot_'+finding_id.replace('-','_')+'.py'
    if any(redact(v)!=v for v in [updated,test.test_code,fix.unified_diff]):
        return envelope([],available=False,reason='Fix/test publication blocked because content may contain a secret.')
    title=redact('RepoPilot: '+fix.title)[:200]
    body=redact('Generated by RepoPilot. Human review is required. No merge or approval is automated.\n\n'+fix.explanation+'\n\n'+verified.verification_summary)
    actions=[
      {'method':'POST','path':f'/repos/{pr.head_repository}/git/trees','json':{'base_tree':'<head commit tree from validated GitHub response>','tree':[
        {'path':fix.file,'mode':'100644','type':'blob','content':updated},
        {'path':test_path,'mode':'100644','type':'blob','content':test.test_code}]}},
      {'method':'POST','path':f'/repos/{pr.head_repository}/git/commits','json':{'message':title,'tree':'<created tree SHA>','parents':[pr.head_sha]}},
      {'method':'POST','path':f'/repos/{pr.head_repository}/git/refs','json':{'ref':'refs/heads/'+branch,'sha':'<created commit SHA>'}},
      {'method':'POST','path':f'/repos/{pr.head_repository}/pulls','json':{'title':title,'body':body,'head':branch,'base':pr.head_branch,'draft':True}},
    ]
    return envelope(actions,head_sha=pr.head_sha,branch=branch,files=[fix.file,test_path],
        unified_diff=fix.unified_diff+''.join(difflib.unified_diff([],test.test_code.splitlines(keepends=True),fromfile='/dev/null',tofile='b/'+test_path)),regression_test=test.model_dump(),verification=verified.model_dump(),
        note='Placeholders identify SHA outputs of preceding fixed actions; no arbitrary actions are accepted.')


async def api(client,method,path,body=None,allow_missing=False):
    try:
        response=await client.request(method,path,json=body,follow_redirects=False)
    except httpx.TimeoutException as exc:
        raise HTTPException(504,'GitHub action timed out. Do not retry a write blindly; inspect remote state.') from exc
    except httpx.RequestError as exc:
        raise HTTPException(502,'GitHub action failed to connect. Inspect remote state before retrying.') from exc
    if allow_missing and response.status_code==404: return None
    if response.status_code in {403,429}: raise HTTPException(429,'GitHub permissions or rate limit prevented the action.')
    if response.status_code in {409,422}: raise HTTPException(409,'GitHub conflict; a branch/action may already exist. Nothing will be overwritten.')
    if response.status_code not in {200,201}: raise HTTPException(502,'GitHub rejected the predefined action. Inspect remote state before retrying.')
    try:
        value=response.json()
        if not isinstance(value,dict): raise ValueError()
        return value
    except ValueError as exc: raise HTTPException(502,'GitHub action returned malformed data.') from exc


def nested_sha(value,key):
    nested=value.get(key)
    if not isinstance(nested,dict): raise HTTPException(502,'GitHub returned malformed object metadata.')
    return sha(nested.get('sha'))


def sha(value):
    if not isinstance(value,str) or not SHA.fullmatch(value): raise HTTPException(502,'GitHub returned an invalid object SHA.')
    return value


async def current(client,record):
    stored=record.response.pr
    pr=await fetch_pull_request(client,stored.repository,stored.pull_request)
    if pr.head_sha!=stored.head_sha or pr.head_repository!=stored.head_repository or pr.head_branch!=stored.head_branch or pr.state!='open':
        raise HTTPException(409,'PR snapshot/state changed; run Agent Review again before writing.')
    return pr


def require_token():
    if not os.environ.get('GITHUB_TOKEN','').strip(): raise HTTPException(503,'GITHUB_TOKEN is required for explicitly enabled GitHub writes.')


async def post_review(record,client,confirm=False):
    plan=review_plan(record)
    if not write_enabled() or not confirm: return plan
    require_token()
    async with record.lock:
        if record.review_attempted: raise HTTPException(409,'This review write was already attempted; inspect GitHub before repeating.')
        await current(client,record)
        if record.expires <= time.monotonic(): raise HTTPException(409,'Review artifacts expired before publication.')
        record.review_attempted=True
        action=plan['actions'][0]
        data=await api(client,'POST',action['path'],action['json'])
        if type(data.get('id')) is not int or data['id']<=0 or data.get('state')!='COMMENTED' or data.get('commit_id')!=record.response.pr.head_sha:
            raise HTTPException(502,'GitHub review response is malformed; inspect GitHub before retrying.')
        return {'dry_run':False,'action':'post_review','review_id':data['id'],'head_sha':record.response.pr.head_sha}


async def create_fix_pr(record,client,finding_id,confirm=False):
    plan=fix_plan(record,finding_id)
    if not write_enabled() or not confirm: return plan
    if not plan['available']: raise HTTPException(409,plan['reason'])
    require_token()
    async with record.lock:
        if finding_id in record.fix_attempted: raise HTTPException(409,'Fix publication already attempted; inspect remote state before retrying.')
        pr=await current(client,record)
        base='/repos/'+pr.head_repository
        branch=plan['branch']
        if await api(client,'GET',base+'/git/ref/heads/'+quote(branch,safe='/'),allow_missing=True) is not None:
            raise HTTPException(409,'Fix branch already exists; it will not be overwritten.')
        if await api(client,'GET',base+'/contents/'+quote(plan['files'][1],safe='/')+'?ref='+pr.head_sha,allow_missing=True) is not None:
            raise HTTPException(409,'Generated test path already exists; it will not be overwritten.')
        ref=await api(client,'GET',base+'/git/ref/heads/'+quote(pr.head_branch,safe='/'))
        if nested_sha(ref,'object')!=pr.head_sha: raise HTTPException(409,'Target branch changed; regenerate artifacts.')
        fix=next(f for f in record.response.fixes.fixes if f.finding_id==finding_id)
        verified=await verify_one(fix,record.snapshot,record.response.tests)
        if not verified.safe_to_apply or verified.status!='PASSED': raise HTTPException(409,'Fresh deterministic verification failed; publication refused.')
        commit=await api(client,'GET',base+'/git/commits/'+pr.head_sha)
        tree_sha=nested_sha(commit,'tree')
        from github import github_json
        from context import MAX_TREE_RESPONSE_BYTES
        tree_data,_=await github_json(client,base+'/git/trees/'+tree_sha,params={'recursive':'1'},max_response_bytes=MAX_TREE_RESPONSE_BYTES)
        if not isinstance(tree_data,dict) or not isinstance(tree_data.get('tree'),list) or tree_data.get('truncated'):
            raise HTTPException(502,'GitHub tree coverage is incomplete; publication refused.')
        entry=next((e for e in tree_data['tree'] if isinstance(e,dict) and e.get('path')==fix.file),None)
        if not entry or entry.get('mode')!='100644' or entry.get('type')!='blob':
            raise HTTPException(409,'Fix publication requires an existing non-executable regular source file.')
        if record.expires <= time.monotonic(): raise HTTPException(409,'Review artifacts expired before publication.')
        record.fix_attempted.add(finding_id)
        actions=plan['actions']
        tree_body={**actions[0]['json'],'base_tree':tree_sha}
        tree=await api(client,'POST',actions[0]['path'],tree_body)
        commit_body={**actions[1]['json'],'tree':sha(tree.get('sha'))}
        created=await api(client,'POST',actions[1]['path'],commit_body)
        new_sha=sha(created.get('sha'))
        reference=await api(client,'POST',actions[2]['path'],{'ref':'refs/heads/'+branch,'sha':new_sha})
        if reference.get('ref')!='refs/heads/'+branch or nested_sha(reference,'object')!=new_sha:
            raise HTTPException(502,'GitHub branch response is malformed; inspect remote state.')
        latest=await api(client,'GET',base+'/git/ref/heads/'+quote(pr.head_branch,safe='/'))
        if nested_sha(latest,'object')!=pr.head_sha:
            raise HTTPException(409,'Target branch changed after fix branch creation; inspect remote state before continuing.')
        result=await api(client,'POST',actions[3]['path'],actions[3]['json'])
        if type(result.get('number')) is not int or result['number']<=0 or not isinstance(result.get('head'),dict) or not isinstance(result.get('base'),dict) or result['head'].get('ref')!=branch or result['base'].get('ref')!=pr.head_branch or result.get('draft') is not True:
            raise HTTPException(502,'GitHub PR response is malformed; inspect remote state.')
        if result['head'].get('sha')!=new_sha or result['base'].get('sha')!=pr.head_sha:
            raise HTTPException(409,'Created draft PR snapshot differs from verification; inspect it manually. No merge or approval occurred.')
        return {'dry_run':False,'action':'create_fix_pr','pull_request':result['number'],'repository':pr.head_repository,'branch':branch,'commit':new_sha}
