import styles from './hero-repository-scene.module.css';

export function PullRequestFace() {
  return <div className={styles.prFace}>
    <div className={styles.panelTop}><span className={styles.branch}>⑂</span><span>Pull Request</span><span className={styles.panelDot} /></div>
    <div className={styles.tabs}><span>Review</span><span>Checks</span><span>Files</span></div>
    <div className={styles.process}><i />Fix suggestions<span>↗</span></div>
    <div className={styles.process}><i />Tests passing · example<span>↗</span></div>
    <div className={styles.codeLines}><b /><b /><b /></div>
  </div>;
}
export function FileFace({name}: {name: string}) {
  return <div className={styles.fileFace}><div><span className={styles.fileIcon}>⌘</span>{name}</div><div className={styles.fileLines}><b /><b /><b /></div></div>;
}
export default function HeroRepositoryFallback() {
  return <div className={styles.fallback} aria-hidden="true">
    <svg className={styles.fallbackPaths} viewBox="0 0 600 460" fill="none"><path d="M300 230C160 230 180 80 90 80M300 230C440 230 420 100 510 100M300 230C150 230 180 365 90 365M300 230C450 230 420 370 510 370" stroke="url(#repo-path)" strokeWidth="1"/><defs><linearGradient id="repo-path"><stop stopColor="#6c63ff"/><stop offset="1" stopColor="#38cff8"/></linearGradient></defs></svg>
    <div className={styles.fallbackCenter}><PullRequestFace /></div>
    <div className={styles.platform}><span>REPOSITORY / VERIFY</span></div>
    {['auth.py','routes.py','tests.py','config.ts'].map((name,i)=><div key={name} className={`${styles.fallbackFile} ${styles[`file${i}`]}`}><FileFace name={name}/></div>)}
  </div>;
}
