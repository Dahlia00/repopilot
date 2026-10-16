import type {ReviewWorkspace} from './use-review-workspace';
import type {WorkspaceData} from './data';
import type {SectionId} from './types';
import {overviewState} from './overview-state';
import styles from './overview.module.css';
export default function PipelineFlow({workspace,data,onSelect}: {workspace:ReviewWorkspace;data:WorkspaceData;onSelect:(id:SectionId)=>void}) {
  const {stages}=overviewState(workspace,data);
  return <section className={styles.pipeline} aria-label="Review pipeline"><ol>{stages.map((stage,i)=><li key={stage.title} data-state={stage.state}>
    <button type="button" onClick={()=>onSelect(stage.section)} aria-label={`${stage.title}: ${stage.detail}`}>
      <span className={styles.index}>{stage.state==='done'?'✓':String(i+1).padStart(2,'0')}</span>
      <strong>{stage.title}</strong><small>{stage.detail}</small>
    </button>
  </li>)}</ol></section>;
}
