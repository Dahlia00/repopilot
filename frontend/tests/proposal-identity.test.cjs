/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
// Load the actual TS/TSX modules without adding a test framework or dependencies.
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
require.extensions['.css']=module=>{module.exports={};};
const {verificationRequest,assertSelectedResult,proposalIdentity,submitVerification}=require('../app/workspace/proposal-identity.ts');
const ProposedFixes=require('../app/proposed-fixes.tsx').default;
const {workspaceData}=require('../app/workspace/data.ts');
const contract={finding_id:'test-id',file:'backend/demo_discount.py',function:'apply_discount',contract_source:'existing_tests',evidence_path:'backend/test_demo_discount.py',evidence_quote:'assert apply_discount(100, 20) == 80',cases:[{arguments:[100,20],outcome:'returns',value:80,exception:null}],behavior_ambiguous:false};
const arithmetic={finding_id:'shared',file:contract.file,title:'Fix discount',finding_title:'Discount bug',explanation:'Correct the discount formula.',confidence:95,original_code:'return price * (1 + percent / 100)',fixed_code:'return price * (1 - percent / 100)',unified_diff:'discount diff',contract,compatibility:{compatible:true,behavior_ambiguous:false},finding:{file:contract.file,line:2,title:'Discount bug'},sources:['AI'],safe_to_verify:true,validation_errors:[]};
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
  assert.equal(overviewPresentation(workspace,blocked).title,'Needs review');
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

