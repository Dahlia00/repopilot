'use client';
import {useState} from 'react';
import styles from './product-ui.module.css';
export default function CodeComparison({before,after}:{before:string;after:string}) {
  const [side,setSide]=useState<'before'|'after'>('before');
  return <div className={styles.comparison}><div role="group" aria-label="Code comparison"><button type="button" aria-pressed={side==='before'} onClick={()=>setSide('before')}>Before · current code</button><button type="button" aria-pressed={side==='after'} onClick={()=>setSide('after')}>After · proposed fix</button></div><pre><code>{side==='before'?before:after}</code></pre></div>;
}
