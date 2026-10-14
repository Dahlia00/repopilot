import type {ReviewWorkspace} from './use-review-workspace';
import type {WorkspaceData} from './data';
import type {SectionId} from './types';
import PipelineFlow from './pipeline-flow';
import RepoContextGraph from './repo-context-graph';
import ResolutionSummary from './resolution-summary';
import {overviewState} from './overview-state';
import styles from './overview.module.css';
const rank={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
export default function Overview({workspace:w,data:d,onSelect}: {workspace:ReviewWorkspace;data:WorkspaceData;previewCount?:number;onSelect:(id:SectionId)=>void}) {
  if(!d.pr) return <div className={styles.empty}><p className={styles.eyebrow}>NEW REVIEW</p><h1>Review a pull request</h1><p>Load a GitHub pull request to inspect its changes, review issues, and verify proposed fixes.</p><span className="muted small">Start with the repository and PR number in the command bar above.</span></div>;
  const {status,safeResults,actionable}=overviewState(w,d);
  const top=[...actionable].sort((a,b)=>rank[a.severity]-rank[b.severity]).slice(0,5);
  const metrics=[
    [d.review?.reviewed_files.length,'files reviewed'],[d.context.length,'context files'],
    [d.findings.length,'findings'],[d.counts.static,'static findings'],
  ].filter(([value])=>typeof value==='number' && value>0);
  return <div className={styles.overview}>
    <header className={styles.header}><div><p className={styles.metadata}><span>{d.pr.repository}</span><span>#{d.pr.pull_request}</span></p><h1>{d.pr.title}</h1>
      <div className={styles.metadata}>{d.pr.head_branch && d.pr.base_branch && <span>{d.pr.head_branch} → {d.pr.base_branch}</span>}<span>{d.pr.changed_files} changed files</span><span><b className={styles.additions}>+{d.pr.additions}</b> / <b className={styles.deletions}>−{d.pr.deletions}</b></span></div></div>
      <span className={styles.status} data-tone={status==='VERIFYING'||status==='REVIEWING'?'running':status==='VERIFIED'||status==='REVIEW COMPLETE'?'complete':status==='LOADED'?'idle':'attention'} role="status">{status}</span>
    </header>
    <PipelineFlow workspace={w} data={d} onSelect={onSelect}/>
    {d.hasReview && <><div className={styles.columns}><section className={styles.attention} aria-labelledby="attention-heading"><div className="section-heading"><h2 id="attention-heading">Needs attention</h2><span className="muted small">{actionable.length} findings</span></div>
      {!d.findings.length?<p className="muted">No review findings returned.</p>:!top.length?<p className="muted">Existing findings have verified fix proposals. Nothing has been applied.</p>:top.map(f=><button type="button" className={styles.finding} key={f.id} onClick={()=>onSelect('findings')}>
        <span className={`severity ${f.severity.toLowerCase()}`}>{f.severity}</span><strong>{f.title}</strong><code>{f.file}{f.line!=null?`:${f.line}`:''}</code><small>{f.source} · {f.status}</small>
      </button>)}<button className="text-button" type="button" onClick={()=>onSelect('findings')}>View all findings →</button>
    </section><section className={styles.context} aria-label="Supporting repository context">{d.context.length?<><RepoContextGraph files={d.pr.files.map(f=>f.filename)} context={d.context} loaded/><details><summary>{d.context.length} selected context files</summary><ul>{d.context.map(f=><li key={f.path}><code>{f.path}</code><p className="muted small">{f.reason}</p></li>)}</ul></details></>:<><h2>Repository context</h2><p className="muted">No repository context files were selected for this review.</p></>}
      <button className="text-button" type="button" onClick={()=>onSelect('context')}>View repository context →</button></section></div>
      {!!metrics.length && <div className={styles.metrics} aria-label="Analysis summary">{metrics.map(([value,label])=><span key={label}><strong>{value}</strong> {label}</span>)}</div>}</>}
    <ResolutionSummary data={d} approved={safeResults.length} onSelect={onSelect}/>
  </div>;
}
