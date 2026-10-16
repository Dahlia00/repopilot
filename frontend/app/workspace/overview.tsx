import type {ReviewWorkspace} from './use-review-workspace';
import type {WorkspaceData} from './data';
import type {SectionId} from './types';
import PipelineFlow from './pipeline-flow';
import RepoContextGraph from './repo-context-graph';
import {overviewPresentation} from './overview-state';
import styles from './overview.module.css';
const rank={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
function SummaryIcon({kind}:{kind:'issues'|'tests'|'fixes'|'verify'}) {
  const paths={issues:'M12 8v5m0 3h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',tests:'M8 3h8m-6 0v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8',fixes:'m5 19 14-14M12 5h7v7M5 11V5h6',verify:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3m-4 9 3 3 5-6'};
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}
export default function Overview({workspace:w,data:d,onSelect}: {workspace:ReviewWorkspace;data:WorkspaceData;previewCount?:number;onSelect:(id:SectionId)=>void}) {
  if(!d.pr) return <div className={styles.empty}><span className={styles.heroIcon}><SummaryIcon kind="verify"/></span><p className={styles.eyebrow}>NEW REVIEW</p><h1>{w.loading?'Loading your pull request':'Review with confidence'}</h1><p>Enter a GitHub repository and pull request number above. RepoPilot will review the changes and help you check proposed fixes.</p><span className="muted small">Your repository stays under your control. Nothing is applied automatically.</span></div>;
  const view=overviewPresentation(w,d);
  const top=[...view.actionable].sort((a,b)=>rank[a.severity]-rank[b.severity]).slice(0,3);
  const next=()=>{
    onSelect(view.next.section);
    if(view.next.action==='review') void w.analyzeWithAI();
    if(view.next.action==='tests') void w.generateTestProposals();
    if(view.next.action==='fixes') void w.generateFixProposals();
  };
  const cards=[
    {kind:'issues' as const,label:'Issues',value:d.hasReview?String(d.findings.length):'—',detail:d.hasReview?'Problems found in this pull request':'Available after review',tone:view.actionable.length?'attention':'idle',section:'findings' as SectionId},
    {kind:'tests' as const,label:'Tests',value:view.safeTests?`${view.safeTests} safe`:'Not ready',detail:view.safeTests?'Safety-checked tests, ready to run in verification':'Confirm how the code should behave',tone:view.safeTests?'complete':w.generationError||d.tests?.rejected_tests?'attention':'idle',section:'tests' as SectionId},
    {kind:'fixes' as const,label:'Fixes',value:view.readyFixes?`${view.readyFixes} ready`:'Not ready',detail:view.readyFixes?'Proposed changes ready to verify':'Prepare a change before verification',tone:view.readyFixes?'complete':d.fixes?.rejected_fixes?'attention':'idle',section:'fixes' as SectionId},
    {kind:'verify' as const,label:'Verification',value:w.verifying?'Checking…':d.verification?`${view.approved} passed`:'Not checked',detail:d.verification?view.approved?'Fix verified against available checks':'Human review required':'Tests and checks before application',tone:w.verifying?'running':view.approved?'complete':d.verification?'attention':'idle',section:'verification' as SectionId},
  ];
  return <div className={styles.overview}>
    <header className={styles.hero} data-tone={view.tone}><span className={styles.heroIcon}><SummaryIcon kind={view.tone==='attention'?'issues':'verify'}/></span><div><p className={styles.eyebrow}>PULL REQUEST #{d.pr.pull_request}</p><h1 role="status">{view.title}</h1><p>{view.explanation}</p><div className={styles.heroMeta}>{d.hasReview?<><span>{d.findings.length} issues found</span><span>{view.safeTests} tests ready</span><span>{view.readyFixes} fixes ready</span></>:<span>{d.pr.title}</span>}</div></div></header>
    <div className={styles.summaryGrid}>{cards.map(card=><button key={card.kind} type="button" className={styles.summaryCard} data-tone={card.tone} onClick={()=>onSelect(card.section)}><span className={styles.cardLabel}><SummaryIcon kind={card.kind}/>{card.label}<span aria-hidden="true">↗</span></span><strong>{card.value}</strong><span>{card.detail}</span></button>)}</div>
    <PipelineFlow workspace={w} data={d} onSelect={onSelect}/>
    <section className={styles.nextAction} aria-labelledby="next-heading"><div><p className={styles.eyebrow}>YOUR NEXT STEP</p><h2 id="next-heading">{view.next.title}</h2><p>{view.next.detail}</p></div><button type="button" disabled={w.busy || !!view.next.action && !d.review && view.next.action!=='review' || view.next.action==='review' && !w.analysis} onClick={next}>{view.next.label}<span aria-hidden="true"> →</span></button></section>
    {d.hasReview && <section className={styles.attention} aria-labelledby="attention-heading"><div className="section-heading"><h2 id="attention-heading">What needs your attention</h2><button className="text-button" type="button" onClick={()=>onSelect('findings')}>View all issues →</button></div>{top.length?top.map(f=><button type="button" className={styles.finding} key={f.id} onClick={()=>onSelect('findings')}><span className={`severity ${f.severity.toLowerCase()}`}>{f.severity}</span><strong>{f.title}</strong><code>{f.file}{f.line!=null?`:${f.line}`:''}</code>{f.explanation && <small className={styles.findingMeaning}>{f.explanation.split(/\n/)[0]}</small>}<span className={styles.findingArrow} aria-hidden="true">↗</span></button>):<p className="muted">{d.findings.length?'Existing findings have verified fix proposals. Nothing has been applied.':'No review findings returned. Check review coverage before deciding to merge.'}</p>}</section>}
    <section className={styles.prDetails} aria-labelledby="pr-details-heading"><div className="section-heading"><h2 id="pr-details-heading">About this pull request</h2><button className="text-button" type="button" onClick={()=>onSelect('files')}>View changes →</button></div><h3 className={styles.prTitle}>{d.pr.title}</h3>{d.pr.body && <details><summary>Pull request description</summary><p>{d.pr.body}</p></details>}<dl><div><dt>Repository</dt><dd><code>{d.pr.repository} #{d.pr.pull_request}</code></dd></div><div><dt>Changed files</dt><dd>{d.pr.changed_files} <span className={styles.additions}>+{d.pr.additions}</span> <span className={styles.deletions}>−{d.pr.deletions}</span></dd></div><div><dt>Current commit</dt><dd><code title={d.pr.head_sha}>{d.pr.head_sha.slice(0,12)}</code></dd></div><div><dt>Context files</dt><dd>{d.hasReview?d.context.length:'Not reviewed yet'}</dd></div></dl>
      <details className={styles.technical}><summary>Repository context and review details</summary><p className="mono muted small">{d.pr.head_branch} → {d.pr.base_branch}</p><p className="muted small">{d.counts.static ?? 0} static findings{d.review && ` · ${d.review.reviewed_files.length} files reviewed`}</p>{d.context.length?<><RepoContextGraph files={d.pr.files.map(f=>f.filename)} context={d.context} loaded/><ul>{d.context.map(f=><li key={f.path}><code>{f.path}</code><p className="muted small">{f.reason}</p></li>)}</ul></>:<p className="muted small">No repository context files selected.</p>}<button className="text-button" type="button" onClick={()=>onSelect('context')}>View context details →</button></details>
    </section>
    <p className={styles.safetyNote}>Proposals stay local until you decide what to do. RepoPilot does not apply changes automatically.</p>
  </div>;
}
