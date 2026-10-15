import styles from './resolution.module.css';
import ContractDetails, { type BehavioralContract, type Compatibility } from './behavior-contract';
import type { Finding } from './review-findings';
import type { TestGeneration } from './generated-tests';
export type FixGeneration = {
  repository: string;
  pull_request: number;
  head_sha: string;
  total_fixes: number;
  safe_fixes: number;
  rejected_fixes: number;
  test_proposals_used: number;
  test_artifacts: TestGeneration | null;
  fixes: {
    contract: BehavioralContract | null;
    compatibility: Compatibility;
    finding: Finding | null;
    finding_id: string;
    finding_title: string;
    sources: string[];
    file: string;
    title: string;
    explanation: string;
    original_code: string;
    fixed_code: string;
    unified_diff: string;
    confidence: number;
    safe_to_verify: boolean;
    validation_errors: string[];
  }[];
  skipped_findings: { finding_id: string; title: string; reason: string }[];
};

export type FixArtifact = FixGeneration['fixes'][number];
export default function ProposedFixes({ result, onVerify, busy }: {
  result: FixGeneration;
  onVerify: (fix: FixArtifact) => void;
  busy: boolean;
}) {
  return (
    <section className="ai-results" aria-labelledby="fixes-title">
      <div className="section-heading">
        <h2 id="fixes-title">Proposed fixes</h2>
        <span className="muted small">{result.total_fixes} proposals</span>
      </div>
      <div className="combined-summary">
        <span>Fixes generated: <strong>{result.total_fixes}</strong></span>
        <span>Eligible for verification: <strong>{result.safe_fixes}</strong></span>
        <span>Rejected proposals: <strong>{result.rejected_fixes}</strong></span>
      </div>
      <p className="muted small">
        Proposals at commit <code>{result.head_sha.slice(0, 12)}</code>. Eligibility means proposal validation passed;
        deterministic verification is still required. Nothing is automatically applied. GitHub remains read-only by default.
      </p>
      <div className="finding-list">
        {result.fixes.map((fix) => (
          <article className="finding" key={fix.finding_id}>
            <p className={styles.label}>Related finding</p>
            <p className={styles.findingTitle}>{fix.finding_title}</p>
            <p className="finding-location"><code className="truncate" title={fix.file}>{fix.file}</code></p>
            <p className={styles.label}>Proposed change</p>
            <h3>{fix.title}</h3>
            <p>{fix.explanation}</p>
            <div className="finding-meta"><span>{fix.confidence}% confidence · {fix.sources.join(' + ')}</span></div>
            <div className={styles.eligibility}>
              <span className={styles.badge} data-tone={fix.safe_to_verify ? 'ready' : 'attention'}>
                {fix.safe_to_verify ? 'READY FOR VERIFICATION' : 'NOT ELIGIBLE FOR VERIFICATION'}
              </span>
              <p className="muted small">{!fix.compatibility.compatible || fix.compatibility.behavior_ambiguous
                ? fix.compatibility.reason : fix.safe_to_verify
                  ? 'Proposal validation passed. Verify this exact change before considering it for application.'
                  : fix.validation_errors[0] || 'This proposal did not pass validation.'}</p>
              {!fix.finding && <p className="muted small">Verification is unavailable because the related finding artifact is missing.</p>}
              <button type="button" disabled={busy || !fix.safe_to_verify || !fix.finding} onClick={() => onVerify(fix)}>
                Verify this fix
              </button>
              <p className="muted small">Uses this proposal and saved test artifacts in temporary isolation. No AI regeneration.</p>
            </div>
            <details className="changed-file generated-code">
              <summary>Compatibility and validation details</summary>
              <p className="muted small">Finding ID: <code>{fix.finding_id}</code></p>
              <p>Test/fix compatibility: {fix.compatibility.compatible ? 'Compatible' : 'Incompatible'} · {fix.compatibility.reason}</p>
              <ContractDetails contract={fix.contract} />
              {fix.validation_errors.length > 0 && <ul className="error">
                {fix.validation_errors.map((error, index) => <li key={index}>{error}</li>)}
              </ul>}
            </details>
            <details className="changed-file generated-code">
              <summary>Before / after</summary>
              <p className="muted small">Original code</p>
              <pre className="diff"><code>{fix.original_code}</code></pre>
              <p className="muted small">Proposed code</p>
              <pre className="diff"><code>{fix.fixed_code}</code></pre>
            </details>
            <details className="changed-file generated-code">
              <summary>Unified diff</summary>
              <pre className="diff"><code>{fix.unified_diff || 'No validated diff is available.'}</code></pre>
            </details>
          </article>
        ))}
      </div>
      {result.fixes.length === 0 && <p className="empty muted">No justified local fixes were proposed.</p>}
      {result.skipped_findings.length > 0 && <details className="context-skipped">
        <summary>{result.skipped_findings.length} issues not selected for fixes</summary>
        <ul>{result.skipped_findings.map((finding) => <li key={finding.finding_id}>
          {finding.title} — {finding.reason}
        </li>)}</ul>
      </details>}
    </section>
  );
}
