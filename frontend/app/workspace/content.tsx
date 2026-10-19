import type {SectionId} from './types';
import {ReviewIllustration, ProductIcon} from './product-primitives';
import productStyles from './product-ui.module.css';
import type {ReviewWorkspace} from './use-review-workspace';
import type {WorkspaceData} from './data';
import {sections} from './shell';
import Overview from './overview';
import ChangedFiles from './changed-files';
import ReviewFindings from '../review-findings';
import FindingsCards from './findings-cards';
import StaticAnalysis, {ReviewSummary} from '../static-analysis';
import AgentDashboard from '../agent-dashboard';
import GeneratedTests from '../generated-tests';
import ProposedFixes from '../proposed-fixes';
import Verification from '../fix-verification';
import RepositoryContext from '../repository-context';
function EmptySection({text}: {text:string}) {return <p className="section-empty">{text}</p>;}
function Skeleton({label}: {label:string}) {return <div className="section-skeleton" role="status" aria-label={label}><span/><span/><span/><p>{label}</p></div>;}
export default function WorkspaceContent({section,workspace:w,data:d,previewCount,onSelect,onPreview,savedPreview}: {section:SectionId;workspace:ReviewWorkspace;data:WorkspaceData;
  previewCount?:number;onSelect:(id:SectionId)=>void;onPreview:(reviewId:string,value:unknown)=>void;savedPreview?:unknown}) {
  const files=d.pr?.files ?? [];
  const tests=w.generated ?? w.agents?.tests;
  const fixes=w.fixes ?? w.agents?.fixes;
  const verification=d.verification ?? w.verification ?? w.agents?.verification;
  const artifact=section==='tests'?tests:section==='fixes'?fixes:section==='verification'?verification:null;
  const reviewFiles=d.review?.reviewed_files ?? [...new Set(d.findings.map(f=>f.file))];
  const safeTests=!!tests?.tests.some(test=>test.execution_safe && !test.validation_errors.length);
  const errors=[w.error,w.reviewError,w.generationError,w.fixError,w.verificationError,w.agentError].filter(Boolean);
  return <>
    {errors.map((message,i)=><p className="error" role="alert" key={`${i}:${message}`}>{message}</p>)}
    {section!=='overview' && <div className={`canvas-heading ${section==='fixes'||section==='files'?productStyles.pageHero:''}`}><div><p className="section-kicker">Workspace / {sections.find(s=>s.id===section)?.label}</p><h1>{sections.find(s=>s.id===section)?.label}</h1></div>{(section==='fixes'||section==='files') && <ReviewIllustration/>}</div>}
    {artifact && artifact.head_sha!==d.pr?.head_sha && <p className="notice">These artifacts use commit <code>{artifact.head_sha.slice(0,12)}</code>, which differs from the loaded review. This section shows its own snapshot; the Overview does not merge its verification status.</p>}
    <div key={section} className="section-reveal">
      {section==='overview' && <Overview workspace={w} data={d} previewCount={previewCount} onSelect={onSelect}/>}
      {section==='files' && (w.loading?<Skeleton label="Loading changed files…"/>:d.pr?<ChangedFiles pr={d.pr}/>:<EmptySection text="Load a pull request to inspect its changed files and patches."/>)}
      {section==='findings' && (w.reviewing?<Skeleton label="Review request running…"/>:d.hasReview?<FindingsCards findings={d.findings} fileScopeLabel={d.review?'Reviewed files':'Files with observations'} reviewedFiles={reviewFiles} skippedFiles={d.review?.skipped_files ?? []} files={files}/>:<EmptySection text="Load a PR, then run a review to see findings."/>)}
      {section==='security' && (d.hasReview?<ReviewFindings findings={d.findings.filter(f=>f.category==='Security')} fileScopeLabel={d.review?'Reviewed files':'Files with observations'} reviewedFiles={reviewFiles} skippedFiles={d.review?.skipped_files ?? []} files={files}/>:<EmptySection text="Security observations appear after a review."/>)}
      {section==='static' && (w.reviewing?<Skeleton label="Static analysis is included in the review request…"/>:d.review?<><ReviewSummary summary={d.review.summary}/><StaticAnalysis findings={d.review.static_findings} scanners={d.review.scanners} skippedFiles={d.review.static_skipped_files}/></>:
        d.hasReview?<><p className="notice">These are merged agent observations with scanner evidence. Run review for raw scanner reports and original severities.</p><ReviewFindings findings={d.findings.filter(f=>d.staticEvidence.some(o=>o.finding_id===f.findingId))} fileScopeLabel={d.review?'Reviewed files':'Files with observations'} reviewedFiles={reviewFiles} skippedFiles={[]} files={files}/></>:<EmptySection text="Run review to see scanner findings and coverage reports."/>)}
      {section==='agents' && <><div className="section-actions"><button type="button" disabled={!w.analysis || w.busy} onClick={w.runAgentReview}>{w.agentLoading?'Review request running…':'Run agent review'}</button><p className="muted small">Bounded specialist roles. GitHub preview actions never publish.</p></div>
        {w.agentLoading?<Skeleton label="Waiting for specialist review and artifact results…"/>:w.agents?<AgentDashboard result={w.agents} embeddedArtifacts={false} onPreview={onPreview} savedPreview={savedPreview}/>:<EmptySection text="Load a PR to run specialist reviews. Tests, fixes and verification have their own sections."/>}</>}
      {section==='tests' && <>{safeTests && !w.generating && <section className={productStyles.workflowAction}><div><h2>Expected behavior confirmed</h2><p>A saved test establishes the expected behavior. {fixes?'Continue to the saved proposals.':'Next, create a proposed fix.'}</p></div><button type="button" disabled={w.busy || !fixes && !d.review} onClick={()=>{onSelect('fixes');if(!fixes) void w.generateFixProposals();}}>{fixes?'Review fixes':'Generate fixes'} <span aria-hidden="true">→</span></button></section>}<div className="section-actions"><button type="button" className={tests?'secondary-button':undefined} disabled={!d.review || w.busy} onClick={w.generateTestProposals}>{w.generating?'Generating…':tests?'Regenerate tests':'Generate tests'}</button><p className="muted small">Tests are validated here. Execution happens in Verification.</p></div>
        {w.generating?<Skeleton label="Generating test proposals…"/>:tests?<GeneratedTests result={tests}/>:<EmptySection text="Run a review first, or use tests returned by agent review."/>}</>}
      {section==='fixes' && <><div className="section-actions"><button type="button" className={fixes?'secondary-button':undefined} disabled={!d.review || w.busy} onClick={w.generateFixProposals}>{w.fixing?'Generating…':fixes?'Generate again':'Generate fixes'}</button><p className="muted small">Uses saved test artifacts when available. No repository files are modified.</p></div>
        {w.fixing?<Skeleton label="Generating fix proposals…"/>:fixes?<ProposedFixes result={fixes} onVerify={fix=>{onSelect('verification');void w.verifyFixProposal(fix,fixes);}} busy={w.busy}/>:<EmptySection text="Run a review first, or inspect proposals returned by agent review."/>}</>}
      {section==='verification' && (w.verifying?<Skeleton label="Verifying this fix… Running isolated tests and security checks."/>:verification?<Verification result={verification}/>:<section className={productStyles.verificationEmpty}><span className={productStyles.icon}><ProductIcon kind="verify"/></span><h2>Verification hasn&apos;t started</h2><p>Choose a validated fix first. RepoPilot will run tests and security checks before approving it.</p><button type="button" onClick={()=>onSelect('fixes')}>Choose a fix <span aria-hidden="true">→</span></button><small>Checks run in temporary isolation. Nothing is applied to your repository.</small></section>)}
      {section==='context' && (d.hasReview?<RepositoryContext files={d.context} warnings={d.review?.context_warnings ?? w.agents?.senior_review.coverage_gaps ?? []}
        skippedFiles={d.review?.skipped_file_details ?? []} repository={d.pr?.repository ?? ''} commit={w.agents?.pr.head_sha ?? d.review?.head_sha ?? ''}/>:<EmptySection text="Selected repository context is returned by review and agent review. Loading PR metadata alone does not select context."/>)}
    </div>
  </>;
}
