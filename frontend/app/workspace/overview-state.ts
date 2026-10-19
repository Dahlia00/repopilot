import {countLabel} from './ui-copy';
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
  const failed=results.filter(result=>result.status==='FAILED').length;
  const needsReview=results.length-safeResults.length-failed;
  const verificationCopy=[`${safeResults.length} approved`,needsReview?`${needsReview} ${needsReview===1?'needs':'need'} review`:null,failed?`${failed} failed`:null].filter(Boolean).join(' · ');
  const verificationAttention=(!!d.verification && !allVerified) || !!roleFailed('verification');
  const fixAttention=!!w.fixError || !!roleFailed('fix') || !!d.fixes?.rejected_fixes || !!d.fixes?.fixes.some(f=>!f.safe_to_verify || !f.compatibility.compatible || f.compatibility.behavior_ambiguous);
  const actionable=d.findings.filter(f=>f.status!=='Verified');
  const reviewing=w.reviewing || w.agentLoading;
  const stages:Stage[]=[
    {title:'Pull request',section:'files',state:w.loading?'pending':w.error?'attention':d.pr?'done':'idle',detail:w.loading?'Loading':w.error?'Load failed':d.pr?countLabel(d.pr.changed_files,'changed file'):'Not loaded'},
    {title:'Context',section:'context',state:reviewing?'pending':contextAttention?'attention':d.context.length?'done':'idle',detail:reviewing?'Requested with review':contextAttention?'Coverage needs review':d.context.length?countLabel(d.context.length,'selected file'):d.hasReview?'No context selected':'Awaiting review'},
    {title:'Review',section:'findings',state:reviewing?'pending':reviewAttention?'attention':d.hasReview?'done':'idle',detail:reviewing?'Review running':reviewAttention?'Some issues still need review':d.hasReview?'Results returned':'Not started'},
    {title:'Findings',section:'findings',state:!d.hasReview?'idle':actionable.length?'attention':'done',detail:d.hasReview?countLabel(d.findings.length,'finding'):'Awaiting review'},
    {title:'Fixes',section:'fixes',state:w.fixing?'pending':fixAttention?'attention':d.fixes?.fixes.length?'done':'idle',detail:w.fixing?'Generating':fixAttention?'Needs review':d.fixes?countLabel(d.fixes.total_fixes,'proposal'):'No proposals'},
    {title:'Verification',section:'verification',state:w.verifying?'pending':w.verificationError||verificationAttention?'attention':allVerified?'done':'idle',detail:w.verifying?'Verifying':w.verificationError?'Request failed':d.verification?verificationCopy:'Not verified'},
  ];
  const status=w.verifying?'VERIFYING':reviewing?'REVIEWING':w.verificationError||verificationAttention||fixAttention?'REVIEW REQUIRED':
    w.error||reviewAttention||contextAttention?'NEEDS ATTENTION':actionable.length?'NEEDS ATTENTION':allVerified?'VERIFIED':d.hasReview?'REVIEW COMPLETE':'LOADED';
  return {stages,status,safeResults,actionable,failed,needsReview,allVerified,verificationCopy};
}

