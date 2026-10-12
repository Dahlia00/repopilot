'use client';
import { useState, type FormEvent } from 'react';
type Finding = {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  title: string;
  explanation: string;
  suggested_fix: string;
};
type Analysis = { repository: string; pull_request: number; findings: Finding[] };
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
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.trim()) ||
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
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 422
            ? 'The repository or pull request number is invalid.'
            : `Analysis failed (HTTP ${response.status}). Please try again.`,
        );
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
        <a className="brand" href="/">
          <span className="logo">↗</span>RepoPilot
        </a>
        <span className="mode">
          ● <span>Local preview</span>
        </span>
      </header>
      <main>
        <section className="intro">
          <p className="eyebrow">YOUR CODE. A CLEARER PERSPECTIVE.</p>
          <h1>RepoPilot</h1>
          <p className="subtitle">AI-powered code review and debugging assistant</p>
          <p className="muted">
            Bring your pull request into focus with clear, actionable findings.
          </p>
        </section>
        <section className="panel" aria-labelledby="review-title">
          <div className="section-heading">
            <div>
              <h2 id="review-title">Review a pull request</h2>
              <p className="muted">Enter a repository and pull request number to get started.</p>
            </div>
            <span className="tag">MOCK DATA</span>
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
              <p>Demo mode · No repository code is accessed.</p>
              <button disabled={loading} type="submit">
                {loading && <span className="spinner" aria-hidden="true" />}
                {loading ? 'Analyzing…' : 'Analyze Pull Request'}
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
        <section className="results" aria-labelledby="findings-title" aria-busy={loading}>
          <div className="section-heading">
            <h2 id="findings-title">Review findings</h2>
            <span className="muted small">
              {analysis ? `${analysis.findings.length} findings` : 'Awaiting analysis'}
            </span>
          </div>
          <div role="status" aria-live="polite">
            {loading && <p className="empty muted">Preparing mock review findings…</p>}
          </div>
          {analysis ? (
            <>
              <p className="muted context">
                {analysis.repository} / PR #{analysis.pull_request} · Mock findings
              </p>
              <div className="finding-list">
                {analysis.findings.map((f) => (
                  <article className="finding" key={f.severity}>
                    <div className="finding-meta">
                      <span className={`severity ${f.severity.toLowerCase()}`}>{f.severity}</span>
                      <span>{f.category}</span>
                    </div>
                    <h3>{f.title}</h3>
                    <p>{f.explanation}</p>
                    <div className="fix">
                      <span>SUGGESTED FIX</span>
                      <p>{f.suggested_fix}</p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            !loading && (
              <div className="empty">
                <span className="empty-icon" aria-hidden="true">
                  ⌘
                </span>
                <h3>A fresh perspective on your next PR</h3>
                <p className="muted">Your findings will appear here after you run an analysis.</p>
                <p className="hint">Security · Bugs · Code quality</p>
              </div>
            )
          )}
        </section>
        <footer>
          RepoPilot <span>Milestone 01 · Local foundation</span>
        </footer>
      </main>
    </div>
  );
}
