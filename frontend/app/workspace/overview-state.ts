import {proposalIdentity} from './proposal-identity';
import type {ReviewWorkspace} from './use-review-workspace';
import type {WorkspaceData} from './data';
import type {SectionId} from './types';
export type Stage = {title:string; detail:string; state:'idle'|'pending'|'done'|'attention'; section:SectionId};
export function overviewState(w:ReviewWorkspace,d:WorkspaceData) {
  const contextAttention=!!d.review?.context_warnings.length || !!w.agents?.senior_review.coverage_gaps.length;
  const reviewAttention=!!w.reviewError || !!w.agentError || !!d.review?.skipped_files.length || !!d.pr?.files_truncated ||
    !!d.review?.scanners.some(s=>['error','timeout','unavailable','partial'].includes(s.status)) ||
    !!w.agents?.agents.some(a=>['bug','security','performance'].includes(a.agent)&&['ERROR','PARTIAL'].includes(a.status));
  const roleFailed=(role:string)=>w.agents?.agents.some(a=>a.agent===role && ['ERROR','PARTIAL'].includes(a.status));
  const results=d.verification?.results ?? [];
  // Approval applies only to the exact proposal currently displayed, never a replaced artifact.
  const safeResults=results.filter(r=>r.status==='PASSED' && r.safe_to_apply && r.proposal && !r.compatibility.behavior_ambiguous && r.compatibility.compatible &&
    (!d.fixes || d.fixes.fixes.some(f=>r.proposal && proposalIdentity(f)===proposalIdentity(r.proposal))));
  const allVerified=results.length>0 && safeResults.length===results.length;
  const verificationAttention=(!!d.verification && !allVerified) || !!roleFailed('verification');
  const fixAttention=!!w.fixError || !!roleFailed('fix') || !!d.fixes?.rejected_fixes || !!d.fixes?.fixes.some(f=>!f.safe_to_verify || !f.compatibility.compatible || f.compatibility.behavior_ambiguous);
  const actionable=d.findings.filter(f=>f.status!=='Verified');
  const reviewing=w.reviewing || w.agentLoading;
  const stages:Stage[]=[
    {title:'Pull request',section:'files',state:w.loading?'pending':w.error?'attention':d.pr?'done':'idle',detail:w.loading?'Loading':w.error?'Load failed':d.pr?`${d.pr.changed_files} changed files`:'Not loaded'},
    {title:'Context',section:'context',state:reviewing?'pending':contextAttention?'attention':d.context.length?'done':'idle',detail:reviewing?'Requested with review':contextAttention?'Coverage needs review':d.context.length?`${d.context.length} selected files`:d.hasReview?'No context selected':'Awaiting review'},
    {title:'Review',section:'findings',state:reviewing?'pending':reviewAttention?'attention':d.hasReview?'done':'idle',detail:reviewing?'Review running':reviewAttention?'Incomplete coverage':d.hasReview?'Results returned':'Not started'},
    {title:'Findings',section:'findings',state:!d.hasReview?'idle':actionable.length?'attention':'done',detail:d.hasReview?`${d.findings.length} findings`:'Awaiting review'},
    {title:'Fixes',section:'fixes',state:w.fixing?'pending':fixAttention?'attention':d.fixes?.fixes.length?'done':'idle',detail:w.fixing?'Generating':fixAttention?'Human review required':d.fixes?`${d.fixes.total_fixes} proposals`:'No proposals'},
    {title:'Verification',section:'verification',state:w.verifying?'pending':w.verificationError||verificationAttention?'attention':allVerified?'done':'idle',detail:w.verifying?'Verifying':w.verificationError?'Request failed':d.verification?`${safeResults.length} approved · ${results.length-safeResults.length} not approved`:'Not verified'},
  ];
  const status=w.verifying?'VERIFYING':reviewing?'REVIEWING':w.verificationError||verificationAttention||fixAttention?'REVIEW REQUIRED':
    w.error||reviewAttention||contextAttention?'NEEDS ATTENTION':actionable.length?'NEEDS ATTENTION':allVerified?'VERIFIED':d.hasReview?'REVIEW COMPLETE':'LOADED';
  return {stages,status,safeResults,actionable};
}