/** Presentation only: existing review/approval decisions remain authoritative. */
export function overviewPresentation(w:ReviewWorkspace,d:WorkspaceData) {
  const state=overviewState(w,d);
  const safeTests=d.tests?.tests.filter(test=>test.execution_safe && !test.validation_errors.length).length ?? 0;
  const readyFixes=d.fixes?.fixes.filter(fix=>fix.safe_to_verify && fix.compatibility.compatible && !fix.compatibility.behavior_ambiguous).length ?? 0;
  const approved=state.safeResults.length;
  const blocked=state.status==='REVIEW REQUIRED';
  const hasVerification=!!d.verification?.results.length;
  const verificationTitle=state.allVerified?'All verified fixes passed':approved?`${countLabel(approved,'fix')} verified${state.needsReview?` · ${state.needsReview} ${state.needsReview===1?'needs':'need'} review`:''}${state.failed?` · ${state.failed} failed`:''}`:state.needsReview?'Needs review':'Verification failed';
  const verificationExplanation=state.allVerified?'RepoPilot verified the exact proposed fixes. Nothing has been applied to your repository.':`RepoPilot approved what it could verify.${state.needsReview?` ${countLabel(state.needsReview,'item')} still ${state.needsReview===1?'needs':'need'} your judgment.`:''}${state.failed?` ${countLabel(state.failed,'item')} failed verification checks.`:''}`;
  const title=w.loading?'Loading your pull request':w.verifying?'Checking the proposed fix':w.reviewing||w.agentLoading?'Reviewing your pull request':
    w.generating?'Preparing tests':w.fixing?'Preparing proposed fixes':hasVerification?verificationTitle:blocked?'Needs review':
    state.actionable.length?'This PR needs attention':state.status==='NEEDS ATTENTION'?'This review needs attention':approved?'This fix passed verification':d.hasReview?'Your review is complete':'Your pull request is loaded';
  const explanation=w.loading?'RepoPilot is retrieving the changes from GitHub.':w.busy?'You can explore the available results while this step finishes.':
    hasVerification?verificationExplanation:blocked?'Some items need more evidence before RepoPilot can approve a proposed change. Review the details before moving forward.':
    state.actionable.length?'RepoPilot found issues to review before this pull request is merged.':state.status==='NEEDS ATTENTION'?'Some parts of the review are incomplete. Check the coverage and any reported errors before deciding to merge.':approved?'Verification approved the exact proposed change. Nothing has been applied to your repository.':
    d.hasReview?'No unresolved findings are shown. Review coverage and details before deciding to merge.':'Start a review to understand the changes and identify issues.';
  type Next={title:string;detail:string;label:string;section:SectionId;action?:'review'|'tests'|'fixes'};
  let next:Next;
  if(w.verificationError || d.verification && state.stages[5].state==='attention') next={title:'Review unresolved results',detail:'See which fixes were approved and which results still need your judgment.',label:'View verification',section:'verification'};
  else if(!d.hasReview) next={title:'Review this pull request',detail:'Check the changes for bugs, security issues, and code quality.',label:'Run review',section:'overview',action:'review'};
  else if(!state.actionable.length && approved) next={title:'This fix passed verification',detail:'Inspect the evidence for the exact proposal before taking any action.',label:'View verification',section:'verification'};
  else if(!d.findings.length) next={title:'Explore the reviewed changes',detail:'No review findings returned. Check the changed files and review coverage.',label:'View changed files',section:'files'};
  else if(readyFixes) next={title:'Verify the proposed fix',detail:'Choose a proposal and check it against its saved test before considering application.',label:'Review fixes',section:'fixes'};
  else if(!safeTests) next=d.tests?{title:'Review the test proposals',detail:'No tests passed the safety checks. Inspect the reasons before continuing.',label:'Review tests',section:'tests'}:
    {title:'Confirm expected behavior',detail:'Prepare focused tests using the review findings and repository evidence.',label:'Generate tests',section:'tests',action:'tests'};
  else if(!d.fixes) next={title:'Create a proposed fix',detail:'Use the saved tests to guide a small, focused change.',label:'Generate fixes',section:'fixes',action:'fixes'};
  else next={title:'Review the proposed changes',detail:'Some proposals need your judgment before they can be verified.',label:'Review fixes',section:'fixes'};
  const stages:Stage[]=[
    {...state.stages[2],title:'Review',detail:w.loading?'Loading PR':state.stages[2].detail,state:w.loading?'pending':state.stages[2].state},
    {title:'Test',section:'tests',state:w.generating?'pending':w.generationError||!!d.tests?.rejected_tests?'attention':safeTests?'done':'idle',detail:w.generating?'Preparing tests':w.generationError?'Needs review':safeTests?`${safeTests} ready to use`:d.tests?'No usable tests':'Not started'},
    {...state.stages[4],title:'Fix'}, {...state.stages[5],title:'Verify'},
  ];
  return {...state,title,explanation,next,stages,safeTests,readyFixes,approved,
    tone:w.busy?'running':blocked||state.actionable.length||state.status==='NEEDS ATTENTION'?'attention':approved||d.hasReview?'complete':'idle'};
}
