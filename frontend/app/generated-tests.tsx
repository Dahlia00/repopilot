import ContractDetails, { type BehavioralContract } from './behavior-contract';
export type GeneratedProposal = {
  contract: BehavioralContract | null;
  finding_id: string;
  finding_title: string;
  file: string;
  framework: 'pytest';
  test_name: string;
  test_code: string;
  purpose: string;
  expected_behavior: string;
  execution_safe: boolean;
  validation_errors: string[];
};
export type TestGeneration = {
  repository: string;
  pull_request: number;
  head_sha: string;
  findings: (import('./review-findings').Finding & { finding_id: string })[];
  contracts: BehavioralContract[];
  tests: GeneratedProposal[];
  skipped_findings: { finding_id: string; file: string; title: string; reason: string }[];
  total_tests: number;
  safe_tests: number;
  rejected_tests: number;
};

export default function GeneratedTests({ result }: { result: TestGeneration }) {
  return (
    <section className="ai-results" aria-labelledby="tests-title">
      <div className="section-heading">
        <h2 id="tests-title">Generated tests</h2>
        <span className="muted small">{result.total_tests} proposals</span>
      </div>
      <div className="combined-summary">
        <span>
          Total tests: <strong>{result.total_tests}</strong>
        </span>
        <span>
          Safe tests: <strong>{result.safe_tests}</strong>
        </span>
        <span>
          Rejected tests: <strong>{result.rejected_tests}</strong>
        </span>
      </div>
      <p className="muted small">
        Generated from a refreshed AI review at commit {result.head_sha.slice(0, 12)}. Safe means
        passed static checks; tests have not been run and still need human review.
      </p>
      {(result.contracts ?? []).filter(contract => contract.behavior_ambiguous).map(contract =>
        <ContractDetails key={contract.finding_id} contract={contract} />)}
      <div className="finding-list">
        {result.tests.map((test) => (
          <article className="finding" key={test.finding_id}>
            <div className="finding-meta">
              <span className={`severity ${test.execution_safe ? 'low' : 'high'}`}>
                {test.execution_safe ? 'SAFE · CHECKS PASSED' : 'NOT SAFE · REJECTED'}
              </span>
              <span>{test.framework}</span>
            </div>
            <h3>{test.test_name}</h3>
            <p>Related finding: {test.finding_title}</p>
            <p className="finding-location">
              <code>{test.file}</code> · {test.finding_id}
            </p>
            <ContractDetails contract={test.contract} />
            <div className="fix">
              <span>PURPOSE</span>
              <p>{test.purpose}</p>
            </div>
            <div className="fix">
              <span>EXPECTED BEHAVIOR</span>
              <p>{test.expected_behavior}</p>
            </div>
            {test.validation_errors.length > 0 && (
              <ul className="error">
                {test.validation_errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            )}
            <details className="changed-file generated-code">
              <summary>View generated test code</summary>
              <pre className="diff">
                <code>{test.test_code}</code>
              </pre>
            </details>
          </article>
        ))}
      </div>
      {result.tests.length === 0 && (
        <p className="empty muted">No supported test proposals were generated for this review.</p>
      )}
      {result.skipped_findings.length > 0 && (
        <details className="context-skipped">
          <summary>{result.skipped_findings.length} findings not selected for tests</summary>
          <ul>
            {result.skipped_findings.map((finding) => (
              <li key={finding.finding_id}>
                {finding.title} — {finding.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
