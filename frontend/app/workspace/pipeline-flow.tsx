import type {ReviewWorkspace} from './use-review-workspace';
import type {WorkspaceData} from './data';
import type {SectionId} from './types';
type Node={id:string;title:string;detail:string;state:'idle'|'pending'|'done'|'attention';section:SectionId};
export default function PipelineFlow({workspace:w,data:d,previewCount,onSelect}: {workspace:ReviewWorkspace;data:WorkspaceData;previewCount?:number;onSelect:(id:SectionId)=>void}) {
  const scannerAttention=d.review?.scanners.some(s=>['error','timeout','unavailable','partial'].includes(s.status)) || w.agents?.senior_review.coverage_gaps.some(note=>/bandit|semgrep|static/i.test(note));
  const roleAttention=w.agents?.agents.some(a=>['bug','security','performance'].includes(a.agent) && ['ERROR','PARTIAL'].includes(a.status)) || !!d.review?.skipped_files.length || !!d.review?.context_warnings.length;
  const verifiedAll=!!d.verification?.results.length && d.verification.results.every(r=>r.status==='PASSED' && r.safe_to_apply);
  const verificationAttention=!!d.verification?.results.length && !verifiedAll;
  const agentRole=(role:string)=>w.agents?.agents.find(a=>a.agent===role)?.status;
  const nodes:Node[]=[
    {id:'pr',title:'Retrieve PR',detail:w.loading?'Request pending':d.pr?`${d.pr.files.length} changed files`:'Awaiting repository',state:w.loading?'pending':d.pr?'done':w.error?'attention':'idle',section:'files'},
    {id:'static',title:'Static analysis',detail:w.reviewing||w.agentLoading?'Included in running request':d.hasReview?`${d.counts.static ?? 0} observations`:'Bandit / Semgrep',state:w.reviewing||w.agentLoading?'pending':scannerAttention?'attention':d.hasReview?'done':'idle',section:'static'},
    {id:'review',title:w.generating?'Test generation':w.agentLoading||w.agents?'Agent review':d.review||w.reviewing?'Review':'Agent review',detail:w.generating?'Test generation request':w.agentLoading?'Specialist request pending':w.reviewing?'Review request pending':w.agents?`${w.agents.findings.length} observations · ${w.agents.agents.length} roles`:d.review?`${d.review.ai_findings.length} findings returned`:'AI / specialist review',state:w.agentLoading||w.reviewing||w.generating?'pending':w.agentError||w.reviewError||roleAttention?'attention':d.hasReview?'done':'idle',section:w.generating?'tests':w.agents||w.agentLoading?'agents':'findings'},
    {id:'fix',title:'Fix proposals',detail:w.fixing?'Request pending':d.fixes?`${d.fixes.total_fixes} proposals`:'Minimal local changes',state:w.fixing?'pending':w.fixError||agentRole('fix')==='ERROR'?'attention':d.fixes?'done':'idle',section:'fixes'},
    {id:'verify',title:'Verification',detail:w.verifying?'Verification running':d.verification?.results.length?`${d.verification.passed} passed · ${d.verification.skipped} skipped`:d.verification?'No eligible fixes':'Tests + before/after scans',state:w.verifying?'pending':w.verificationError||verificationAttention||agentRole('verification')==='ERROR'?'attention':verifiedAll?'done':'idle',section:'verification'},
    {id:'preview',title:'GitHub preview',detail:previewCount!==undefined?`${previewCount} previews returned`:'No publication',state:previewCount!==undefined?'done':'idle',section:'agents'},
  ];
  const running=w.loading?'Retrieving pull request':w.reviewing?'Review request running':w.agentLoading?'Specialist review request running':w.generating?'Generating tests':w.fixing?'Generating fix proposals':w.verifying?'Verifying supplied artifacts':'Ready when you are';
  const nextIndex=nodes.findIndex(n=>n.state==='idle');
  const linkState=(i:number)=>{const n=nodes[i];if(n.state==='done')return'done';if(n.state==='pending')return'active';if(i===nextIndex)return'next';return'idle';};
  return <section className={`pipeline-flow ${w.busy?'running':''}`} aria-labelledby="pipeline-heading">
    <div className="section-heading"><h2 id="pipeline-heading">Review pipeline</h2><span className="pipeline-status" role="status">{running}</span></div>
    <ol>{nodes.map((node,i)=><li key={node.id} className={`pipeline-node ${node.state} ${i===nextIndex?'next':''}`}>
      <button type="button" onClick={()=>onSelect(node.section)} aria-label={`${node.title}: ${node.detail}`}>
        <span className="node-index mono">{node.state==='done'?'✓':String(i+1).padStart(2,'0')}</span>
        <strong>{node.title}</strong><span>{node.detail}</span>
      </button>
      {i<nodes.length-1 && <svg className={`flow-link ${linkState(i)}`} viewBox="0 0 48 12" aria-hidden="true"><path d="M0 6H48"/></svg>}
    </li>)}</ol>
    {w.busy && <p className="muted small">Request-level progress. The API does not expose timing for individual internal stages.</p>}
  </section>;
}
