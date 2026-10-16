/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
// Load the actual TS/TSX modules without adding a test framework or dependencies.
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
require.extensions['.css']=module=>{module.exports={};};
const {verificationRequest,assertSelectedResult,proposalIdentity,submitVerification}=require('../app/workspace/proposal-identity.ts');
const ProposedFixes=require('../app/proposed-fixes.tsx').default;
const {workspaceData}=require('../app/workspace/data.ts');
const contract={finding_id:'test-id',file:'backend/demo_discount.py',function:'apply_discount',contract_source:'existing_tests',evidence_path:'backend/test_demo_discount.py',evidence_quote:'assert apply_discount(100, 20) == 80',cases:[{arguments:[100,20],outcome:'returns',value:80,exception:null}],behavior_ambiguous:false};
const arithmetic={finding_id:'shared',file:contract.file,title:'Fix discount',original_code:'return price * (1 + percent / 100)',fixed_code:'return price * (1 - percent / 100)',unified_diff:'discount diff',contract,compatibility:{compatible:true,behavior_ambiguous:false},finding:{file:contract.file,line:2,title:'Discount bug'},sources:['AI'],safe_to_verify:true,validation_errors:[]};
const other={...arithmetic,file:'backend/test_demo_discount.py',title:'Fix test assertions',fixed_code:'assert result == 80',unified_diff:'test diff',contract:{...contract,file:'backend/test_demo_discount.py'},finding:{file:'backend/test_demo_discount.py',line:2}};
const savedTest={finding_id:'test-id',file:arithmetic.file,execution_safe:true,contract,test_code:'assert apply_discount(100,20) == 80'};
const source={repository:'owner/repo',pull_request:1,head_sha:'abc',fixes:[arithmetic,other],skipped_findings:[],test_artifacts:{repository:'owner/repo',pull_request:1,head_sha:'abc',tests:[{...savedTest,contract:other.contract,file:other.file},savedTest],findings:[{finding_id:'test-id',file:arithmetic.file,line:42}]}};
function buttons(node,output=[]) {if(!node||typeof node!=='object')return output;if(node.type==='button')output.push(node);for(const child of [node.props?.children].flat(Infinity)) buttons(child,output);return output;}
test('first fix card sends the exact arithmetic artifact despite duplicate IDs',()=>{
  let selected;
  const tree=ProposedFixes({result:source,busy:false,onVerify:fix=>{selected=fix;}});
  buttons(tree)[0].props.onClick();
  assert.equal(selected,arithmetic);
  const request=verificationRequest(selected,source);
  assert.deepEqual(JSON.parse(JSON.stringify(request)).validated_fix,arithmetic);
  assert.equal(request.validated_test,savedTest);
  assert.notEqual(proposalIdentity(arithmetic),proposalIdentity(other));
  assertSelectedResult(selected,{...selected,proposal:selected});
  assert.throws(()=>assertSelectedResult(selected,{...other,proposal:other}),/different proposal/);
});
test('response cannot substitute a different revision or contract of the same finding',()=>{
  assert.throws(()=>assertSelectedResult(arithmetic,{...arithmetic,proposal:{...arithmetic,original_code:'other'}}));
  assert.throws(()=>assertSelectedResult(arithmetic,{...arithmetic,proposal:{...arithmetic,contract:other.contract}}));
});
test('ambiguous test matching fails closed rather than choosing first',()=>{
  const duplicate={...source,test_artifacts:{...source.test_artifacts,tests:[savedTest,{...savedTest}]}};
  assert.throws(()=>verificationRequest(arithmetic,duplicate),/multiple safe saved tests/);
});
test('selected local result is first and distinct proposals sharing an ID survive merging',()=>{
  const local={...arithmetic,proposal:arithmetic,status:'SKIPPED'};
  const agent={...other,proposal:other,status:'SKIPPED'};
  const snapshot={head_sha:'abc',results:[local]};
  const workspace={analysis:{head_sha:'abc'},review:null,generated:null,fixes:source,verification:snapshot,agents:{pr:{head_sha:'abc',files:[]},verification:{head_sha:'abc',results:[agent]},findings:[],repository_context:[],agents:[]}};
  assert.deepEqual(workspaceData(workspace).verification.results,[local,agent]);
});

test('card click posts the exact saved test even when refreshed finding lines differ',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return {ok:true,json:async()=>({...arithmetic,proposal:arithmetic,status:'SKIPPED'})};
  };
  const tree=ProposedFixes({result:source,busy:false,onVerify:fix=>submitVerification(fix,source,'http://localhost:8000',fetcher)});
  // The actual card callback starts the same submission helper as the workspace hook.
  await buttons(tree)[0].props.onClick();
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'http://localhost:8000/verify-fix');
  const payload=calls[0].body;
  assert.deepEqual(payload.validated_fix,arithmetic);
  assert.deepEqual(payload.validated_test,savedTest);
  assert.equal(payload.validated_test.contract.contract_source,'existing_tests');
  assert.equal(payload.validated_test.contract.evidence_path,'backend/test_demo_discount.py');
  assert.deepEqual(payload.validated_test.contract,arithmetic.contract);
  assert.notEqual(payload.validated_fix.file,other.file);
});
test('no exact safe test prevents fetch entirely',async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;throw new Error('Must never send');};
  const variants=[
    {...source,test_artifacts:null},
    {...source,test_artifacts:{...source.test_artifacts,head_sha:'other-head'}},
    {...source,test_artifacts:{...source.test_artifacts,tests:[{...savedTest,execution_safe:false}]}},
    {...source,test_artifacts:{...source.test_artifacts,tests:[{...savedTest,contract:other.contract}]}},
  ];
  for(const state of variants) await assert.rejects(submitVerification(arithmetic,state,'http://localhost:8000',fetcher),/no exact safe saved test/);
  assert.equal(calls,0);
});