test('Findings cards preserve technical evidence behind disclosures',()=>{
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const FindingsCards=require('../app/workspace/findings-cards.tsx').default;
  const finding={id:'issue-1',findingId:'saved-id',severity:'HIGH',category:'Bug',file:'backend/demo_discount.py',line:12,title:'Incorrect discount calculation',explanation:'The price increases instead of decreasing.\n\nBandit / evidence: original technical details.',suggested_fix:'Use the documented discount formula.',confidence:95,confidenceKnown:true,source:'AI',status:'Pending',ruleId:'rule-1'};
  const html=renderToStaticMarkup(React.createElement(FindingsCards,{findings:[finding],reviewedFiles:[finding.file],skippedFiles:['skipped.py'],files:[{filename:finding.file,patch:'@@ -1 +1 @@\n-old\n+new'}]}));
  assert.match(html,/1 issue found/);
  assert.match(html,/Incorrect discount calculation/);
  assert.match(html,/line 12/);
  assert.match(html,/What this means/);
  assert.match(html,/View technical details/);
  assert.match(html,/original technical details/);
  assert.match(html,/95%/);
  assert.match(html,/saved-id/);
  assert.match(html,/rule-1/);
  assert.match(html,/Use the documented discount formula/);
  assert.match(html,/skipped.py/);
  assert.ok(!/<details[^>]*\bopen(?:\s|=|>)/.test(html));
  const empty=renderToStaticMarkup(React.createElement(FindingsCards,{findings:[],reviewedFiles:[],skippedFiles:[]}));
  assert.match(empty,/No issues found/);
  assert.match(empty,/didn&#x27;t find any review findings/);
});
test('Findings severity filters are exact, stable, and do not mutate input',()=>{
  const {visibleFindings}=require('../app/workspace/findings-cards.tsx');
  const input=[{severity:'LOW',id:'low'},{severity:'HIGH',id:'high1'},{severity:'CRITICAL',id:'critical'},{severity:'HIGH',id:'high2'}];
  assert.deepEqual(visibleFindings(input,'All').map(f=>f.id),['critical','high1','high2','low']);
  assert.deepEqual(visibleFindings(input,'HIGH').map(f=>f.id),['high1','high2']);
  assert.deepEqual(visibleFindings(input,'MEDIUM'),[]);
  assert.equal(input[0].id,'low');
});

test('Product shell retains every advanced destination behind More',()=>{
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const {Sidebar}=require('../app/workspace/shell.tsx');
  const html=renderToStaticMarkup(React.createElement(Sidebar,{active:'files',onSelect:()=>{},counts:{files:2}}));
  for(const label of ['Overview','Findings','Tests','Fixes','Verification','Changed files','Repository context','Static analysis','Security','Agents']) assert.ok(html.includes(label),label);
  assert.match(html,/More · Advanced tools/);
  assert.match(html,/<details[^>]*open/);
});
test('Test evidence is disclosed and verification approval never follows syntax alone',()=>{
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const GeneratedTests=require('../app/generated-tests.tsx').default;
  const Verification=require('../app/fix-verification.tsx').default;
  const sample={...savedTest,finding_title:'Discount bug',framework:'pytest',test_name:'test_price',purpose:'Existing repository test: backend/test_demo_discount.py',expected_behavior:'Apply a discount.',validation_errors:[]};
  const html=renderToStaticMarkup(React.createElement(GeneratedTests,{result:{head_sha:'a'.repeat(40),tests:[sample],contracts:[contract],total_tests:1,safe_tests:1,rejected_tests:0,skipped_findings:[]}}));
  assert.match(html,/Existing repository test/);
  assert.match(html,/Trusted repository test/);
  assert.ok(!html.includes('Expected behavior confirmed'));
  assert.match(html,/Why this test is trusted/);
  assert.ok(!/<details[^>]*\bopen(?:\s|=|>)/.test(html));
  const check={status:'PASSED',message:'Complete',collected:1,passed:1,failed:0,errors:0,stdout:'',stderr:'',findings:[]};
  const result={...arithmetic,proposal:arithmetic,status:'PASSED',safe_to_apply:false,compatibility:arithmetic.compatibility,syntax_check:check,generated_test:check,regression_tests:check,bandit_before:check,bandit_after:check,semgrep_before:check,semgrep_after:check,verification_summary:'No baseline failure.'};
  const markup=renderToStaticMarkup(React.createElement(Verification,{result:{head_sha:'a'.repeat(40),fixes_verified:1,passed:1,failed:0,skipped:0,results:[result]}}));
  assert.match(markup,/NEEDS REVIEW/);
  assert.ok(!markup.includes('VERIFICATION APPROVED'));
});

test('Top bar demotes repeat review and never reports idle Ready as PR success',()=>{
  const {renderToStaticMarkup}=require('react-dom/server');
  const {CommandBar,TopBar}=require('../app/workspace/shell.tsx');
  const props={repository:'owner/repo',pullRequest:'3',busy:false,reviewed:true,loading:false,reviewing:false,onRepository:()=>{},onPullRequest:()=>{},onReview:()=>{}};
  const React=require('react');
  const html=renderToStaticMarkup(React.createElement(CommandBar,props));
  assert.match(html, /type="submit" class="secondary-button"/);
  assert.match(html, /data-mobile-results="true"/);
  assert.match(html, /Run again/);
  assert.match(html, /Change PR/);
  assert.match(html, /owner\/repo/);
  const initial=renderToStaticMarkup(React.createElement(CommandBar,{...props,reviewed:false}));
  assert.match(initial,/data-mobile-results="false"/);
  assert.match(initial,/Run review/);
  assert.ok(!html.includes('>Ready<'));
  const trust=renderToStaticMarkup(TopBar({command:null}));
  assert.match(trust,/RepoPilot does not modify your repository automatically/);
  assert.match(trust,/Read only/);
});
test('Tests hands off to fixes; repeat generation is secondary',()=>{
  const Content=require('../app/workspace/content.tsx').default;
  let generated=0;let selected;
  const tests={...source.test_artifacts,tests:[{...savedTest,validation_errors:[]}],safe_tests:1,total_tests:1,rejected_tests:0};
  const workspace={generated:tests,agents:null,fixes:null,verification:null,busy:false,generateFixProposals:()=>{generated++;},generateTestProposals:()=>{}};
  const data={pr:{files:[],head_sha:source.head_sha},review:{reviewed_files:[]},findings:[],verification:null};
  const tree=Content({section:'tests',workspace,data,onSelect:id=>{selected=id;},onPreview:()=>{}});
  const actions=buttons(tree);
  const primary=actions.filter(button=>button.props.className!=='secondary-button');
  assert.equal(primary.length,1);
  primary[0].props.onClick();
  assert.equal(selected,'fixes');
  assert.equal(generated,1);
  assert.equal(actions.find(button=>button.props.onClick===workspace.generateTestProposals).props.className,'secondary-button');
});
test('Verification empty state offers exactly one Choose a fix action',()=>{
  const Content=require('../app/workspace/content.tsx').default;
  const {renderToStaticMarkup}=require('react-dom/server');
  let selected;
  const tree=Content({section:'verification',workspace:{agents:null,generated:null,fixes:null,verification:null},data:{pr:null,review:null,findings:[],verification:null},onSelect:id=>{selected=id;},onPreview:()=>{}});
  const actions=buttons(tree);
  assert.equal(actions.length,1);
  actions[0].props.onClick();
  assert.equal(selected,'fixes');
  const html=renderToStaticMarkup(tree);
  assert.match(html,/Verification hasn(?:&#x27;|')t started/);
  assert.match(html,/Choose a fix/);
  assert.match(html,/temporary isolation/);
});

test('Verification groups mixed decisions honestly and collapses raw details',()=>{
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const Verification=require('../app/fix-verification.tsx').default;
  const {verificationGroups,verificationReason}=require('../app/workspace/verification-presentation.ts');
  const check={status:'PASSED',message:'Original raw output',collected:1,passed:1,failed:0,errors:0,stdout:'raw stdout',stderr:'',findings:[]};
  const approved={...arithmetic,proposal:arithmetic,status:'PASSED',safe_to_apply:true,compatibility:{compatible:true,behavior_ambiguous:false,reason:'Exact contract'},syntax_check:check,generated_test:{...check,status:'FAILED'},regression_tests:check,bandit_before:check,bandit_after:check,semgrep_before:check,semgrep_after:check,verification_summary:'Baseline failed; after passed.'};
  const ambiguous={...approved,finding_id:'ambiguous',title:'Check boundary',status:'SKIPPED',safe_to_apply:false,compatibility:{compatible:false,behavior_ambiguous:true,reason:'Missing evidence-bound contract'},verification_summary:'Desired behavior is ambiguous or lacks authoritative repository evidence.'};
  const failed={...approved,finding_id:'failed',title:'Check syntax',status:'FAILED',safe_to_apply:false,syntax_check:{...check,status:'FAILED'},verification_summary:'Syntax failed.'};
  const groups=verificationGroups([approved,ambiguous,failed]);
  assert.deepEqual([groups.approved.length,groups.needsReview.length,groups.failed.length],[1,1,1]);
  assert.match(verificationReason(ambiguous),/trusted repository evidence/);
  const html=renderToStaticMarkup(React.createElement(Verification,{result:{head_sha:'abc',fixes_verified:2,passed:99,failed:1,skipped:1,results:[approved,ambiguous,failed]}}));
  assert.match(html,/Needs review/);
  assert.match(html,/Approved: <strong>1<\/strong>/);
  assert.match(html,/Needs review: <strong>1<\/strong>/);
  assert.match(html,/Failed: <strong>1<\/strong>/);
  assert.match(html,/1 fix approved/);
  assert.match(html,/Review unresolved results/);
  assert.match(html,/id="verification-approved"/);
  assert.match(html,/raw stdout/);
  assert.ok(!/<details[^>]*\bopen(?:\s|=|>)/.test(html));
  assert.ok(!html.slice(0,html.indexOf('<details')).includes('Missing evidence-bound contract'));
  const notApproved={...approved,safe_to_apply:false};
  assert.equal(verificationGroups([notApproved]).approved.length,0);
  assert.equal(verificationGroups([{...approved,status:'FAILED'}]).failed.length,1);
  const success=renderToStaticMarkup(React.createElement(Verification,{result:{head_sha:'abc',fixes_verified:1,passed:1,failed:0,skipped:0,results:[approved]}}));
  assert.match(success,/VERIFICATION APPROVED/);
  assert.match(success,/All checks passed for the approved proposals/);
  assert.ok(!success.includes('Review unresolved results'));
});
test('Overview copy uses approved and needs-review counts with singular grammar',()=>{
  const {countLabel}=require('../app/workspace/ui-copy.ts');
  assert.equal(countLabel(1,'test'),'1 test');
  assert.equal(countLabel(2,'fix'),'2 fixes');
  assert.equal(countLabel(1,'issue'),'1 issue');
});

test('Overview gives dynamic mixed, failed, success and pre-verification summaries',()=>{
  const {overviewPresentation}=require('../app/workspace/overview-state.ts');
  const w={agents:null,busy:false};
  const data={pr:{changed_files:1},hasReview:true,review:null,findings:[],context:[],tests:null,fixes:null,verification:null};
  const approved=id=>({finding_id:id,proposal:{...arithmetic,finding_id:id},status:'PASSED',safe_to_apply:true,compatibility:{compatible:true,behavior_ambiguous:false}});
  const pending=id=>({...approved(id),status:'SKIPPED',safe_to_apply:false,compatibility:{compatible:false,behavior_ambiguous:true}});
  const present=results=>overviewPresentation(w,{...data,verification:{results}});
  let view=present([approved('a'),pending('b')]);
  assert.equal(view.title,'1 fix verified · 1 needs review');
  assert.match(view.explanation,/1 item still needs your judgment/);
  assert.equal(view.next.title,'Review unresolved results');
  assert.equal(view.next.label,'View verification');
  assert.equal(view.stages[3].detail,'1 approved · 1 needs review');
  view=present([approved('a'),approved('b'),pending('c'),pending('d'),pending('e')]);
  assert.equal(view.title,'2 fixes verified · 3 need review');
  assert.match(view.explanation,/3 items still need your judgment/);
  view=present([approved('a'),{...pending('b'),status:'FAILED'}]);
  assert.equal(view.failed,1);
  assert.equal(view.needsReview,0);
  assert.equal(view.stages[3].detail,'1 approved · 1 failed');
  assert.equal(present([approved('a')]).title,'All verified fixes passed');
  assert.equal(overviewPresentation(w,data).title,'Your review is complete');
});

test('Approved summary explains expected baseline failure without hiding after-fix failures',()=>{
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const {CheckSummary}=require('../app/fix-verification.tsx');
  const {verificationGroup}=require('../app/workspace/verification-presentation.ts');
  const check={status:'PASSED',message:'Complete',collected:1,passed:1,failed:0,errors:0,stdout:'',stderr:'',findings:[]};
  const fix={...arithmetic,proposal:arithmetic,status:'PASSED',safe_to_apply:true,compatibility:{compatible:true,behavior_ambiguous:false},syntax_check:check,generated_test:{...check,status:'FAILED',passed:0,failed:1},regression_tests:check,bandit_before:check,bandit_after:check,semgrep_before:check,semgrep_after:check};
  const html=renderToStaticMarkup(React.createElement(CheckSummary,{fix}));
  assert.match(html,/Bug reproduced/);
  assert.match(html,/Failed on the original code as expected/);
  assert.match(html,/Passed after fix/);
  assert.match(html,/Regression verification sequence/);
  assert.ok(!html.includes('>Failed<'));
  const failed={...fix,status:'FAILED',safe_to_apply:false,regression_tests:{...check,status:'FAILED',passed:0,failed:1}};
  const failedHtml=renderToStaticMarkup(React.createElement(CheckSummary,{fix:failed}));
  assert.match(failedHtml,/Regression tests<\/strong><span[^>]*>FAILED<\/span>/);
  assert.ok(!failedHtml.includes('Bug reproduced'));
  assert.ok(!failedHtml.includes('Passed after fix'));
  assert.equal(verificationGroup(failed),'failed');
});

test('Responsive shell and Findings expose accessible mobile navigation controls',()=>{
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const AppShell=require('../app/workspace/shell.tsx').default;
  const Findings=require('../app/workspace/findings-cards.tsx').default;
  const shell=renderToStaticMarkup(React.createElement(AppShell,{active:'overview',onSelect:()=>{},counts:{},command:null},'Workspace'));
  assert.match(shell,/aria-label="Open navigation"/);
  assert.doesNotMatch(shell,/>Menu<\/button>/);
  assert.match(shell,/aria-label="Close navigation"/);
  assert.doesNotMatch(shell,/Close menu/);
  assert.match(shell,/<header[^>]*>[\s\S]*aria-label="Open navigation"[\s\S]*<\/header>/);
  assert.match(shell,/aria-controls="product-navigation"/);
  assert.match(shell,/aria-expanded="false"/);
  assert.equal((shell.match(/id="product-navigation"/g)||[]).length,1);
  const finding={id:'example',severity:'LOW',category:'Bug',file:'very/long/path/example.py',line:1,title:'Check a boundary',explanation:'Existing explanation.',suggested_fix:'Validate the input.',source:'AI',confidence:90,status:'Pending'};
  const html=renderToStaticMarkup(React.createElement(Findings,{findings:[finding],reviewedFiles:[finding.file],skippedFiles:[]}));
  assert.match(html,/data-detail-open="false"/);
  assert.match(html,/Back to findings/);
  assert.match(html,/aria-label="Selected finding"/);
});
