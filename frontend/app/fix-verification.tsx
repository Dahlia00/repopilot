import {verificationGroups,verificationGroup,verificationReason,type VerificationItem} from './workspace/verification-presentation';
import {countLabel} from './workspace/ui-copy';
import {ProductIcon} from './workspace/product-primitives';
import styles from './resolution.module.css';
import type {FixArtifact} from './proposed-fixes';
import {verificationIdentity} from './workspace/proposal-identity';
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
    proposal: FixArtifact | null;
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
  return <div className={styles.check}><ProductIcon kind={name==='Bandit'?'verify':'code'}/><strong>{name}</strong>
    <span className={styles.scanStates}><span>Before {badge(before.status)}</span><span aria-hidden="true">→</span><span>After {badge(after.status)}</span></span>
    <span className="mono muted small">{countLabel(before.findings.length,'finding')} → {countLabel(after.findings.length,'finding')}</span>
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
export function CheckSummary({fix}:{fix:VerificationItem}) {
  const reproduced=verificationGroup(fix)==='approved' && fix.generated_test.status==='FAILED' && fix.regression_tests.status==='PASSED';
  return <>
    {reproduced && <p className={styles.scanStates} aria-label="Regression verification sequence"><span>Before fix: bug reproduced</span><span aria-hidden="true">→</span><span>Proposed fix</span><span aria-hidden="true">→</span><span>After fix: passed ✓</span></p>}
    <div className={styles.checks} aria-label="Verification check summary">
      {([['Syntax',fix.syntax_check],['Selected test',fix.generated_test],['Regression tests',fix.regression_tests]] as const).map(([label,check])=><div className={styles.check} key={label}>
        <ProductIcon kind={label==='Syntax'?'code':'test'}/><strong>{label}</strong>
        {label==='Selected test' && reproduced?<span className={styles.badge} data-tone="ready">Bug reproduced</span>:label==='Regression tests' && check.status==='PASSED'?<span className={styles.badge} data-tone="passed">Passed after fix</span>:label==='Regression tests' && check.status==='FAILED'?<span className={styles.badge} data-tone="attention">FAILED</span>:badge(check.status)}
        <small className="muted">{label==='Selected test'?reproduced?'Failed on the original code as expected.':'Before fix · original code':label==='Regression tests'?'After fix · proposed code':'Fixed file'}</small>
      </div>)}
      <ScanSummary name="Bandit" before={fix.bandit_before} after={fix.bandit_after}/><ScanSummary name="Semgrep" before={fix.semgrep_before} after={fix.semgrep_after}/>
    </div>
  </>;
}
function ResultDetails({fix}:{fix:VerificationItem}) {
  return <>
    <CheckSummary fix={fix}/>
    <h4>Verification summary · original details</h4><p>{fix.verification_summary}</p>
    <p>Finding ID: <code>{fix.finding_id}</code> · Overall result: {badge(fix.status)}</p>
    <p>Compatibility: {fix.compatibility.compatible?'Compatible':'Incompatible'} · {fix.compatibility.reason}</p>
    <p>Behavior ambiguous: {fix.compatibility.behavior_ambiguous?'Yes':'No'}</p>
    <details className={styles.technicalPanel}><summary>Exact proposal and saved contract</summary>{fix.proposal?<><pre className="diff"><code>{fix.proposal.unified_diff || fix.proposal.fixed_code}</code></pre><pre className="diff"><code>{JSON.stringify(fix.proposal.contract,null,2)}</code></pre></>:<p>No verified proposal artifact returned.</p>}</details>
    <details className={styles.technicalPanel}><summary>Detailed check results and captured output</summary><TestResult label="Syntax" check={fix.syntax_check}/><TestResult label="Selected test · Before fix" check={fix.generated_test}/><TestResult label="Regression tests · After fix" check={fix.regression_tests}/><Scans name="Bandit" before={fix.bandit_before} after={fix.bandit_after}/><Scans name="Semgrep" before={fix.semgrep_before} after={fix.semgrep_after}/></details>
  </>;
}
export default function Verification({result}:{result:FixVerification}) {
  const groups=verificationGroups(result.results);
  const allApproved=result.results.length>0 && groups.approved.length===result.results.length;
  const unresolved=groups.needsReview.length+groups.failed.length;
  const failedOnly=groups.failed.length>0 && !groups.needsReview.length && !groups.approved.length;
  const allChecksComplete=allApproved && result.results.every(fix=>[fix.syntax_check,fix.regression_tests,fix.bandit_before,fix.bandit_after,fix.semgrep_before,fix.semgrep_after].every(check=>check.status==='PASSED'));
  const sections=[{id:'needs-review',label:'Needs review',results:groups.needsReview},{id:'failed',label:'Failed',results:groups.failed},{id:'approved',label:'Approved',results:groups.approved}];
  return <section className="ai-results" aria-labelledby="verification-title">
    <header className={styles.decision} data-approved={allApproved}>
      <span className={styles.badge} data-tone={allApproved?'passed':'attention'}>{allApproved?'VERIFICATION APPROVED':failedOnly?'FAILED':'NEEDS REVIEW'}</span>
      <div className={styles.decisionHeading}><ProductIcon kind={allApproved?'verify':'issue'}/><div><h2 id="verification-title">{allApproved?'Verification approved':failedOnly?'Verification failed':'Needs review'}</h2><p>{allApproved?allChecksComplete?'All checks passed for the approved proposals.':'Required verification checks passed. Review any unavailable optional checks in the details.':'RepoPilot approved what it could verify. Review the remaining results and their reasons before moving forward.'}</p></div></div>
      <div className={styles.resultCounts} aria-label="Verification decisions"><span>Approved: <strong>{groups.approved.length}</strong></span><span>Needs review: <strong>{groups.needsReview.length}</strong></span>{groups.failed.length>0 && <span>Failed: <strong>{groups.failed.length}</strong></span>}</div>
      <p className="muted small">{countLabel(groups.approved.length,'fix')} approved{groups.needsReview.length?` · ${groups.needsReview.length} ${groups.needsReview.length===1?'item needs':'items need'} review${groups.failed.length?` · ${countLabel(groups.failed.length,'item')} failed`:''}`:groups.failed.length?` · ${countLabel(groups.failed.length,'item')} failed`:''}. Nothing is applied automatically; approval covers only the exact checked proposals.</p>
      {unresolved>0 && <a className={styles.reviewAction} href="#verification-unresolved">Review unresolved results <span aria-hidden="true">↓</span></a>}
    </header>
    {allApproved && result.results.length===1 && <CheckSummary fix={result.results[0]}/>}
    {unresolved>0 && <div id="verification-unresolved" className={styles.unresolvedTarget} tabIndex={-1}><h2 className="sr-only">Unresolved verification results</h2></div>}
    {sections.filter(group=>group.results.length>0).map(group=><section className={styles.resultGroup} key={group.id} aria-labelledby={`verification-${group.id}`}><h3 id={`verification-${group.id}`}>{group.label} <span className="muted small">({group.results.length})</span></h3>{group.results.map(fix=><article className={styles.resultRow} data-outcome={verificationGroup(fix)} key={verificationIdentity(fix)}><div className={styles.resultRowHeading}><h4>{fix.title}</h4><span className={styles.badge} data-tone={group.id==='approved'?'passed':group.id==='failed'?'failed':'attention'}>{group.label}</span></div><p className="finding-location"><code>{fix.file}</code></p><p>{verificationReason(fix)}</p><details className={styles.resultDetails}><summary>View details</summary><ResultDetails fix={fix}/></details></article>)}</section>)}
    {!result.results.length && <p className="empty muted">No fix proposals were available to verify. Choose a validated fix to begin.</p>}
    <details className={styles.technicalPanel}><summary>Verification run · snapshot and original totals</summary><p><code>{result.head_sha.slice(0,12)}</code> · {countLabel(result.fixes_verified,'fix')} verified · Raw status totals: {result.passed} PASSED / {result.failed} FAILED / {result.skipped} SKIPPED</p><p>Verification uses temporary isolation. GitHub remains read-only by default.</p></details>
  </section>;
}
