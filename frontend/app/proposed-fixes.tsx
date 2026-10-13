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
        <span>Safe fixes: <strong>{result.safe_fixes}</strong></span>
        <span>Rejected fixes: <strong>{result.rejected_fixes}</strong></span>
      </div>
      <p className="muted small">
        Refreshed review at commit {result.head_sha.slice(0, 12)}. Safe means static checks
        passed, not proven correct or safe to execute. No fixes have been applied or run.
      </p>
      <div className="finding-list">
        {result.fixes.map((fix) => (
          <article className="finding" key={fix.finding_id}>
            <div className="finding-meta">
              <span className={`severity ${fix.safe_to_verify ? 'low' : 'high'}`}>
                {fix.safe_to_verify ? 'SAFE · CHECKS PASSED' : 'NOT SAFE · REJECTED'}
              </span>
              <span>{fix.confidence}% confidence · {fix.sources.join(' + ')}</span>
            </div>
            <h3>{fix.title}</h3>
            <p>Related finding: {fix.finding_title}</p>
            <p className="finding-location"><code>{fix.file}</code> · {fix.finding_id}</p>
            <p>{fix.explanation}</p>
            <ContractDetails contract={fix.contract} />
            <p className="muted small">Test/fix compatibility: {fix.compatibility.compatible ? 'YES' : 'NO'} · {fix.compatibility.reason}</p>
            <button type="button" disabled={busy || !fix.safe_to_verify || !fix.finding} onClick={() => onVerify(fix)}>
              Verify this fix
            </button>
            <p className="muted small">Verifies this existing proposal with saved test artifacts. No OpenAI regeneration.</p>
            {fix.validation_errors.length > 0 && <ul className="error">
              {fix.validation_errors.map((error, index) => <li key={index}>{error}</li>)}
            </ul>}
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
