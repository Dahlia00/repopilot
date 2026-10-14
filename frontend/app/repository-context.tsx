export type SkippedFileMetadata = { path: string; reason: string };
export type ContextFileMetadata = SkippedFileMetadata & { used_for: string[] };

export default function RepositoryContext({
  files,
  warnings,
  skippedFiles,
  repository,
  commit,
}: {
  files: ContextFileMetadata[];
  warnings: string[];
  skippedFiles: SkippedFileMetadata[];
  repository: string;
  commit: string;
}) {
  return (
    <section className="repository-context" aria-labelledby="context-title">
      <div className="section-heading">
        <h2 id="context-title">Selected files</h2>
        <span className="muted small">{files.length} context files used</span>
      </div>
      <p className="muted small context">
        {repository} · Head commit <code>{commit.slice(0, 12)}</code>
      </p>
      {files.length > 0 ? (
        <ul className="context-list">
          {files.map((file) => (
            <li key={file.path}>
              <code className="truncate" title={file.path}>{file.path}</code>
              <p>{file.reason}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No additional context files were included in the review.</p>
      )}
      {warnings.length > 0 && (
        <div className="notice">
          <p>Context coverage notes</p>
          <ul>
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {skippedFiles.length > 0 && (
        <details className="context-skipped">
          <summary>{skippedFiles.length} changed files skipped</summary>
          <ul>
            {skippedFiles.map((file) => (
              <li key={file.path}>
                <code className="truncate" title={file.path}>{file.path}</code> — {file.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
