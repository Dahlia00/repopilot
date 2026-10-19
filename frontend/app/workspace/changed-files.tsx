'use client';
import {useState} from 'react';
import type {Analysis} from './types';
import DiffView from './diff-view';
import {MetricStrip, PageIntro, ProductIcon} from './product-primitives';
import styles from './product-ui.module.css';
export default function ChangedFiles({pr}:{pr:Analysis}) {
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const matches=pr.files.filter(file=>file.filename.toLowerCase().includes(query.toLowerCase()));
  const file=matches.find(file=>file.filename===selected)??matches[0];
  return <section>
    <PageIntro>Review the files modified in this pull request. Select a file to see its changes.</PageIntro>
    <MetricStrip items={[{label:'Changed files',value:pr.changed_files,icon:'file'},{label:'Additions',value:`+${pr.additions}`,tone:'success',icon:'fix'},{label:'Deletions',value:`−${pr.deletions}`,tone:'attention',icon:'code'},{label:'Commit',value:<code title={pr.head_sha}>{pr.head_sha.slice(0,7)}</code>,icon:'branch'}]}/>
    {pr.files_truncated && <p className="notice">Showing {pr.files.length} of {pr.changed_files} changed files. Retrieval coverage is incomplete.</p>}
    <div className={styles.fileBrowser}><aside className={styles.fileList}><h2>Files <span className="muted">({pr.files.length})</span></h2><label className="sr-only" htmlFor="file-search">Search changed files</label><input id="file-search" type="search" placeholder="Search files…" value={query} onChange={e=>setQuery(e.target.value)}/>{matches.map(item=><button key={item.filename} type="button" aria-pressed={file?.filename===item.filename} onClick={()=>setSelected(item.filename)}><ProductIcon kind="file"/><span><code>{item.filename}</code><small>{item.status}</small></span><small><b className="additions">+{item.additions}</b> <b className="deletions">−{item.deletions}</b></small><span aria-hidden="true">›</span></button>)}{!matches.length && <p className="muted">{pr.files.length?'No files match your search.':'No changed files returned.'}</p>}</aside><div className={styles.patchPanel}>{file?<><div className={styles.patchHeading}><ProductIcon kind="file"/><div><strong>{file.filename}</strong><p><span className="additions">+{file.additions}</span> <span className="deletions">−{file.deletions}</span> · {file.status}</p></div><span className="tag">Patch</span></div><DiffView file={file}/><p className={styles.patchNote}>Showing GitHub’s patch. Full file content is not included in this response.</p></>:<p className="section-empty">Select a file to view its changes.</p>}</div></div>
    <details className={styles.secondaryDetails}><summary>Pull request metadata</summary><h3>{pr.title}</h3><p><code>{pr.repository} #{pr.pull_request}</code> · {pr.state} · Opened by {pr.author}</p><p><code>{pr.head_branch}</code> → <code>{pr.base_branch}</code></p></details>
  </section>;
}
