'use client';
import {useEffect,useRef,useState} from 'react';
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
export function TopBar({workspace, command, navigation, inert=false}: {workspace?: string; command: ReactNode; navigation?:ReactNode; inert?:boolean}) {
  return <header className="app-topbar" inert={inert}>
    <Link className="app-brand" href="/" aria-label="RepoPilot home">
      <ProductMark /><span>RepoPilot</span>
    </Link>
    {command}
    <div className="chrome-meta">
      {workspace && <span className="workspace-name mono truncate" title={workspace}>{workspace}</span>}
      <span className="safety-status" title="RepoPilot does not modify your repository automatically."><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z"/></svg>Read only</span>
    </div>
    {navigation}
  </header>;
}
export function Sidebar({active, onSelect, counts}: {active: SectionId; onSelect: (id: SectionId)=>void; counts: Partial<Record<SectionId,number>>}) {
  return <aside className="app-sidebar"><nav aria-label="Review sections">
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
  const [editing,setEditing]=useState(false);
  const repositoryInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(editing)repositoryInput.current?.focus();},[editing]);
  const compact=p.reviewed&&!editing;
  return <form className="command-bar" data-mobile-results={compact} onSubmit={event=>{setEditing(false);p.onReview(event);}} aria-label="Pull request commands">
    <div className={styles.resultsCommands}>
      <div className={styles.resultsContext} title={`${p.repository} #${p.pullRequest}`}><span>{p.repository}</span><strong>#{p.pullRequest}</strong></div>
      <button type="submit" className="secondary-button" disabled={p.busy}><span aria-hidden="true">↻</span>{p.loading?'Loading…':p.reviewing?'Reviewing…':'Run again'}</button>
      <button type="button" className="secondary-button" disabled={p.busy} aria-expanded={editing} aria-controls="review-pr-fields" onClick={()=>setEditing(true)}>Change PR</button>
    </div>
    <div id="review-pr-fields" className="command-field repository-command"><label htmlFor="repository" className="sr-only">Repository</label>
      <input ref={repositoryInput} id="repository" value={p.repository} placeholder="owner/repository" required autoComplete="off" spellCheck={false}
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
  const trigger=useRef<HTMLButtonElement>(null);
  const drawer=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!navOpen) return;
    const media=window.matchMedia('(max-width: 1024px)');
    const menuTrigger=trigger.current;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    drawer.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape') {event.preventDefault();setNavOpen(false);return;}
      if(event.key!=='Tab') return;
      const controls=[...drawer.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],summary,[tabindex="0"]')??[]].filter(node=>node.getClientRects().length);
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
    };
    const resized=()=>{if(!media.matches)setNavOpen(false);};
    document.addEventListener('keydown',onKey);
    media.addEventListener('change',resized);
    return ()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',onKey);media.removeEventListener('change',resized);menuTrigger?.focus();};
  },[navOpen]);
  const navigate=(id:SectionId)=>{onSelect(id);setNavOpen(false);};
  return <div className={`app-shell ${styles.app}`} data-nav-open={navOpen}>
    <TopBar workspace={workspace} command={command} inert={navOpen} navigation={<button ref={trigger} className={styles.mobileToggle} type="button" aria-label="Open navigation" aria-expanded={navOpen} aria-controls="product-navigation" onClick={()=>setNavOpen(true)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>}/>
    {navOpen && <button className={styles.navBackdrop} type="button" tabIndex={-1} aria-label="Close navigation" onClick={()=>setNavOpen(false)}/>}
    <div ref={drawer} id="product-navigation" className={styles.navSheet} role={navOpen?'dialog':undefined} aria-modal={navOpen||undefined} aria-label={navOpen?'RepoPilot navigation':undefined}>
      <button className={styles.drawerClose} type="button" aria-label="Close navigation" onClick={()=>setNavOpen(false)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      <Sidebar active={active} onSelect={navigate} counts={counts}/>
    </div>
    <main className="app-canvas" id="main-content" inert={navOpen}><div className="content-frame">{children}</div></main>
  </div>;
}
