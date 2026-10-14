import {SectionEyebrow} from '../ui/primitives';
import styles from './repository-context.module.css';

export default function RepositoryContextCopy() {
  return <>
    <div data-context-item><SectionEyebrow className={styles.eyebrow}>REPOSITORY CONTEXT</SectionEyebrow></div>
    <h2 data-context-item className={styles.heading}>Understand the change.<br/><span>See the full picture.</span></h2>
    <p data-context-item data-context-body className={styles.description}>RepoPilot connects changed files with related code and dependencies so reviews have the context they need.</p>
    <ul data-context-item data-context-body className={styles.legend}><li>Changed files</li><li>Dependencies</li><li>Related context</li></ul>
  </>;
}
export function RepositoryContextIllustration() {
  const nodes=[{name:'auth.py',x:15,y:25},{name:'middleware.py',x:205,y:75},{name:'routes.py',x:390,y:25},{name:'api.py',x:15,y:180},{name:'database.py',x:390,y:180},{name:'utils.py',x:205,y:265}];
  return <figure className={styles.illustration} aria-label="Illustrative repository graph linking changed files, related context, and dependencies">
    <svg viewBox="0 0 560 370" role="img" aria-label="Example repository relationships">
      <g fill="none" strokeWidth="1.2"><path d="M145 55Q170 55 205 105T390 55" stroke="#38cff8"/><path d="M145 210Q270 100 390 210" stroke="#8b5cf6"/><path d="M270 135V265M145 210Q180 295 205 295" stroke="#3978ff"/></g>
      {nodes.map(({name,x,y},i)=><g key={name} transform={`translate(${x} ${y})`}><rect width="150" height="60" rx="7" fill="#ffffff" stroke={i===0||i===3?'#8b5cf6':i===1||i===4?'#13859a':'#8391aa'}/><circle cx="17" cy="23" r="3" fill={i===0||i===3?'#8255db':i===1||i===4?'#13859a':'#8391aa'}/><text x="28" y="27" fill="#1d2941" fontSize="12" fontFamily="monospace">{name}</text><path d="M14 42H84M14 47H111" stroke="#6a80b5" opacity=".4"/></g>)}
    </svg>
  </figure>;
}
