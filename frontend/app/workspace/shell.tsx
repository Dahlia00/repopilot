'use client';
import {useState} from 'react';
import styles from './product-ui.module.css';
import type {FormEvent, ReactNode} from 'react';
import Link from 'next/link';
import ProductMark from '../../components/shared/product-mark';
import type {SectionId} from './types';
export const sections: {id: SectionId; label: string; group: string}[] = [
  {id:'overview',label:'Overview',group:'Workspace'}, {id:'files',label:'Changed files',group:'Workspace'}, {id:'context',label:'Repository context',group:'Workspace'},
  {id:'findings',label:'Findings',group:'Review'}, {id:'static',label:'Static analysis',group:'Review'}, {id:'security',label:'Security',group:'Review'}, {id:'agents',label:'Agents',group:'Review'},
  {id:'tests',label:'Tests',group:'Resolution'}, {id:'fixes',label:'Fixes',group:'Resolution'}, {id:'verification',label:'Verification',group:'Resolution'},
];
const primaryGroups=[{name:'Workspace',ids:['overview']},{name:'Review',ids:['findings']},{name:'Resolve',ids:['tests','fixes','verification']}];
const advancedIds=['files','context','static','security','agents'];
function SectionIcon({id}: {id:SectionId}) {
  const paths:Record<SectionId,string>={
    overview:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    files:'M6 3h9l4 4v14H6zM15 3v4h4M9 11h7M9 15h7',
    findings:'M12 8v5M12 16h.01M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18',
    static:'M8 4H4v16h4M16 4h4v16h-4M9 10l3 3 3-3',
    security:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 12l2 2 4-4',
    agents:'M12 7v5M5 17v-5h14v5M10 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z',
    tests:'M4 4h16v16H4zM8 12l3 3 5-6',
    fixes:'M5 19L19 5M11 5h8v8M4 10V4h6',
    verification:'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M8 12l3 3 5-6',
    context:'M5 5h5v5H5zM15 15h5v5h-5zM15 4h5v5h-5zM10 7h5M7 10v7h8',
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[id]}/></svg>;
}
export function TopBar({workspace, command}: {workspace?: string; command: ReactNode}) {
  return <header className="app-topbar">
    <Link className="app-brand" href="/" aria-label="RepoPilot home">
      <ProductMark /><span>RepoPilot</span>
    </Link>
    {command}
    <div className="chrome-meta">
      {workspace && <span className="workspace-name mono truncate" title={workspace}>{workspace}</span>}
      <span className="safety-status" title="RepoPilot does not modify your repository automatically."><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z"/></svg>Read only</span>
    </div>
  </header>;
}
export function Sidebar({active, onSelect, counts}: {active: SectionId; onSelect: (id: SectionId)=>void; counts: Partial<Record<SectionId,number>>}) {
  return <aside className="app-sidebar" id="product-navigation"><nav aria-label="Review sections">
    {primaryGroups.map(group=><div className="nav-group" key={group.name}>
      {group.name!=='Workspace' && <p className="nav-caption">{group.name}</p>}
      {group.ids.map(id=>sections.find(s=>s.id===id)!).map(s=><button type="button" key={s.id} className={`nav-item ${active===s.id?'selected':''}`} aria-current={active===s.id?'page':undefined} onClick={()=>onSelect(s.id)} title={s.label}>
        <span className="nav-symbol"><SectionIcon id={s.id}/></span><span className="nav-label">{s.label}</span>{counts[s.id]!==undefined && <span className="nav-count mono">{counts[s.id]}</span>}
      </button>)}
    </div>)}
    <details className={styles.more} open={advancedIds.includes(active)||undefined}><summary>More · Advanced tools</summary>{advancedIds.map(id=>sections.find(s=>s.id===id)!).map(s=><button type="button" key={s.id} className={`nav-item ${active===s.id?'selected':''}`} aria-current={active===s.id?'page':undefined} onClick={()=>onSelect(s.id)}><span className="nav-symbol"><SectionIcon id={s.id}/></span><span className="nav-label">{s.label}</span>{counts[s.id]!==undefined && <span className="nav-count mono">{counts[s.id]}</span>}</button>)}</details>
  </nav><p className="sidebar-note">Review evidence.<br/>Keep changes under your control.</p></aside>;
}
export function CommandBar(p: {repository:string; pullRequest:string; busy:boolean; reviewed:boolean; secondary?:boolean; loading:boolean; reviewing:boolean;
  onRepository:(value:string)=>void; onPullRequest:(value:string)=>void; onReview:(event:FormEvent<HTMLFormElement>)=>void}) {
  return <form className="command-bar" onSubmit={p.onReview} aria-label="Pull request commands">
    <div className="command-field repository-command"><label htmlFor="repository" className="sr-only">Repository</label>
      <input id="repository" value={p.repository} placeholder="owner/repository" required autoComplete="off" spellCheck={false}
        maxLength={200} disabled={p.busy} onChange={e=>p.onRepository(e.target.value)}/></div>
    <div className="command-field pr-command"><label htmlFor="pr" className="sr-only">Pull request</label>
      <input id="pr" type="number" min="1" step="1" placeholder="PR #" value={p.pullRequest} required disabled={p.busy}
        onChange={e=>p.onPullRequest(e.target.value)}/></div>
    <div className="command-actions">
      <button type="submit" className={p.reviewed||p.secondary?'secondary-button':undefined} disabled={p.busy}>{p.loading?'Loading PR…':p.reviewing?'Reviewing…':p.reviewed?'Run review again':'Run review'}<span aria-hidden="true">↗</span></button>
    </div>
    {p.busy && <span className={styles.runStatus} role="status">{p.loading?'Loading PR':p.reviewing?'Reviewing':'Working'}</span>}
  </form>;
}
export default function AppShell({workspace,active,onSelect,counts,command,children}: {workspace?:string; active:SectionId; onSelect:(id:SectionId)=>void;
  counts:Partial<Record<SectionId,number>>; command:ReactNode; children:ReactNode}) {
  const [navOpen,setNavOpen]=useState(false);
  return <div className={`app-shell ${styles.app}`} data-nav-open={navOpen}><button className={styles.mobileToggle} type="button" aria-expanded={navOpen} aria-controls="product-navigation" onClick={()=>setNavOpen(!navOpen)}>{navOpen?'Close menu':'Menu'}</button><TopBar workspace={workspace} command={command}/><Sidebar active={active} onSelect={onSelect} counts={counts}/>
    <main className="app-canvas" id="main-content"><div className="content-frame">{children}</div></main>
  </div>;
}
