'use client';
import {useState, type FormEvent} from 'react';
import type {Analysis, Review} from './types';
import type {AgentReview} from '../agent-dashboard';
import type {TestGeneration} from '../generated-tests';
import type {FixGeneration, FixArtifact} from '../proposed-fixes';
import type {FixVerification} from '../fix-verification';
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function useReviewWorkspace() {
  const [repository, setRepository] = useState('');
  const [pullRequest, setPullRequest] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [generated, setGenerated] = useState<TestGeneration | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [fixes, setFixes] = useState<FixGeneration | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState('');
  const [verification, setVerification] = useState<FixVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [agents, setAgents] = useState<AgentReview | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState('');
  const busy = loading || reviewing || generating || fixing || verifying || agentLoading;

  function clearResults() {
    setAnalysis(null);
    setReview(null);
    setError('');
    setReviewError('');
    setAgents(null);
    setAgentError('');
    setFixes(null);
    setFixError('');
    setVerification(null);
    setVerificationError('');
    setGenerated(null);
    setGenerationError('');
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    clearResults();
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
      const result = (await response.json()) as Analysis;
      setAnalysis(result);
      return result;
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
  async function reviewAnalysis(pr: Analysis) {
    setReview(null);
    setReviewError('');
    setAgents(null);
    setAgentError('');
    setFixes(null);
    setFixError('');
    setVerification(null);
    setVerificationError('');
    setGenerated(null);
    setGenerationError('');
    setReviewing(true);
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repository: pr.repository,
          pull_request: pr.pull_request,
        }),
        signal: AbortSignal.timeout(480000),
      });
      if (!response.ok) {
        const body: { detail?: unknown } = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.detail === 'string'
            ? body.detail
            : `AI review failed (HTTP ${response.status}). Please try again.`,
        );
      }
      const result = (await response.json()) as Review;
      setAnalysis(result);
      setReview(result);
    } catch (err) {
      setReviewError(
        err instanceof TypeError
          ? 'Could not connect to RepoPilot API. Check that the backend is running.'
          : err instanceof Error && ['TimeoutError', 'AbortError'].includes(err.name)
            ? 'AI review timed out. Please try again.'
            : err instanceof Error
              ? err.message
              : 'AI review failed. Please try again.',
      );
    } finally {
      setReviewing(false);
    }
  }

  async function analyzeWithAI() {
    if (!analysis || busy) return;
    await reviewAnalysis(analysis);
  }

  async function runFullReview(event: FormEvent<HTMLFormElement>) {
    // Use the returned PR directly; React may not have committed setAnalysis yet.
    const pr = await analyze(event);
    if (!pr) return;
    await reviewAnalysis(pr);
  }

  async function generateTestProposals() {
    if (!review || busy) return;
    setGenerated(null);
    setGenerationError('');
    setGenerating(true);
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/generate-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository: review.repository, pull_request: review.pull_request }),
        signal: AbortSignal.timeout(600000),
      });
      if (!response.ok) {
        const body: { detail?: unknown } = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.detail === 'string'
            ? body.detail
            : `Test generation failed (HTTP ${response.status}).`,
        );
      }
      setGenerated((await response.json()) as TestGeneration);
    } catch (err) {
      setGenerationError(
        err instanceof TypeError
          ? 'Could not connect to RepoPilot API.'
          : err instanceof Error && ['TimeoutError', 'AbortError'].includes(err.name)
            ? 'Test generation timed out. Please try again.'
            : err instanceof Error
              ? err.message
              : 'Test generation failed.',
      );
    } finally {
      setGenerating(false);
    }
  }

  async function generateFixProposals() {
    if (!review || busy) return;
    setFixes(null);
    setFixError('');
    setVerification(null);
    setVerificationError('');
    setFixing(true);
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/generate-fixes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository: review.repository, pull_request: review.pull_request,
          test_artifacts: generated ?? undefined }),
        signal: AbortSignal.timeout(780000),
      });
      if (!response.ok) {
        const body: { detail?: unknown } = await response.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : `Fix generation failed (HTTP ${response.status}).`);
      }
      setFixes((await response.json()) as FixGeneration);
    } catch (err) {
      setFixError(err instanceof TypeError ? 'Could not connect to RepoPilot API.'
        : err instanceof Error && ['TimeoutError', 'AbortError'].includes(err.name)
          ? 'Fix generation timed out. Please try again.'
          : err instanceof Error ? err.message : 'Fix generation failed.');
    } finally {
      setFixing(false);
    }
  }

  async function verifyFixProposal(fix: FixArtifact, artifactsSource: FixGeneration | null = fixes) {
    if (!artifactsSource || !fix.finding || busy) return;
    setVerification(null);
    setVerificationError('');
    setVerifying(true);
    try {
      const artifacts = artifactsSource.test_artifacts;
      const relatedTest = artifacts?.tests.find(test => test.execution_safe &&
        artifacts.findings.some(finding => finding.finding_id === test.finding_id &&
          finding.file === fix.file && finding.line === fix.finding?.line));
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/verify-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repository: artifactsSource.repository, pull_request: artifactsSource.pull_request, head_sha: artifactsSource.head_sha,
          finding: fix.finding, validated_fix: fix, validated_test: relatedTest ?? null,
        }),
        signal: AbortSignal.timeout(210000),
      });
      if (!response.ok) {
        const body: { detail?: unknown } = await response.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : `Verification failed (HTTP ${response.status}).`);
      }
      const result = (await response.json()) as FixVerification['results'][number];
      setVerification({ repository: artifactsSource.repository, pull_request: artifactsSource.pull_request, head_sha: artifactsSource.head_sha,
        results: [result], fixes_verified: result.status === 'SKIPPED' ? 0 : 1,
        passed: result.status === 'PASSED' ? 1 : 0, failed: result.status === 'FAILED' ? 1 : 0,
        skipped: result.status === 'SKIPPED' ? 1 : 0 });
    } catch (err) {
      setVerificationError(err instanceof TypeError ? 'Could not connect to RepoPilot API.'
        : err instanceof Error && ['TimeoutError', 'AbortError'].includes(err.name)
          ? 'Deterministic verification timed out. Please try again.'
          : err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  }

  async function runAgentReview() {
    if (!analysis || busy) return;
    setAgents(null); setAgentError(''); setAgentLoading(true);
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/agent-review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({repository: analysis.repository, pull_request: analysis.pull_request}),
        signal: AbortSignal.timeout(1020000),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(typeof value.detail === 'string' ? value.detail : 'Agent review failed.');
      setAgents(value as AgentReview);
    } catch (err) { setAgentError(err instanceof Error ? err.message : 'Agent review failed.'); }
    finally { setAgentLoading(false); }
  }

  return { repository, pullRequest, analysis, review, generated, fixes, verification, agents,
    loading, reviewing, generating, fixing, verifying, agentLoading, busy,
    error, reviewError, generationError, fixError, verificationError, agentError,
    setRepository, setPullRequest, clearResults, analyze, analyzeWithAI, runFullReview,
    generateTestProposals, generateFixProposals, verifyFixProposal, runAgentReview };
}
export type ReviewWorkspace = ReturnType<typeof useReviewWorkspace>;
