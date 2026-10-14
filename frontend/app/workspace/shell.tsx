import type {FormEvent, ReactNode} from 'react';
import Link from 'next/link';
import ProductMark from '../../components/shared/product-mark';
import type {SectionId} from './types';
export const sections: {id: SectionId; label: string; group: string}[] = [
  {id:'overview',label:'Overview',group:'Workspace'}, {id:'files',label:'Changed files',group:'Workspace'}, {id:'context',label:'Repository context',group:'Workspace'},
  {id:'findings',label:'Findings',group:'Review'}, {id:'static',label:'Static analysis',group:'Review'}, {id:'security',label:'Security',group:'Review'}, {id:'agents',label:'Agents',group:'Review'},
  {id:'tests',label:'Tests',group:'Resolution'}, {id:'fixes',label:'Fixes',group:'Resolution'}, {id:'verification',label:'Verification',group:'Resolution'},
];
const groups=[...new Set(sections.map(s=>s.group))];
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
    <Link className="app-brand" href="/app" aria-label="RepoPilot application">
      <ProductMark /><span>RepoPilot</span>
    </Link>
    {command}
    <div className="chrome-meta">
      {workspace && <span className="workspace-name mono truncate" title={workspace}>{workspace}</span>}
      <span className="safety-status" title="This interface only reviews and previews. Nothing is applied to GitHub.">Read only</span>
    </div>
  </header>;
}
export function Sidebar({active, onSelect, counts}: {active: SectionId; onSelect: (id: SectionId)=>void; counts: Partial<Record<SectionId,number>>}) {
  return <aside className="app-sidebar"><nav aria-label="Review sections">
    {groups.map(group=><div className="nav-group" key={group}>
      <p className="nav-caption">{group}</p>
      {sections.filter(s=>s.group===group).map(s=><button type="button" key={s.id} className={`nav-item ${active===s.id?'selected':''}`}
        aria-label={s.label} aria-current={active===s.id?'page':undefined} onClick={()=>onSelect(s.id)} title={s.label}>
        <span className="nav-symbol" aria-hidden="true"><SectionIcon id={s.id}/></span><span className="nav-label">{s.label}</span>
        {counts[s.id]!==undefined && <span className="nav-count mono">{counts[s.id]}</span>}
      </button>)}
    </div>)}
  </nav><p className="sidebar-note">Review evidence.<br/>Keep changes under your control.</p></aside>;
}
export function CommandBar(p: {repository:string; pullRequest:string; busy:boolean; loaded:boolean; loading:boolean; reviewing:boolean;
  onRepository:(value:string)=>void; onPullRequest:(value:string)=>void; onLoad:(event:FormEvent<HTMLFormElement>)=>void; onReview:()=>void}) {
  return <form className="command-bar" onSubmit={p.onLoad} aria-label="Pull request commands">
    <div className="command-field repository-command"><label htmlFor="repository" className="sr-only">Repository</label>
      <input id="repository" value={p.repository} placeholder="owner/repository" required autoComplete="off" spellCheck={false}
        maxLength={200} disabled={p.busy} onChange={e=>p.onRepository(e.target.value)}/></div>
    <div className="command-field pr-command"><label htmlFor="pr" className="sr-only">Pull request</label>
      <input id="pr" type="number" min="1" step="1" placeholder="PR #" value={p.pullRequest} required disabled={p.busy}
        onChange={e=>p.onPullRequest(e.target.value)}/></div>
    <div className="command-actions">
      <button className="secondary-button" type="submit" disabled={p.busy}>{p.loading?'Loading…':'Load PR'}</button>
      <button type="button" disabled={!p.loaded || p.busy} onClick={p.onReview}>{p.reviewing?'Reviewing…':'Run review'}<span aria-hidden="true">↗</span></button>
    </div>
  </form>;
}
export default function AppShell({workspace,active,onSelect,counts,command,children}: {workspace?:string; active:SectionId; onSelect:(id:SectionId)=>void;
  counts:Partial<Record<SectionId,number>>; command:ReactNode; children:ReactNode}) {
  return <div className="app-shell"><TopBar workspace={workspace} command={command}/><Sidebar active={active} onSelect={onSelect} counts={counts}/>
    <main className="app-canvas" id="main-content"><div className="content-frame">{children}</div></main>
  </div>;
}
