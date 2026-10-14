import type {CSSProperties} from 'react';
import type {Finding} from '../review-findings';
const levels=['CRITICAL','HIGH','MEDIUM','LOW'] as const;
export default function SeverityRing({findings}: {findings:Pick<Finding,'severity'>[]}) {
  if(!findings.length)return null;
  const counts=levels.map(level=>({level,count:findings.filter(f=>f.severity===level).length}));
  return <section className="severity-distribution" aria-labelledby="severity-heading">
    <div className="section-heading"><h2 id="severity-heading">Finding severity</h2><span className="muted small">Returned observations</span></div>
    <div className="ring-layout"><div className="ring-visual" key={counts.map(c=>c.count).join(':')}>
      <svg viewBox="0 0 180 180" role="img" aria-label={counts.map(c=>`${c.level}: ${c.count}`).join(', ')}>
        <circle className="ring-track" cx="90" cy="90" r="68"/>
        {counts.map((c,index)=>{if(!c.count)return null;const length=c.count/findings.length*100;const start=counts.slice(0,index).reduce((total,previous)=>total+previous.count,0)/findings.length*100;return <circle key={c.level} className={`ring-segment ${c.level.toLowerCase()}`} cx="90" cy="90" r="68" pathLength="100" strokeDasharray={`${length} ${100-length}`} strokeDashoffset={-start}/>;})}
      </svg><div className="ring-center"><span className="ring-count mono" style={{'--finding-count':findings.length} as CSSProperties} aria-hidden="true"/><span className="sr-only">{findings.length}</span><span className="muted small">findings</span></div>
    </div><ul className="ring-legend">{counts.map(c=><li key={c.level}><span className={`severity-dot ${c.level.toLowerCase()}`}/><span>{c.level.toLowerCase()}</span><strong className="mono">{c.count}</strong></li>)}</ul></div>
  </section>;
}
