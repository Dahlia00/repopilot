type Props = {
  files: number; filesLabel?: string; contextFiles: number; aiFindings: number;
  staticFindings: number; uniqueIssues?: number; confirmed?: number; tests?: number; verified?: number;
};
export default function AnalysisSummary(p: Props) {
  const metrics = [[p.filesLabel ?? 'Files reviewed', p.files], ['Context files', p.contextFiles],
    ['AI findings', p.aiFindings], ['Static findings', p.staticFindings], ['Unique issues', p.uniqueIssues], ['Confirmed issues', p.confirmed],
    ['Generated tests', p.tests], ['Verified fixes', p.verified]].filter(([, value]) => value !== undefined);
  return <section className="analysis-summary" aria-labelledby="analysis-summary-title">
    <h2 id="analysis-summary-title">Analysis Summary</h2>
    <div className="analysis-metrics">{metrics.map(([label, value]) =>
      <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
  </section>;
}
