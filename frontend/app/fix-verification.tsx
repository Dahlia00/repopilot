import type { Compatibility } from './behavior-contract';
type Check = {
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  message: string;
  collected: number;
  passed: number;
  failed: number;
  errors: number;
  stdout: string;
  stderr: string;
  findings: { severity: string; rule_id: string; title: string }[];
};
export type FixVerification = {
  repository: string;
  pull_request: number;
  head_sha: string;
  fixes_verified: number;
  passed: number;
  failed: number;
  skipped: number;
  results: {
    compatibility: Compatibility;
    finding_id: string;
    file: string;
    title: string;
    proposal: { fixed_code: string; unified_diff: string } | null;
    status: Check['status'];
    syntax_check: Check;
    generated_test: Check;
    regression_tests: Check;
    bandit_before: Check;
    bandit_after: Check;
    semgrep_before: Check;
    semgrep_after: Check;
    verification_summary: string;
    safe_to_apply: boolean;
  }[];
};
function badge(status: Check['status']) {
  return <span className={`severity ${status === 'PASSED' ? 'verified' : status === 'FAILED' ? 'high' : 'medium'}`}>{status}</span>;
}
function TestResult({ label, check }: { label: string; check: Check }) {
  return <div className="fix">
    <span>{label}</span>
    <p>{badge(check.status)} {check.message}</p>
    {check.collected > 0 && <p className="muted small">{check.collected} collected · {check.passed} passed · {check.failed} failed · {check.errors} errors</p>}
    {(check.stdout || check.stderr) && <details className="changed-file">
      <summary>Captured tool output</summary>
      <pre className="diff"><code>{check.stdout}{check.stderr}</code></pre>
    </details>}
  </div>;
}
function Scans({ name, before, after }: { name: string; before: Check; after: Check }) {
  return <div className="fix">
    <span>{name} BEFORE → AFTER</span>
    <p>{badge(before.status)} {before.findings.length} findings → {badge(after.status)} {after.findings.length} findings</p>
    <p className="muted small">Before: {before.message} After: {after.message}</p>
    {[['Before', before], ['After', after]].map(([label, value]) => {
      const check = value as Check;
      return check.findings.length > 0 && <details className="context-skipped" key={label as string}>
        <summary>{label as string} findings</summary>
        <ul>{check.findings.map((finding, index) => <li key={index}>{finding.severity} · {finding.rule_id} · {finding.title}</li>)}</ul>
      </details>;
    })}
  </div>;
}
export default function Verification({ result }: { result: FixVerification }) {
  return <section className="ai-results" aria-labelledby="verification-title">
    <div className="section-heading"><h2 id="verification-title">Verification results</h2></div>
    <div className="combined-summary">
      <span>Fixes verified: <strong>{result.fixes_verified}</strong></span>
      <span>Passed: <strong>{result.passed}</strong></span>
      <span>Failed: <strong>{result.failed}</strong></span>
      <span>Skipped: <strong>{result.skipped}</strong></span>
    </div>
    <p className="muted small">Verified artifacts at commit {result.head_sha.slice(0,12)}. Restricted tests ran only when execution safety and isolation checks passed. Results cover each fix independently; nothing is applied automatically.</p>
    <div className="finding-list">{result.results.map((fix) => <article className="finding" key={fix.finding_id}>
      <div className="finding-meta">{badge(fix.status)}</div>
      <h3>{fix.title}</h3>
      <p className="finding-location"><code className="truncate" title={fix.file}>{fix.file}</code></p>
      <p>Safe to apply: <strong>{fix.safe_to_apply ? 'YES' : 'NO'}</strong></p>
      <p>{fix.verification_summary}</p>
      <p className="muted small">Compatibility: {fix.compatibility.compatible ? 'YES' : 'NO'} · {fix.compatibility.reason}</p>
      {fix.proposal && <details className="changed-file generated-code">
        <summary>Exact proposal checked by this verification</summary>
        <pre className="diff"><code>{fix.proposal.unified_diff || fix.proposal.fixed_code}</code></pre>
      </details>}
      <TestResult label="SYNTAX CHECK" check={fix.syntax_check} />
      <TestResult label="GENERATED TEST · BEFORE FIX" check={fix.generated_test} />
      <TestResult label="REGRESSION TEST · AFTER FIX" check={fix.regression_tests} />
      <Scans name="BANDIT" before={fix.bandit_before} after={fix.bandit_after} />
      <Scans name="SEMGREP" before={fix.semgrep_before} after={fix.semgrep_after} />
    </article>)}</div>
    {result.results.length === 0 && <p className="empty muted">No fix proposals were available to verify.</p>}
  </section>;
}
