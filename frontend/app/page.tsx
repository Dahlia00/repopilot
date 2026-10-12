'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
type ChangedFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
};
type Analysis = {
  repository: string;
  pull_request: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  base_branch: string;
  head_branch: string;
  changed_files: number;
  additions: number;
  deletions: number;
  files: ChangedFile[];
  files_truncated: boolean;
};
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Home() {
  const [repository, setRepository] = useState('');
  const [pullRequest, setPullRequest] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setAnalysis(null);
    const number = Number(pullRequest);
    if (
      !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository.trim()) ||
      ['.', '..'].includes(repository.trim().split('/')[1]) ||
      !Number.isSafeInteger(number) ||
      number < 1
    ) {
      setError(
        'Enter a repository in owner/repository format and a positive whole pull request number.',
      );
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository: repository.trim(), pull_request: number }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        const body: { detail?: unknown } = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.detail === 'string'
            ? body.detail
            : response.status === 422
              ? 'Enter a valid owner/repo and a positive whole pull request number.'
              : `GitHub lookup failed (HTTP ${response.status}). Please try again.`,
        );
      }
      setAnalysis((await response.json()) as Analysis);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Could not connect to RepoPilot API. Check that the backend is running on port 8000.'
          : err instanceof Error && ['TimeoutError', 'AbortError'].includes(err.name)
            ? 'The request timed out. Please try again.'
            : err instanceof Error
              ? err.message
              : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="shell">
      <header>
        <Link className="brand" href="/">
          <span className="logo">↗</span>RepoPilot
        </Link>
        <span className="mode">
          ● <span>Local preview</span>
        </span>
      </header>
      <main>
        <section className="intro">
          <p className="eyebrow">YOUR CODE. A CLEARER PERSPECTIVE.</p>
          <h1>RepoPilot</h1>
          <p className="subtitle">AI-powered code review and debugging assistant</p>
          <p className="muted">Explore real GitHub pull request details and changed files.</p>
        </section>
        <section className="panel" aria-labelledby="review-title">
          <div className="section-heading">
            <div>
              <h2 id="review-title">Inspect a pull request</h2>
              <p className="muted">Enter a repository and pull request number to get started.</p>
            </div>
            <span className="tag">GITHUB API</span>
          </div>
          <form onSubmit={analyze}>
            <div className="fields">
              <div>
                <label htmlFor="repository">GitHub repository</label>
                <input
                  id="repository"
                  placeholder="owner/repository"
                  value={repository}
                  onChange={(e) => setRepository(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={200}
                />
                <p className="hint">Use the repository owner and name.</p>
              </div>
              <div>
                <label htmlFor="pr">Pull Request number</label>
                <input
                  id="pr"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1"
                  value={pullRequest}
                  onChange={(e) => setPullRequest(e.target.value)}
                  required
                  disabled={loading}
                />
                <p className="hint">The number shown on GitHub.</p>
              </div>
            </div>
            <div className="form-footer">
              <p>Live GitHub data · No AI analysis is performed.</p>
              <button disabled={loading} type="submit">
                {loading && <span className="spinner" aria-hidden="true" />}
                {loading ? 'Fetching…' : 'Fetch Pull Request'}
                {!loading && <span aria-hidden="true">↗</span>}
              </button>
            </div>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
        <section className="results" aria-labelledby="pr-title" aria-busy={loading}>
          <div className="section-heading">
            <h2 id="pr-title">Pull request details</h2>
            <span className="muted small">
              {analysis ? 'Retrieved from GitHub' : 'Awaiting pull request'}
            </span>
          </div>
          <div role="status" aria-live="polite">
            {loading && (
              <p className="empty muted">Fetching pull request details and changed files…</p>
            )}
          </div>
          {analysis ? (
            <>
              <article className="pr-overview">
                <p className="muted context">
                  {analysis.repository} / PR #{analysis.pull_request}
                </p>
                <h3>{analysis.title}</h3>
                <div className="pr-meta">
                  <span className={`pr-state ${analysis.state}`}>{analysis.state}</span>
                  <span>
                    Opened by <strong>{analysis.author}</strong>
                  </span>
                </div>
                <p className="branches">
                  <code>{analysis.head_branch}</code>
                  <span aria-label="into"> → </span>
                  <code>{analysis.base_branch}</code>
                </p>
                <div className="pr-stats">
                  <span>
                    <strong>{analysis.changed_files}</strong> changed files
                  </span>
                  <span className="additions">+{analysis.additions} additions</span>
                  <span className="deletions">−{analysis.deletions} deletions</span>
                </div>
              </article>
              <h3 className="files-heading">Changed files</h3>
              {analysis.files_truncated && (
                <p className="notice">
                  Showing {analysis.files.length} of {analysis.changed_files} files. GitHub returns
                  at most 3,000 files; the PR may also have changed during retrieval.
                </p>
              )}
              <div className="file-list">
                {analysis.files.map((file) => (
                  <details className="changed-file" key={file.filename}>
                    <summary>
                      <span className="file-name">{file.filename}</span>
                      <span className="file-meta">
                        <span>{file.status}</span>
                        <span className="additions">+{file.additions}</span>
                        <span className="deletions">−{file.deletions}</span>
                      </span>
                    </summary>
                    {file.patch != null ? (
                      <pre className="diff">
                        <code>{file.patch}</code>
                      </pre>
                    ) : (
                      <p className="patch-missing">
                        GitHub did not provide a patch for this file. Binary files and some large
                        diffs may not include one.
                      </p>
                    )}
                  </details>
                ))}
              </div>
              {analysis.files.length === 0 && (
                <p className="empty muted">No changed files were returned for this pull request.</p>
              )}
            </>
          ) : (
            !loading && (
              <div className="empty">
                <span className="empty-icon" aria-hidden="true">
                  ⌘
                </span>
                <h3>Your pull request, at a glance</h3>
                <p className="muted">
                  Fetch a pull request to explore its branches, changed files, and diffs.
                </p>
                <p className="hint">Real GitHub data · Read-only · No AI review</p>
              </div>
            )
          )}
        </section>
        <footer>
          RepoPilot <span>Milestone 02 · GitHub integration</span>
        </footer>
      </main>
    </div>
  );
}
