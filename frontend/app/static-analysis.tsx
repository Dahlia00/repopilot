export type StaticFinding = {
  source: 'bandit' | 'semgrep';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'Security' | 'Bug' | 'Performance' | 'Code Quality';
  file: string;
  line: number | null;
  rule_id: string;
  title: string;
  explanation: string;
};
export type ScannerReport = {
  source: 'bandit' | 'semgrep';
  status: 'completed' | 'partial' | 'unavailable' | 'skipped' | 'error' | 'timeout';
  message: string;
  files: string[];
};
export type CombinedSummary = {
  ai_findings: number;
  static_findings: number;
  unique_issues: number;
};

export function ReviewSummary({ summary }: { summary: CombinedSummary }) {
  return (
    <section className="combined-summary" aria-label="Combined review summary">
      <span>
        AI findings: <strong>{summary.ai_findings}</strong>
      </span>
      <span>
        Static findings: <strong>{summary.static_findings}</strong>
      </span>
      <span>
        Unique issues: <strong>{summary.unique_issues}</strong>
      </span>
    </section>
  );
}

export default function StaticAnalysis({
  findings,
  scanners,
  skippedFiles,
}: {
  findings: StaticFinding[];
  scanners: ScannerReport[];
  skippedFiles: { path: string; reason: string }[];
}) {
  return (
    <section className="ai-results" aria-labelledby="static-title">
      <div className="section-heading">
        <h2 id="static-title">Static analysis</h2>
        <span className="muted small">{findings.length} static findings</span>
      </div>
      <p className="muted small">
        Rule-based checks of full changed files. Scanner findings may include pre-existing issues.
      </p>
      <div className="scanner-reports">
        {scanners.map((scanner) => (
          <div className="scanner-report" key={scanner.source}>
            <strong>{scanner.source === 'bandit' ? 'Bandit' : 'Semgrep'}</strong>
            <span className="tag">{scanner.status}</span>
            <p>{scanner.message}</p>
          </div>
        ))}
      </div>
      <div className="finding-list">
        {findings.map((finding, index) => (
          <article
            className="finding"
            key={`${finding.source}:${finding.rule_id}:${finding.file}:${finding.line}:${index}`}
          >
            <div className="finding-meta">
              <span className={`severity ${finding.severity.toLowerCase()}`}>
                {finding.severity}
              </span>
              <span className="tag">{finding.source === 'bandit' ? 'Bandit' : 'Semgrep'}</span>
              <span>{finding.category}</span>
              <code>{finding.rule_id}</code>
            </div>
            <p className="finding-location">
              <code>{finding.file}</code>
              {finding.line !== null && <span> · Line {finding.line}</span>}
            </p>
            <h3>{finding.title}</h3>
            <p>{finding.explanation}</p>
          </article>
        ))}
      </div>
      {findings.length === 0 && (
        <p className="muted small">
          No static findings returned. Check scanner statuses for coverage.
        </p>
      )}
      {skippedFiles.length > 0 && (
        <details className="context-skipped">
          <summary>{skippedFiles.length} files excluded from static analysis</summary>
          <ul>
            {skippedFiles.map((file) => (
              <li key={file.path}>
                <code>{file.path}</code> — {file.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
