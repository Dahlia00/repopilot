'use client';
import { useState } from 'react';
import GeneratedTests, { type TestGeneration } from './generated-tests';
import Verification, { type FixVerification } from './fix-verification';

type Observation = {
  finding_id: string; severity: string; title: string; file: string; line: number | null;
  status: string; confidence: number;
  evidence: { source: string; agent: string; title: string; explanation: string; rule_id: string | null }[];
};
export type AgentReview = {
  review_id: string;
  pr: { repository: string; pull_request: number; head_sha: string };
  agents: { agent: string; status: string; findings: Observation[]; notes: string[] }[];
  findings: Observation[];
  tests: TestGeneration;
  fixes: { fixes: { finding_id: string; title: string; safe_to_verify: boolean; compatibility: { compatible: boolean; reason: string; behavior_ambiguous: boolean } }[] };
  verification: FixVerification;
  senior_review: { decision: string; summary: string; blocking_findings: string[]; non_blocking_findings: string[];
    verified_fixes: string[]; human_review_required: string[]; coverage_gaps: string[] };
  github_write_enabled: boolean;
};
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
export default function AgentDashboard({ result }: { result: AgentReview }) {
  const [preview,setPreview]=useState<unknown>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  async function showPreview(kind: string, findingId?: string) {
    setLoading(true);setError('');setPreview(null);
    try {
      const response=await fetch(`${apiUrl.replace(/\/$/,'')}/github/preview-${kind}`, {
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({repository:result.pr.repository,pull_request:result.pr.pull_request,review_id:result.review_id,
          finding_id:findingId,confirm_write:false}),signal:AbortSignal.timeout(15000),
      });
      const value=await response.json();
      if (!response.ok) throw new Error(typeof value.detail==='string'?value.detail:'Preview failed.');
      setPreview(value);
    } catch (err) {setError(err instanceof Error?err.message:'Preview failed.');}
    finally {setLoading(false);}
  }
  function label(id: string) {return result.findings.find(f=>f.finding_id===id)?.title || result.fixes.fixes.find(f=>f.finding_id===id)?.title || id;}
  return <section className="ai-results" aria-labelledby="agents-title">
    <div className="section-heading"><h2 id="agents-title">Agent Review</h2><span className="muted small">{result.pr.head_sha.slice(0,12)}</span></div>
    <div className="finding-list">{result.agents.map(agent=><article className="finding" key={agent.agent}>
      <div className="finding-meta"><span className="tag">{agent.agent.toUpperCase()} AGENT</span><span>{agent.status} · {agent.findings.length} observations</span></div>
      {agent.findings.map(f=><details className="context-skipped" key={f.finding_id}>
        <summary>{f.severity} · {f.title} · {f.status}</summary>
        <p className="finding-location">{f.file}{f.line && `:${f.line}`} · {f.confidence}% confidence</p>
        <ul>{f.evidence.map((e,i)=><li key={i}>{e.source}{e.rule_id && ` · ${e.rule_id}`}: {e.explanation}</li>)}</ul>
      </details>)}
      {agent.notes.length>0 && <details className="context-skipped"><summary>Coverage and service notes</summary><ul>{agent.notes.map((note,i)=><li key={i}>{note}</li>)}</ul></details>}
    </article>)}</div>
    <h2>Senior Engineer Summary</h2>
    <p><strong>{result.senior_review.decision}</strong> · Advisory only</p>
    <p>{result.senior_review.summary}</p>
    {[['Blocking issues',result.senior_review.blocking_findings],['Other issues',result.senior_review.non_blocking_findings],['Human review required',result.senior_review.human_review_required],['Verified fixes',result.senior_review.verified_fixes]].map(([title,ids])=><details className="context-skipped" key={title as string}>
      <summary>{title as string}: {(ids as string[]).length}</summary><ul>{(ids as string[]).map(id=><li key={id}>{label(id)}</li>)}</ul>
    </details>)}
    {result.senior_review.coverage_gaps.length>0 && <details className="context-skipped"><summary>Incomplete coverage</summary><ul>{result.senior_review.coverage_gaps.map((note,i)=><li key={i}>{note}</li>)}</ul></details>}
    <GeneratedTests result={result.tests} />
    <h2>Agent fix proposals</h2>
    {result.fixes.fixes.length===0 && <p className="muted small">No fix proposals were returned.</p>}
    {result.fixes.fixes.map(f=><p key={f.finding_id}>{f.title} · {f.compatibility.behavior_ambiguous?'AMBIGUOUS':f.compatibility.compatible?'COMPATIBLE':'INCOMPATIBLE'} · {f.compatibility.reason}</p>)}
    <Verification result={result.verification} />
    <h2>GitHub Actions</h2>
    <p className="tag">{result.github_write_enabled?'WRITE MODE ENABLED · PREVIEWS ONLY IN THIS UI':'READ-ONLY MODE'}</p>
    {!result.github_write_enabled && <p>GitHub writes are disabled.</p>}
    <p className="muted small">Preview buttons never publish anything. Review artifacts expire after ten minutes or a backend restart.</p>
    <div className="test-generation-action"><button type="button" disabled={loading} onClick={()=>showPreview('review')}>Preview review comment</button></div>
    {result.senior_review.verified_fixes.map(id=><div className="test-generation-action" key={id}><button type="button" disabled={loading} onClick={()=>showPreview('fix-pr',id)}>Preview verified fix PR · {label(id)}</button></div>)}
    {result.senior_review.verified_fixes.length===0 && <div className="test-generation-action"><button type="button" disabled={loading} onClick={()=>showPreview('fix-pr')}>Preview verified fix PR</button><p className="muted small">No eligible verified fix; this preview will explain why publication is unavailable.</p></div>}
    {error && <p className="error" role="alert">{error}</p>}
    {preview!==null && <details className="changed-file generated-code" open><summary>Exact GitHub action preview · no writes</summary><pre className="diff"><code>{JSON.stringify(preview,null,2)}</code></pre></details>}
  </section>;
}
