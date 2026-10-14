import type {ReviewWorkspace} from './use-review-workspace';
import type {WorkspaceData} from './data';
import type {SectionId} from './types';
import PipelineFlow from './pipeline-flow';
import RepoContextGraph from './repo-context-graph';
import SeverityRing from './severity-ring';
import SampleReviewPanel from './sample-review-panel';
import AnalysisSummary from '../pipeline-overview';
export default function Overview({workspace:w,data:d,previewCount,onSelect}: {workspace:ReviewWorkspace;data:WorkspaceData;previewCount?:number;onSelect:(id:SectionId)=>void}) {
  return <div className="overview-screen">
    <div className="canvas-heading"><div><p className="section-kicker">Workspace / Overview</p><h1>{d.pr?d.pr.title:'Review with evidence'}</h1><p className="muted">{d.pr?`${d.pr.repository} · Pull request #${d.pr.pull_request}`:'Load a pull request to inspect changes, review findings, and verify proposals.'}</p></div>
      {d.review || w.agents ? <span className="tag">{w.busy?'Request running':'Review complete'}</span> : null}
    </div>
    <PipelineFlow workspace={w} data={d} previewCount={previewCount} onSelect={onSelect}/>
    <div className="overview-visuals">
      <RepoContextGraph files={d.pr?.files.map(f=>f.filename) ?? []} context={d.context} loaded={!!d.pr}/>
      {!d.hasReview?<SampleReviewPanel/>:<div className="overview-evidence">
        <SeverityRing findings={d.findings}/>
        <section className="recent-findings"><h2>Review observations</h2>
          {!d.findings.length?<p className="muted">No findings returned. Check context and scanner coverage.</p>:d.findings.slice(0,3).map(f=><button type="button" className="observation-row" key={f.id} onClick={()=>onSelect('findings')} title={f.title}>
            <span className={`severity-dot ${f.severity.toLowerCase()}`}/><span className="truncate">{f.title}</span><span className="mono muted small">{f.status}</span>
          </button>)}
          <button className="text-button" type="button" onClick={()=>onSelect('findings')}>View findings →</button>
        </section>
      </div>}
    </div>
    {d.hasReview && <AnalysisSummary files={d.review?.reviewed_files.length ?? new Set(d.findings.map(f=>f.file)).size}
      filesLabel={d.review?'Files reviewed':'Files with observations'} contextFiles={d.context.length}
      aiFindings={w.agents?w.agents.findings.filter(f=>f.evidence.some(e=>e.source==='AI')).length:d.review?.ai_findings.length ?? 0}
      staticFindings={d.counts.static ?? 0} uniqueIssues={w.agents?undefined:d.review?.summary.unique_issues}
      confirmed={d.verification?d.findings.filter(f=>f.status==='Verified').length:undefined}
      tests={d.tests?.total_tests} verified={d.verification?.passed}/>}
    {d.pr && <div className="overview-actions"><button className="secondary-button" type="button" disabled={!w.analysis || w.busy} onClick={()=>onSelect('agents')}>Open agent review →</button>
      <p className="muted small">Proposals stay separate from verification. GitHub actions are previews only.</p></div>}
  </div>;
}
