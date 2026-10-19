import type {ReactNode} from 'react';
import styles from './product-ui.module.css';
export function ProductIcon({kind='code'}:{kind?:'code'|'issue'|'test'|'fix'|'verify'|'file'|'branch'}) {
  const paths={code:'m8 7-5 5 5 5m8-10 5 5-5 5',issue:'M12 8v5m0 3h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',test:'M9 3h6m-5 0v6l-5 9q-1 3 2 3h10q3 0 2-3l-5-9V3M8 15h8',fix:'M5 19 19 5M11 5h8v8',verify:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3m-4 9 3 3 5-6',file:'M6 3h9l4 4v14H6zM15 3v5h4M9 12h7m-7 4h7',branch:'M7 3v18m0-9h6q4 0 4-5V3M4 3h6m4 0h6'};
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}
export function MetricStrip({items}:{items:{label:string;value:ReactNode;detail?:string;tone?:string;icon?:Parameters<typeof ProductIcon>[0]['kind']}[]}) {
  return <div className={styles.metrics}>{items.map(item=><div className={styles.metric} key={item.label} data-tone={item.tone}><span className={styles.icon}><ProductIcon kind={item.icon}/></span><div><span>{item.label}</span><strong>{item.value}</strong>{item.detail && <small>{item.detail}</small>}</div></div>)}</div>;
}
export function ReviewIllustration({attention=false}:{attention?:boolean}){return <div className={styles.illustration} aria-hidden="true"><div/><div><i/><i/><i/><i/><span>{attention?'!':'↗'}</span></div></div>;}
export function PageIntro({children}:{children:ReactNode}) {return <p className={styles.intro}>{children}</p>;}
