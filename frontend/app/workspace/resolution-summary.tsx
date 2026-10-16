import type {WorkspaceData} from './data';
import type {SectionId} from './types';
import styles from './overview.module.css';
export default function ResolutionSummary({data:d,approved,onSelect}:{data:WorkspaceData;approved:number;onSelect:(id:SectionId)=>void}) {
  if(!d.tests?.total_tests && !d.fixes?.total_fixes && !d.verification) return null;
  return <section className={styles.resolution} aria-labelledby="resolution-heading"><h2 id="resolution-heading">Resolution</h2><div>
    {!!d.tests?.total_tests && <button type="button" onClick={()=>onSelect('tests')}><strong>{d.tests.total_tests} test proposals</strong><span>{d.tests.safe_tests} passed static safety checks · {d.tests.rejected_tests} rejected</span></button>}
    {!!d.fixes?.total_fixes && <button type="button" onClick={()=>onSelect('fixes')}><strong>{d.fixes.total_fixes} fix proposals</strong><span>{d.fixes.rejected_fixes} rejected · Verification required for unverified proposals</span></button>}
    {d.verification && <button type="button" onClick={()=>onSelect('verification')}><strong>{approved} verified {approved===1?'fix':'fixes'}</strong><span>{!d.verification.results.length?'No eligible fixes verified':approved===d.verification.results.length?'Individual proposals approved; nothing applied':'Human review required · Verification did not approve every fix'}</span></button>}
  </div></section>;
}
