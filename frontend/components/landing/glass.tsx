import type {CSSProperties, ReactNode} from 'react';
import {Icon, type IconName} from './icons';
import styles from './glass.module.css';

type Tone = 'violet' | 'blue' | 'cyan' | 'success' | 'danger';

export function GlassCard({tone = 'violet', strong, className, style, children}:
  {tone?: Tone; strong?: boolean; className?: string; style?: CSSProperties; children: ReactNode}) {
  return <div className={`${styles.card} ${strong ? styles.strong : ''} ${className ?? ''}`} data-tone={tone} style={style}>{children}</div>;
}

const codeShapes = [[62, 38, 80], [74, 52, 30], [46, 70, 58], [80, 34, 64], [56, 78, 42]];
const codeColors = ['#8b7bff', '#5ea2ff', '#58dcf5', '#7d8bb5'];

/** A source file as a floating card: name, a hint of code, and its diff stat. */
export function FileCard({name, added, removed, variant = 0, tone = 'violet', compact}:
  {name: string; added?: number; removed?: number; variant?: number; tone?: Tone; compact?: boolean}) {
  const shape = codeShapes[variant % codeShapes.length];
  return (
    <GlassCard tone={tone} className={styles.file}>
      <div className={styles.fileName}><Icon name="file" size="1em"/>{name}</div>
      <div className={styles.code}>
        {shape.slice(0, compact ? 2 : 3).map((width, index) =>
          <i key={index} style={{width: `${width}%`, background: codeColors[(index + variant) % codeColors.length]}}/>)}
      </div>
      {added !== undefined && <div className={styles.diff}><span>+{added}</span><span>−{removed}</span></div>}
    </GlassCard>
  );
}

/** A titled card holding a short list, e.g. related files or services. */
export function ListCard({title, icon, items, tone = 'violet'}:
  {title: string; icon: IconName; items: {label: string; icon: IconName}[]; tone?: Tone}) {
  return (
    <GlassCard tone={tone} className={styles.list}>
      <div className={styles.listTitle}><Icon name={icon} size="1.15em"/>{title}</div>
      <ul>{items.map(item => <li key={item.label}><Icon name={item.icon} size="1.05em"/>{item.label}</li>)}</ul>
    </GlassCard>
  );
}

/** A compact check result with a glowing success marker. */
export function CheckCard({icon, title, detail}: {icon: IconName; title: string; detail: string}) {
  return (
    <GlassCard tone="success" className={styles.check}>
      <span className={styles.checkIcon}><Icon name={icon} size="1.35em"/></span>
      <span className={styles.checkText}><strong>{title}</strong><small>{detail}</small></span>
      <span className={styles.tick}><Icon name="check" size=".85em" strokeWidth="3"/></span>
    </GlassCard>
  );
}

export function GithubTile() {
  return <GlassCard tone="blue" strong className={styles.tile}><Icon name="github" size="2.3em"/></GlassCard>;
}
