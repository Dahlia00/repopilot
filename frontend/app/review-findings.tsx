export type Finding = {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'Security' | 'Bug' | 'Performance' | 'Error Handling' | 'Code Quality';
  file: string;
  line: number | null;
  title: string;
  explanation: string;
  suggested_fix: string;
  confidence: number;
};

const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export default function ReviewFindings({
  findings,
  reviewedFiles,
  skippedFiles,
}: {
  findings: Finding[];
  reviewedFiles: string[];
  skippedFiles: string[];
}) {
  return (
    <section className="ai-results" aria-labelledby="ai-title">
      <div className="section-heading">
        <h2 id="ai-title">AI review findings</h2>
        <span className="muted small" role="status">
          {findings.length} findings
        </span>
      </div>
      <p className="muted small">
        {reviewedFiles.length} files reviewed · Full changed files reviewed with selected repository
        context.
      </p>
      <div className="severity-summary" aria-label="Finding counts by severity">
        {severities.map((severity) => (
          <span className={`severity ${severity.toLowerCase()}`} key={severity}>
            {severity}: {findings.filter((finding) => finding.severity === severity).length}
          </span>
        ))}
      </div>
      {skippedFiles.length > 0 && (
        <div className="notice">
          <p>Skipped {skippedFiles.length} files; see repository context below for reasons:</p>
          <ul>
            {skippedFiles.map((file) => (
              <li key={file}>
                <code>{file}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {findings.length === 0 ? (
        <p className="empty muted">
          {reviewedFiles.length === 0
            ? 'No changed files could be reviewed within the available content and limits.'
            : 'The AI reported no actionable findings in the reviewed changes.'}
        </p>
      ) : (
        <div className="finding-list">
          {findings.map((finding, index) => (
            <article className="finding" key={`${finding.file}:${finding.line}:${index}`}>
              <div className="finding-meta">
                <span className={`severity ${finding.severity.toLowerCase()}`}>
                  {finding.severity}
                </span>
                <span>{finding.category}</span>
                <span className="confidence">{finding.confidence}% confidence</span>
              </div>
              <p className="finding-location">
                <code>{finding.file}</code>
                {finding.line !== null && <span> · Line {finding.line}</span>}
              </p>
              <h3>{finding.title}</h3>
              <p>{finding.explanation}</p>
              <div className="fix">
                <span>SUGGESTED FIX</span>
                <p>{finding.suggested_fix}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
