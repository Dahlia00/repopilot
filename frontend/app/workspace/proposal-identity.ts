import type {FixArtifact, FixGeneration} from '../proposed-fixes';
import type {FixVerification} from '../fix-verification';
function canonical(value:unknown):unknown {
  if(Array.isArray(value)) return value.map(canonical);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
export const artifactIdentity=(value:unknown)=>JSON.stringify(canonical(value));
export function proposalIdentity(fix:FixArtifact) {
  return artifactIdentity({finding_id:fix.finding_id,file:fix.file,title:fix.title,original_code:fix.original_code,
    fixed_code:fix.fixed_code,unified_diff:fix.unified_diff,contract:fix.contract,compatibility:fix.compatibility});
}
export function verificationIdentity(result:FixVerification['results'][number]) {
  return result.proposal?proposalIdentity(result.proposal):artifactIdentity({finding_id:result.finding_id,file:result.file,title:result.title});
}
export function verificationRequest(fix:FixArtifact,source:FixGeneration) {
  if(!fix.finding || !source.fixes.some(candidate=>proposalIdentity(candidate)===proposalIdentity(fix))) throw new Error('Selected proposal does not belong to these saved artifacts.');
  const artifacts=source.test_artifacts;
  const tests=artifacts?.head_sha===source.head_sha && artifacts.repository===source.repository && artifacts.pull_request===source.pull_request
    ? artifacts.tests.filter(test=>test.execution_safe && test.file===fix.file && fix.contract &&
      artifactIdentity(test.contract)===artifactIdentity(fix.contract) && artifacts.findings.some(finding=>
        finding.finding_id===test.finding_id && finding.file===fix.file && finding.line===fix.finding?.line)) : [];
  return {repository:source.repository,pull_request:source.pull_request,head_sha:source.head_sha,
    finding:fix.finding,validated_fix:fix,validated_test:tests?.length===1?tests[0]:null};
}
export function assertSelectedResult(fix:FixArtifact,result:FixVerification['results'][number]) {
  if(result.file!==fix.file || result.title!==fix.title || result.finding_id!==fix.finding_id || !result.proposal ||
    proposalIdentity(result.proposal)!==proposalIdentity(fix)) throw new Error('Verification returned a different proposal. No approval was recorded for the selected fix.');
}
