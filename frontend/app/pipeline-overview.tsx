type Props = { fetched: boolean; reviewed: boolean; agentReviewed: boolean; files: number;
  filesLabel?: string; fixes: number; contextFiles: number; aiFindings: number; staticFindings: number; confirmed: number;
  tests: number; verified: number; ambiguous: boolean; };
const steps = ['Fetch PR', 'Repository Context', 'AI + Static Review', 'Agent Review',
  'Generate Tests', 'Generate Fix', 'Verify Fix', 'GitHub Preview'];
export default function PipelineOverview(p: Props) {
  const metrics = [[p.filesLabel ?? 'Files reviewed', p.files], ['Context files', p.contextFiles], ['AI findings', p.aiFindings],
    ['Static findings', p.staticFindings], ['Confirmed issues', p.confirmed], ['Generated tests', p.tests], ['Verified fixes', p.verified]];
  return <section className="panel" aria-labelledby="pipeline-title">
    <div className="section-heading"><div><h2 id="pipeline-title">Review with evidence</h2>
      <p className="muted small">Generation proposes changes. Deterministic verification earns trust.</p></div>
      <span className="tag">READ ONLY · UI WRITE DISABLED</span></div>
    <ol className="pipeline-steps">{steps.map((step, index) => {
      const complete = index === 0 ? p.fetched : index < 3 ? p.reviewed : index === 3 ? p.agentReviewed : index === 4 ? p.tests > 0 : index === 5 ? p.fixes > 0 : index === 6 ? p.verified > 0 : false;
      return <li key={step} className={complete ? 'complete' : ''}><span>{index + 1}</span>{step}</li>;
    })}</ol>
    <h3>Analysis Summary</h3><div className="analysis-metrics">{metrics.map(([label,value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <p className="muted small">{p.verified > 0 ? 'VERIFIED · SAFE TO APPLY applies only to individually verified proposals.' : 'UNVERIFIED · Generated code has no automatic approval.'}
      {p.ambiguous && ' AMBIGUOUS · Desired behavior requires human clarification.'}</p>
  </section>;
}
