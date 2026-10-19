import type {FixVerification} from '../fix-verification';
export type VerificationItem=FixVerification['results'][number];
export function verificationGroup(result:VerificationItem):'approved'|'needs-review'|'failed' {
  if(result.status==='PASSED' && result.safe_to_apply && result.proposal && result.compatibility.compatible && !result.compatibility.behavior_ambiguous) return 'approved';
  return result.status==='FAILED'?'failed':'needs-review';
}
export function verificationReason(result:VerificationItem) {
  if(verificationGroup(result)==='approved') return 'The exact proposal met the available test and security-check requirements.';
  const raw=`${result.verification_summary} ${result.compatibility.reason}`.toLowerCase();
  if(result.syntax_check.status==='FAILED') return 'The proposed code did not pass the syntax or code-safety checks.';
  if(/sandbox|isolation/.test(raw)) return 'The isolated test environment was unavailable or could not pass its safety checks.';
  if(/execution gate|ast|rejected|unsafe|safety/.test(raw)) return 'The proposal did not meet the requirements for safe verification.';
  if(/no related|missing.*test|no.*regression test/.test(raw)) return 'No trusted regression test was available.';
  if(result.compatibility.behavior_ambiguous) return /evidence|contract|repository/.test(raw)?'Not enough trusted repository evidence was found.':'Expected behavior could not be confirmed.';
  if(result.regression_tests.status==='FAILED') return 'The regression test did not pass after the proposed change.';
  if([result.bandit_before,result.bandit_after,result.semgrep_before,result.semgrep_after].some(check=>check.status==='FAILED')) return 'A security scanner failed or found a problem that prevents approval.';
  if(!result.compatibility.compatible) return 'The proposed change could not be shown to agree with the saved test expectations.';
  if(/baseline|fail.before|reproduced/.test(raw)) return 'The test did not demonstrate the original problem before the change.';
  if(/scanner|bandit|semgrep/.test(raw)) return 'Security checks were incomplete or found a problem that prevents approval.';
  if(/rejected|unsafe|safety/.test(raw)) return 'The proposal did not meet the requirements for safe verification.';
  return 'Some required checks could not finish or did not provide enough evidence to approve this fix.';
}
export function verificationGroups(results:VerificationItem[]) {
  return {approved:results.filter(r=>verificationGroup(r)==='approved'),needsReview:results.filter(r=>verificationGroup(r)==='needs-review'),failed:results.filter(r=>verificationGroup(r)==='failed')};
}
