export type BehavioralContract = {
  finding_id: string;
  file: string;
  function: string;
  current_behavior: string;
  problem: string;
  desired_behavior: string | null;
  desired_behavior_confidence: number;
  contract_source: string;
  evidence_path: string | null;
  evidence_quote: string | null;
  behavior_ambiguous: boolean;
};
export type Compatibility = {
  compatible: boolean;
  reason: string;
  behavior_ambiguous: boolean;
};
export default function ContractDetails({ contract }: { contract: BehavioralContract | null }) {
  if (!contract) return <p className="muted small">Desired behavior is not established. Human review is required.</p>;
  return <div className="fix">
    <span>BEHAVIORAL CONTRACT · {contract.behavior_ambiguous ? 'AMBIGUOUS' : 'EVIDENCE PROVIDED'}</span>
    <p>Current: {contract.current_behavior}</p>
    <p>Desired: {contract.desired_behavior || 'Not established from repository evidence.'}</p>
    <p className="muted small">{contract.contract_source} · {contract.desired_behavior_confidence}% confidence{contract.evidence_path && ` · ${contract.evidence_path}`}</p>
    {contract.behavior_ambiguous && <p className="muted small">No automatic approval is possible while the desired behavior is ambiguous.</p>}
  </div>;
}
