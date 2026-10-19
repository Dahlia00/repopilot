import {countLabel} from './workspace/ui-copy';
import {MetricStrip, PageIntro} from './workspace/product-primitives';
import CodeComparison from './workspace/code-comparison';
import styles from './resolution.module.css';
import mobile from './fixes-mobile.module.css';
import {proposalIdentity} from './workspace/proposal-identity';
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
  const ordered=[...result.fixes].sort((a,b)=>Number(b.safe_to_verify)-Number(a.safe_to_verify) || Number(b.compatibility.compatible)-Number(a.compatibility.compatible) || (b.confidence??0)-(a.confidence??0));
  const recommended=ordered[0];
  const panel=(fix:FixArtifact,primary:boolean)=><article className={`${styles.fixPanel} ${mobile.proposal}`} data-recommended={primary} key={proposalIdentity(fix)}>
    <div className={styles.fixTop}><div><p className={styles.label}>{primary?'RECOMMENDED PROPOSAL':'OTHER PROPOSAL'}</p><h3>{fix.title}</h3><p>Resolves: {fix.finding_title}</p><p className="finding-location"><code>{fix.file}</code></p><p className={`${styles.shortExplanation} ${mobile.desktopExplanation}`}>{fix.explanation.split(/\n\s*\n/)[0]}</p><details className={mobile.explanation}><summary><span>{fix.explanation.split(/\n\s*\n/)[0]}</span></summary></details></div>
      <div className={`${styles.fixAction} ${mobile.action}`}><div><span className="muted small">Confidence</span><strong>{fix.confidence}%</strong></div><div><span className="muted small">Verification eligibility</span><span className={styles.badge} data-tone={fix.safe_to_verify?'ready':'attention'}>{fix.safe_to_verify?'READY FOR VERIFICATION':'NOT ELIGIBLE FOR VERIFICATION'}</span></div><button type="button" className={primary?undefined:'secondary-button'} disabled={busy||!fix.safe_to_verify||!fix.finding} onClick={()=>onVerify(fix)}>Verify this fix <span aria-hidden="true">→</span></button></div>
    </div>
    <p className="muted small">{fix.compatibility.compatible&&!fix.compatibility.behavior_ambiguous?'The saved test and proposed behavior agree. Deterministic verification is still required.':fix.compatibility.reason}</p>
    {!fix.finding && <p className="muted small">The related finding is missing; verification is unavailable.</p>}
    <div className={styles.fixEvidence}><details><summary>Why this change · expected behavior</summary><ContractDetails contract={fix.contract}/><p className="muted small">Sources: {fix.sources.join(' + ')}</p></details><details className={mobile.comparison} open={primary}><summary>Before / after</summary><CodeComparison before={fix.original_code} after={fix.fixed_code}/></details><details><summary>Unified diff</summary><pre className="diff"><code>{fix.unified_diff||'No validated diff available.'}</code></pre></details></div>
    <details className="changed-file generated-code"><summary>Compatibility and validation details</summary><p>Finding ID: <code>{fix.finding_id}</code></p><p>Test/fix compatibility: {fix.compatibility.compatible?'Compatible':'Incompatible'} · {fix.compatibility.reason}</p><p>{fix.explanation}</p>{fix.validation_errors.length>0 && <ul className="error">{fix.validation_errors.map((error,index)=><li key={index}>{error}</li>)}</ul>}</details>
  </article>;
  return <section className={`ai-results ${mobile.page}`} aria-labelledby="fixes-title"><div className="section-heading"><h2 id="fixes-title">Proposed changes</h2></div><PageIntro>Review a focused change for each issue, then verify the exact proposal against its saved tests. Nothing is applied automatically.</PageIntro>
    <div className={mobile.metrics}><MetricStrip items={[{label:'Total proposals',value:result.total_fixes,detail:'Local changes suggested by review',icon:'fix'},{label:'Eligible for verification',value:result.safe_fixes,detail:'Ready to run deterministic checks',icon:'test'},{label:'Rejected proposals',value:result.rejected_fixes,detail:'Require further review',icon:'issue',tone:result.rejected_fixes?'attention':undefined}]}/></div>
    <p className="muted small">Snapshot <code>{result.head_sha.slice(0,12)}</code> · GitHub remains read-only by default.</p>
    {recommended?panel(recommended,true):<p className="section-empty">No justified local fixes were proposed.</p>}
    {ordered.length>1 && <div className={styles.otherProposals}><h3>Other proposals <span className="tag">{ordered.length-1}</span></h3>{ordered.slice(1).map(fix=><details key={proposalIdentity(fix)}><summary><span>{fix.title}</span><span className="muted small">{fix.confidence}% · {fix.safe_to_verify?'Ready to verify':'Needs review'}</span></summary>{panel(fix,false)}</details>)}</div>}
    {result.skipped_findings.length>0 && <details className="context-skipped"><summary>{countLabel(result.skipped_findings.length,'issue')} not selected for fixes</summary><ul>{result.skipped_findings.map((f,i)=><li key={`${f.finding_id}:${i}`}>{f.title} — {f.reason}</li>)}</ul></details>}
  </section>;
}
