'use client';
import {useState} from 'react';
import type {DisplayFinding} from './data';
import DiffView, {type DiffFile} from './diff-view';
import styles from './findings-cards.module.css';
import {MetricStrip} from './product-primitives';
const severities=['CRITICAL','HIGH','MEDIUM','LOW'] as const;
type Filter='All'|typeof severities[number];
const labels={CRITICAL:'Critical',HIGH:'High',MEDIUM:'Medium',LOW:'Low'};
export function visibleFindings(findings:DisplayFinding[],filter:Filter) {
  return findings.filter(f=>filter==='All'||f.severity===filter).sort((a,b)=>severities.indexOf(a.severity)-severities.indexOf(b.severity));
}
export function FindingCard({finding:f,file}:{finding:DisplayFinding;file?:DiffFile}) {
  // Use only the first paragraph of existing text; preserve the complete evidence below.
  const meaning=f.explanation.split(/\n\s*\n/)[0].trim();
  return <article className={styles.card} data-severity={f.severity}>
    <div className={styles.meta}><span className={`severity ${f.severity.toLowerCase()}`}>{f.severity}</span><span>{f.category}</span><span className={styles.status}>{f.status || 'Needs review'}</span></div>
    <h3>{f.title}</h3>
    <p className={styles.location}><code>{f.file}</code>{f.line!=null && <span> · line {f.line}</span>}</p>
    <div className={styles.meaning}><span>What this means</span><p>{meaning || 'See the original finding and available evidence below.'}</p></div>
    {f.suggested_fix && <div className={styles.meaning}><span>Suggested next step</span><p>{f.suggested_fix}</p></div>}
    <div className={styles.footer}><span>{f.source || 'Source not supplied'}</span><span>{f.status==='Verified'?'A fix proposal was verified; no change was applied.':'Next: review the recommendation and supporting code.'}</span></div>
    <details className={styles.details}><summary>View technical details</summary>
      <dl><div><dt>Finding ID</dt><dd><code>{f.findingId || f.id}</code></dd></div>{f.ruleId && <div><dt>Tool rule</dt><dd><code>{f.ruleId}</code></dd></div>}<div><dt>Source</dt><dd>{f.source || 'Not supplied'}</dd></div><div><dt>Confidence</dt><dd>{f.confidenceKnown!==false && f.confidence!=null?`${f.confidence}%`:'Not provided'}</dd></div></dl>
      <h4>Original description and evidence</h4><p className={styles.original}>{f.explanation || 'No description supplied.'}</p>
      <h4>Recommended next step</h4>{f.suggested_fix?<pre className={styles.recommendation}><code>{f.suggested_fix}</code></pre>:<p>No recommendation was supplied. Review the issue and its code context before choosing a change.</p>}
    </details>
    <details className={styles.code}><summary>Inspect code</summary><DiffView file={file} line={f.line}/></details>
  </article>;
}
export default function FindingsCards({findings,reviewedFiles,skippedFiles,files=[],fileScopeLabel='Reviewed files'}:{findings:DisplayFinding[];reviewedFiles:string[];skippedFiles:string[];files?:DiffFile[];fileScopeLabel?:string}) {
  const [filter,setFilter]=useState<Filter>('All');
  const [selectedPath,setSelectedPath]=useState<string|null>(null);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const visible=visibleFindings(findings,filter);
  const paths=[...new Set(visible.map(f=>f.file))];
  const path=paths.includes(selectedPath??'')?selectedPath:paths[0];
  const scoped=visible.filter(f=>f.file===path);
  const current=scoped.find(f=>f.id===selectedId)??scoped[0];
  return <section className={styles.page} aria-labelledby="findings-summary-title">
    <header className={styles.header}><h2 id="findings-summary-title">{findings.length?`${findings.length} ${findings.length===1?'issue':'issues'} found`:'No issues found'}</h2><p>{findings.length?'RepoPilot found problems that may affect correctness, security, or maintainability.':"RepoPilot didn't find any review findings for this pull request."}</p>
      {findings.length>0 && <div className={styles.counts} aria-label="Issues by severity">{severities.map(severity=><span key={severity}><i className={`severity-dot ${severity.toLowerCase()}`} aria-hidden="true"/>{labels[severity]} <strong>{findings.filter(f=>f.severity===severity).length}</strong></span>)}</div>}
    </header>
    {findings.length>0 && <MetricStrip items={[{label:'Total findings',value:findings.length,detail:'Problems found in this pull request',icon:'issue',tone:'attention'},{label:'High / critical severity',value:findings.filter(f=>f.severity==='HIGH'||f.severity==='CRITICAL').length,detail:'Review the most serious issues first',icon:'issue',tone:'attention'},{label:'Files with findings',value:new Set(findings.map(f=>f.file)).size,detail:'Files with reported issues',icon:'file'}]}/>}
    {findings.length>0 && <div className={styles.filters}><button type="button" aria-pressed={filter==='All'} onClick={()=>setFilter('All')}>All findings</button><label className="sr-only" htmlFor="finding-severity">Severity</label><select id="finding-severity" value={filter} onChange={event=>setFilter(event.target.value as Filter)}><option value="All">Severity · All</option>{severities.map(value=><option key={value} value={value}>{labels[value]}</option>)}</select><span className={styles.filterNote} role="status">{visible.length} shown · Highest severity first</span></div>}
    {!findings.length?<div className={styles.empty}><span aria-hidden="true">✓</span><div><strong>No review issues to display</strong><p>Review coverage is shown below. This result is not a guarantee that the code is free of problems.</p></div></div>:visible.length?<div className={styles.explorer}><aside className={styles.selection}><h3>Files with findings</h3>{paths.map(item=><button key={item} type="button" aria-pressed={item===path} onClick={()=>{setSelectedPath(item);setSelectedId(null);}}><code>{item}</code><span>{visible.filter(f=>f.file===item).length}</span></button>)}<h3>Issues in this file</h3>{scoped.map(f=><button key={f.id} type="button" aria-pressed={f.id===current?.id} onClick={()=>setSelectedId(f.id)}><span className={`severity-dot ${f.severity.toLowerCase()}`}/><span>{f.title}</span></button>)}</aside><div className={styles.list}>{current && <FindingCard key={JSON.stringify([current.id,current.file,current.line,current.title])} finding={current} file={files.find(file=>file.filename===current.file)}/>}</div></div>:<p className={styles.noMatch}>No {filter==='All'?'':labels[filter].toLowerCase()} issues in this review. Select All to see the other findings.</p>}
    <details className={styles.coverage}><summary>Review coverage · {reviewedFiles.length} {fileScopeLabel.toLowerCase()} · {skippedFiles.length} skipped</summary><h3>{fileScopeLabel}</h3>{reviewedFiles.length?<ul>{reviewedFiles.map(path=><li key={path}><code>{path}</code></li>)}</ul>:<p>No reviewed file coverage was supplied.</p>}{skippedFiles.length>0 && <><h3>Skipped files</h3><ul>{skippedFiles.map(path=><li key={path}><code>{path}</code></li>)}</ul></>}</details>
  </section>;
}
