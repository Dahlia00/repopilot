/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
// Load the actual TS/TSX modules without adding a test framework or dependencies.
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
require.extensions['.css']=module=>{module.exports={};};
const {verificationRequest,assertSelectedResult,proposalIdentity}=require('../app/workspace/proposal-identity.ts');
const ProposedFixes=require('../app/proposed-fixes.tsx').default;
const {workspaceData}=require('../app/workspace/data.ts');
const contract={finding_id:'test-id',file:'backend/demo_discount.py',function:'apply_discount',cases:[],behavior_ambiguous:false};
const arithmetic={finding_id:'shared',file:contract.file,title:'Fix discount',original_code:'return price * (1 + percent / 100)',fixed_code:'return price * (1 - percent / 100)',unified_diff:'discount diff',contract,compatibility:{compatible:true,behavior_ambiguous:false},finding:{file:contract.file,line:2,title:'Discount bug'},sources:['AI'],safe_to_verify:true,validation_errors:[]};
const other={...arithmetic,file:'backend/test_demo_discount.py',title:'Fix test assertions',fixed_code:'assert result == 80',unified_diff:'test diff',contract:{...contract,file:'backend/test_demo_discount.py'},finding:{file:'backend/test_demo_discount.py',line:2}};
const savedTest={finding_id:'test-id',file:arithmetic.file,execution_safe:true,contract,test_code:'assert apply_discount(100,20) == 80'};
const source={repository:'owner/repo',pull_request:1,head_sha:'abc',fixes:[arithmetic,other],skipped_findings:[],test_artifacts:{repository:'owner/repo',pull_request:1,head_sha:'abc',tests:[{...savedTest,contract:other.contract,file:other.file},savedTest],findings:[{finding_id:'test-id',file:arithmetic.file,line:2}]}};
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
  assert.equal(verificationRequest(arithmetic,duplicate).validated_test,null);
});
test('selected local result is first and distinct proposals sharing an ID survive merging',()=>{
  const local={...arithmetic,proposal:arithmetic,status:'SKIPPED'};
  const agent={...other,proposal:other,status:'SKIPPED'};
  const snapshot={head_sha:'abc',results:[local]};
  const workspace={analysis:{head_sha:'abc'},review:null,generated:null,fixes:source,verification:snapshot,agents:{pr:{head_sha:'abc',files:[]},verification:{head_sha:'abc',results:[agent]},findings:[],repository_context:[],agents:[]}};
  assert.deepEqual(workspaceData(workspace).verification.results,[local,agent]);
});
