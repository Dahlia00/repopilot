import type {Analysis} from './types';
import DiffView from './diff-view';
export default function ChangedFiles({pr}: {pr:Analysis}) {
  return <section className="changed-files-section">
    <div className="section-heading"><h2>Changed files</h2><span className="mono muted small">{pr.files.length} returned</span></div>
    <article className="pr-overview">
      <p className="mono muted context">{pr.repository} / PR #{pr.pull_request}</p><h3>{pr.title}</h3>
      <div className="pr-meta"><span className={`pr-state ${pr.state}`}>{pr.state}</span><span>Opened by <strong>{pr.author}</strong></span></div>
      <p className="branches"><code>{pr.head_branch}</code> → <code>{pr.base_branch}</code></p>
      <div className="pr-stats"><span><strong>{pr.changed_files}</strong> changed files</span><span className="additions">+{pr.additions} additions</span><span className="deletions">−{pr.deletions} deletions</span></div>
    </article>
    {pr.files_truncated && <p className="notice">Showing {pr.files.length} of {pr.changed_files} files. GitHub may truncate large PRs or the PR may have changed during retrieval.</p>}
    <div className="file-list">{pr.files.map(file=><details className="changed-file" key={file.filename}>
      <summary><span className="file-name truncate" title={file.filename}>{file.filename}</span><span className="file-meta"><span>{file.status}</span><span className="additions">+{file.additions}</span><span className="deletions">−{file.deletions}</span></span></summary>
      <DiffView file={file}/>
    </details>)}</div>
    {!pr.files.length && <p className="section-empty">No changed files were returned.</p>}
  </section>;
}
