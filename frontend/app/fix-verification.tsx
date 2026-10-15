import styles from './resolution.module.css';
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
  return <span className={styles.badge} data-tone={status === 'PASSED' ? 'passed' : status === 'FAILED' ? 'attention' : 'skipped'}>{status === 'PASSED' ? 'Passed' : status === 'FAILED' ? 'Failed' : 'Skipped'}</span>;
}
function TestResult({ label, check }: { label: string; check: Check }) {
  return <div className="fix">
    <span>{label}</span>
    <p>{badge(check.status)} {check.message}</p>
    {check.collected > 0 && <p className="muted small">{check.collected} collected · {check.passed} passed · {check.failed} failed · {check.errors} errors</p>}
    {(check.stdout || check.stderr) && <details className="changed-file">
      <summary>Captured tool output</summary>
      {check.stdout && <><p className={styles.label}>stdout</p><pre className="diff"><code>{check.stdout}</code></pre></>}
      {check.stderr && <><p className={styles.label}>stderr</p><pre className="diff"><code>{check.stderr}</code></pre></>}
    </details>}
  </div>;
}
function ScanSummary({name,before,after}:{name:string;before:Check;after:Check}) {
  return <div className={styles.check}><strong>{name}</strong>
    <span className={styles.scanStates}><span>Before {badge(before.status)}</span><span aria-hidden="true">→</span><span>After {badge(after.status)}</span></span>
    <span className="mono muted small">{before.findings.length} findings → {after.findings.length} findings</span>
    {(before.status!=='PASSED' || after.status!=='PASSED') && <small className="muted">Counts may reflect incomplete or skipped scans; see tool details.</small>}
  </div>;
}
function Scans({ name, before, after }: { name: string; before: Check; after: Check }) {
  return <div>
    {[['Before', before], ['After', after]].map(([label, value]) => {
      const check = value as Check;
      return <div key={label as string}>
        <TestResult label={`${name} · ${label}`} check={check}/>
        {check.findings.length > 0 && <ul>{check.findings.map((finding, index) => <li key={index}>{finding.severity} · <code>{finding.rule_id}</code> · {finding.title}</li>)}</ul>}
      </div>;
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
    <p className="muted small">Artifact snapshot: <code>{result.head_sha.slice(0,12)}</code>. Verification covers each exact proposal independently in temporary isolation. Nothing is automatically applied. GitHub remains read-only by default.</p>
    <div className="finding-list">{result.results.map((fix) => {
      const approved=fix.status==='PASSED' && fix.safe_to_apply && fix.compatibility.compatible && !fix.compatibility.behavior_ambiguous;
      return <article className="finding" key={fix.finding_id}>
        <div className={styles.decision} data-approved={approved}>
          <span className={styles.badge} data-tone={approved?'passed':'attention'}>{approved?'VERIFICATION APPROVED':'HUMAN REVIEW REQUIRED'}</span>
          <h3>{fix.title}</h3>
          <p className="finding-location"><code className="truncate" title={fix.file}>{fix.file}</code></p>
          <p className={styles.decisionText}>Verification decision: <strong>{approved?'APPROVED':'HUMAN REVIEW REQUIRED'}</strong></p>
          <p>{fix.verification_summary}</p>
          {(!fix.compatibility.compatible || fix.compatibility.behavior_ambiguous) && <p className={styles.reason}>{fix.compatibility.reason}</p>}
          {approved && <p className="muted small">This exact proposal passed the available deterministic verification checks. Approval does not apply to other changes.</p>}
        </div>
        <div className={styles.checks} aria-label="Verification check summary">
          {([['Syntax',fix.syntax_check],['Generated test',fix.generated_test],['Regression tests',fix.regression_tests]] as const).map(([label,check])=><div className={styles.check} key={label}>
            <strong>{label}</strong>{badge(check.status)}<small className="muted">{label==='Generated test'?'Before fix':label==='Regression tests'?'After fix':'Fixed file'}</small>
          </div>)}
          <ScanSummary name="Bandit" before={fix.bandit_before} after={fix.bandit_after}/>
          <ScanSummary name="Semgrep" before={fix.semgrep_before} after={fix.semgrep_after}/>
        </div>
        <details className="changed-file generated-code">
          <summary>Compatibility and exact proposal</summary>
          <p className="muted small">Finding ID: <code>{fix.finding_id}</code> · Overall result: {badge(fix.status)}</p>
          <p>Compatibility: {fix.compatibility.compatible ? 'Compatible' : 'Incompatible'} · {fix.compatibility.reason}</p>
          <p>Behavior ambiguous: {fix.compatibility.behavior_ambiguous?'Yes':'No'}</p>
          {fix.proposal?<><p className={styles.label}>Exact proposal checked by this verification</p><pre className="diff"><code>{fix.proposal.unified_diff || fix.proposal.fixed_code}</code></pre></>:<p className="muted small">No verified proposal artifact returned.</p>}
        </details>
        <details className="changed-file generated-code">
          <summary>Detailed check results and captured output</summary>
          <TestResult label="Syntax" check={fix.syntax_check}/>
          <TestResult label="Generated test · Before fix" check={fix.generated_test}/>
          <TestResult label="Regression tests · After fix" check={fix.regression_tests}/>
          <Scans name="Bandit" before={fix.bandit_before} after={fix.bandit_after}/>
          <Scans name="Semgrep" before={fix.semgrep_before} after={fix.semgrep_after}/>
        </details>
      </article>;
    })}</div>
    {result.results.length === 0 && <p className="empty muted">No fix proposals were available to verify.</p>}
  </section>;
}