test('Overview guides loaded, reviewed, tested, fix-ready, and blocked states honestly',()=>{
  const {overviewPresentation}=require('../app/workspace/overview-state.ts');
  const workspace={agents:null,busy:false};
  const data={pr:{changed_files:1},review:null,hasReview:false,findings:[],context:[],verification:null,fixes:null,tests:null};
  assert.equal(overviewPresentation(workspace,data).next.label,'Run review');
  const reviewed={...data,hasReview:true,findings:[{status:'Pending'}]};
  assert.equal(overviewPresentation(workspace,reviewed).title,'This PR needs attention');
  assert.equal(overviewPresentation(workspace,reviewed).next.label,'Generate tests');
  const tested={...reviewed,tests:{tests:[{execution_safe:true,validation_errors:[]}]}};
  assert.equal(overviewPresentation(workspace,tested).next.label,'Generate fixes');
  const fixed={...tested,fixes:{fixes:[arithmetic]}};
  assert.equal(overviewPresentation(workspace,fixed).next.label,'Review fixes');
  const blocked={...fixed,verification:{results:[{...arithmetic,proposal:arithmetic,status:'SKIPPED',safe_to_apply:false,compatibility:{compatible:false,behavior_ambiguous:true}}]}};
  assert.equal(overviewPresentation(workspace,blocked).title,'A human review is needed');
  assert.equal(overviewPresentation(workspace,blocked).next.label,'View verification');
  assert.equal(overviewPresentation({...workspace,verifying:true,busy:true},fixed).title,'Checking the proposed fix');
});

test('Overview renders explicit test/fix states and the PR title without description text',()=>{
  const {renderToStaticMarkup}=require('react-dom/server');
  const Overview=require('../app/workspace/overview.tsx').default;
  const workspace={agents:null,busy:false,analysis:{},reviewing:false};
  const data={pr:{title:'Demo verification flow',body:'Add demo discount behavior for verification flow',repository:'owner/repo',pull_request:1,changed_files:1,files:[],head_sha:'abcdef0123456789',head_branch:'feature',base_branch:'main',additions:2,deletions:1},review:null,hasReview:true,findings:[],context:[],verification:null,fixes:null,tests:null,counts:{}};
  let markup=renderToStaticMarkup(Overview({workspace,data,onSelect:()=>{}}));
  assert.equal((markup.match(/Not ready/g)||[]).length,2);
  assert.match(markup,/<h3[^>]*>Demo verification flow<\/h3>/);
  assert.match(markup,/<summary>Pull request description<\/summary><p>Add demo discount behavior for verification flow<\/p>/);
  assert.ok(!markup.includes('Problems returned by the review'));
  const ready={...data,tests:{tests:[{execution_safe:true,validation_errors:[]}]},fixes:{fixes:[arithmetic]}};
  markup=renderToStaticMarkup(Overview({workspace,data:ready,onSelect:()=>{}}));
  assert.match(markup,/1 safe/);
  assert.match(markup,/1 ready/);
});

test('PR title and body stay separate through normalization during and after review',()=>{
  const {renderToStaticMarkup}=require('react-dom/server');
  const Overview=require('../app/workspace/overview.tsx').default;
  const pr={title:'Demo verification flow',body:'Add demo discount behavior for verification flow',repository:'owner/repo',pull_request:3,changed_files:1,files:[],head_sha:'a'.repeat(40),head_branch:'demo',base_branch:'main',additions:2,deletions:1};
  const reviewed={...pr,reviewed_files:[],ai_findings:[],static_findings:[],scanners:[],skipped_files:[],context_warnings:[],repository_context:[]};
  for(const complete of [false,true]) {
    const workspace={analysis:pr,review:complete?reviewed:null,reviewing:!complete,agents:null,generated:null,fixes:null,verification:null,busy:!complete};
    const data=workspaceData(workspace);
    assert.equal(data.pr.title,pr.title);
    const markup=renderToStaticMarkup(Overview({workspace,data,onSelect:()=>{}}));
    assert.match(markup,/<h3[^>]*>Demo verification flow<\/h3>/);
    assert.equal(data.pr.body,pr.body);
    assert.match(markup,/<summary>Pull request description<\/summary><p>Add demo discount behavior for verification flow<\/p>/);
    assert.ok(!markup.includes(pr.title+pr.body));
  }
});
