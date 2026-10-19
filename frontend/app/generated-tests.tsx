import {countLabel} from './workspace/ui-copy';
import {MetricStrip, PageIntro} from './workspace/product-primitives';
import styles from './resolution.module.css';
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
  return <section className="ai-results" aria-labelledby="tests-title"><div className="section-heading"><h2 id="tests-title">Tests for expected behavior</h2></div><PageIntro>Focused tests help confirm what the code should do. Safety validation is separate from running a test; execution results appear in Verification.</PageIntro>
    <MetricStrip items={[{label:'Test artifacts',value:result.total_tests,icon:'test',detail:'Generated or reused from the repository'},{label:'Ready for verification',value:result.safe_tests,icon:'verify',detail:'Passed static safety checks'},{label:'Rejected tests',value:result.rejected_tests,icon:'issue',tone:result.rejected_tests?'attention':undefined,detail:'Not eligible for execution'}]}/>
    <p className="muted small">Saved at commit <code>{result.head_sha.slice(0,12)}</code>. No tests run on this page.</p>
    {result.tests.map(test=>{const existing=test.purpose.startsWith('Existing repository test:');return <article className={styles.testPanel} key={JSON.stringify([test.finding_id,test.file,test.test_code])}><div className="finding-meta"><span className={styles.badge} data-tone={test.execution_safe?'ready':'attention'}>{test.execution_safe?'Ready for verification':'Needs review'}</span><span>{existing?'Existing repository test':'Generated test'} · {test.framework}</span></div><h3>{test.contract&&!test.contract.behavior_ambiguous?existing?'Trusted repository test':'Validated generated test':'Expected behavior needs review'}</h3><p>{existing?'RepoPilot found an existing test that establishes how this code should behave.':'RepoPilot prepared a focused test from the finding and repository evidence.'}</p><p>Related issue: {test.finding_title}</p><p className="finding-location"><code>{test.file}</code></p>
      {test.validation_errors.length>0 && <p className="error">{test.validation_errors[0]}</p>}
      <details className="changed-file generated-code"><summary>Why this test is trusted · technical details</summary><ContractDetails contract={test.contract}/><p>Finding ID: <code>{test.finding_id}</code></p><h4>Purpose</h4><p>{test.purpose}</p><h4>Expected behavior</h4><p>{test.expected_behavior}</p><p>Test name: <code>{test.test_name}</code></p>{test.validation_errors.length>0 && <ul className="error">{test.validation_errors.map((e,i)=><li key={i}>{e}</li>)}</ul>}<h4>Validated test code</h4><pre className="diff"><code>{test.test_code}</code></pre></details>
    </article>;})}
    {!result.tests.length && <p className="section-empty">No supported test artifacts are available. Review the reasons below.</p>}
    {result.contracts.some(c=>c.behavior_ambiguous) && <details className="context-skipped"><summary>Expected behavior needing review</summary>{result.contracts.filter(c=>c.behavior_ambiguous).map(c=><ContractDetails key={JSON.stringify([c.finding_id,c.file,c.function])} contract={c}/>)}</details>}
    {result.skipped_findings.length>0 && <details className="context-skipped"><summary>{countLabel(result.skipped_findings.length,'finding')} not selected for tests</summary><ul>{result.skipped_findings.map((f,i)=><li key={`${f.finding_id}:${i}`}>{f.title} — {f.reason}</li>)}</ul></details>}
  </section>;
}
