import {verificationIdentity, proposalIdentity} from './proposal-identity';
import type {ReviewWorkspace} from './use-review-workspace';
import type {SectionId} from './types';
import type {Finding} from '../review-findings';
export type DisplayFinding = Omit<Finding,'confidence'> & {confidence:number|null;id:string; source:string; findingId?:string; status:string; confidenceKnown:boolean; ruleId?:string};
export function workspaceData(w:ReviewWorkspace) {
  const pr=w.agents?.pr ?? w.review ?? w.analysis;
  const sameHead=<T extends {head_sha:string}>(value:T|null|undefined):T|null => value && value.head_sha===pr?.head_sha?value:null;
  const review=sameHead(w.review);
  const tests=sameHead(w.generated) ?? sameHead(w.agents?.tests);
  const fixes=sameHead(w.fixes) ?? sameHead(w.agents?.fixes);
  const baseVerification=sameHead(w.agents?.verification);
  const localVerification=sameHead(w.verification);
  const verificationResults=[...(localVerification?.results ?? []),...(baseVerification?.results ?? [])].filter((result,index,all)=>all.findIndex(candidate=>verificationIdentity(candidate)===verificationIdentity(result))===index);
  const verification=localVerification || baseVerification ? {
    ...(localVerification ?? baseVerification!), results:verificationResults,
    fixes_verified:verificationResults.filter(r=>r.status!=='SKIPPED').length,
    passed:verificationResults.filter(r=>r.status==='PASSED').length,
    failed:verificationResults.filter(r=>r.status==='FAILED').length,
    skipped:verificationResults.filter(r=>r.status==='SKIPPED').length,
  }:null;
  const hasReview=!!(w.agents || review);
  const context=w.agents?.repository_context ?? review?.repository_context ?? [];
  const findings:DisplayFinding[]=w.agents ? w.agents.findings.map(f=>({
    id:f.finding_id,findingId:f.finding_id,file:f.file,line:f.line,severity:f.severity,category:f.category,
    title:f.title,explanation:[f.explanation,...f.evidence.map(e=>`${e.source} / ${e.agent}: ${e.explanation}`)].join('\n\n'),
    suggested_fix:fixes?.fixes.find(p=>p.file===f.file && p.finding_id===f.finding_id)?.fixed_code ?? '',confidence:f.confidence,confidenceKnown:true,
    source:[...new Set(f.evidence.map(e=>e.source==='AI'?`${e.agent} agent`:e.source))].join(' + ') || f.source,
    status:f.status==='AMBIGUOUS'?'Ambiguous':f.status==='CONFIRMED'?'Pending':'Needs attention',
  })) : [
    ...(review?.ai_findings ?? []).map((f,i)=>({...f,id:`ai:${i}`,source:'AI',confidenceKnown:true,status:'Pending'})),
    ...(review?.static_findings ?? []).map((f,i)=>({...f,id:`static:${i}`,source:f.source==='bandit'?'Bandit':'Semgrep',
      ruleId:f.rule_id,suggested_fix:'',confidence:null,confidenceKnown:false,status:'Needs attention'})),
  ];
  for(const f of findings) {
    const fix=fixes?.fixes.find(p=>p.file===f.file && (p.finding_id===f.findingId || (p.finding?.file===f.file && p.finding.line===f.line && p.finding.title===f.title)));
    const result=verification?.results.find(v=>v.file===f.file && (fix ? !!v.proposal && proposalIdentity(v.proposal)===proposalIdentity(fix) : v.finding_id===f.findingId));
    const matchingProposal=!fix || (result?.proposal?.fixed_code===fix.fixed_code && result?.proposal?.unified_diff===fix.unified_diff);
    if(result && matchingProposal) f.status=result.status==='PASSED' && result.safe_to_apply && result.proposal ? 'Verified' : result.compatibility.behavior_ambiguous ? 'Ambiguous' : 'Needs attention';
    else if(fix?.compatibility.behavior_ambiguous) f.status='Ambiguous';
  }
  const staticEvidence=w.agents?.findings.filter(f=>f.evidence.some(e=>e.source==='Bandit'||e.source==='Semgrep')) ?? [];
  const counts:Partial<Record<SectionId,number>>={};
  if(pr && hasReview) counts.files=pr.files.length;
  if(hasReview) { counts.findings=findings.length; counts.security=findings.filter(f=>f.category==='Security').length;
    counts.static=w.agents?staticEvidence.length:review?.static_findings.length; counts.context=context.length; }
  if(w.agents) counts.agents=w.agents.agents.length;
  if(tests) counts.tests=tests.total_tests;
  if(fixes) counts.fixes=fixes.total_fixes;
  if(verification) counts.verification=verification.results.length;
  return {pr,review,tests,fixes,verification,hasReview,context,findings,staticEvidence,counts};
}
export type WorkspaceData=ReturnType<typeof workspaceData>;
