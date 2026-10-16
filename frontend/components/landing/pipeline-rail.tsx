import type {CSSProperties} from 'react';
import {Icon, type IconName} from './icons';
import styles from './pipeline-rail.module.css';

const steps: {icon: IconName; label: string}[] = [
  {icon: 'branch', label: 'Pull request'},
  {icon: 'graph', label: 'Context'},
  {icon: 'sparkle', label: 'AI review'},
  {icon: 'flask', label: 'Tests'},
  {icon: 'shield', label: 'Security'},
  {icon: 'checkCircle', label: 'Verified'},
  {icon: 'merge', label: 'Merge'},
];

/** The RepoPilot pipeline as a rail; a beam of light travels it and wakes each stage in turn. */
export default function PipelineRail() {
  return (
    <ol className={styles.rail} style={{'--steps': steps.length} as CSSProperties} aria-label="RepoPilot pipeline">
      <span className={styles.track} aria-hidden="true"><i/></span>
      {steps.map((step, index) => (
        <li key={step.label} style={{'--i': index} as CSSProperties}>
          <span className={styles.chip}><Icon name={step.icon} size={18}/></span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}
