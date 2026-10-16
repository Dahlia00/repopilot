'use client';
import {useState} from 'react';
import DiffView, {type DiffFile} from './workspace/diff-view';
export type Finding = {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'Security' | 'Bug' | 'Performance' | 'Error Handling' | 'Code Quality';
  file: string;
  line: number | null;
  title: string;
  explanation: string;
  suggested_fix: string;
  confidence: number;
};

export default function ReviewFindings({findings, reviewedFiles, skippedFiles, files=[], fileScopeLabel='Reviewed files'}: {
  findings:(Omit<Finding,'confidence'> & {confidence:number|null;id?:string;source?:string;status?:string;confidenceKnown?:boolean;ruleId?:string})[];
  reviewedFiles:string[];skippedFiles:string[];files?:DiffFile[];fileScopeLabel?:string;
}) {
  const [selectedFile,setSelectedFile]=useState<string|null>(null);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const paths=[...new Set(findings.map(f=>f.file))];
  const path=paths.includes(selectedFile ?? '')?selectedFile!:paths[0];
  const scoped=findings.filter(f=>f.file===path);
  const id=(f:typeof findings[number])=>f.id ?? `${f.file}:${f.line}:${f.title}`;
  const current=scoped.find(f=>id(f)===selectedId) ?? scoped[0];
  return <section className="findings-workspace" aria-label="Findings">
    <div className="section-heading"><h2>Review observations</h2><span className="muted small">{findings.length} observations · {fileScopeLabel.toLowerCase()}: {reviewedFiles.length}</span></div>
    {skippedFiles.length>0 && <details className="coverage-note"><summary>{skippedFiles.length} skipped files</summary><ul>{skippedFiles.map(f=><li className="mono" key={f}>{f}</li>)}</ul></details>}
    {findings.length===0 ? <p className="section-empty">{reviewedFiles.length?'No actionable findings were returned. Check scanner and context coverage.':'No findings are available for this section.'}</p> :
      <div className="finding-explorer">
        <aside className="finding-files" aria-label="Files with findings"><div className="pane-heading">Files</div>
          {paths.map(file=><button type="button" key={file} className={`file-selection ${file===path?'selected':''}`} aria-pressed={file===path}
            onClick={()=>{setSelectedFile(file);setSelectedId(null);}} title={file}>
            <span className="truncate mono">{file}</span><span className="mono">{findings.filter(f=>f.file===file).length}</span>
          </button>)}
        </aside>
        <DiffView file={files.find(f=>f.filename===path)} line={current?.line} onLine={line=>{const f=scoped.find(f=>f.line===line);if(f)setSelectedId(id(f));}}/>
        <aside className="finding-detail" aria-label="Finding details">
          <div className="pane-heading">Observations in this file</div>
          <div className="finding-choices">{scoped.map(f=><button type="button" key={id(f)} aria-pressed={id(f)===id(current)} className={id(f)===id(current)?'selected':''}
            onClick={()=>setSelectedId(id(f))} title={f.title}><span className={`severity-dot ${f.severity.toLowerCase()}`}/><span className="truncate">{f.title}</span></button>)}</div>
          <article className="finding-detail-body" key={id(current)}>
            <div className="finding-meta"><span className={`severity ${current.severity.toLowerCase()}`}>{current.severity}</span><span className="tag truncate" title={current.source ?? 'AI'}>{current.source ?? 'AI'}</span></div>
            <h3>{current.title}</h3>
            <p className="mono muted small" title={current.file}>{current.line!==null?`Line ${current.line} · `:''}{current.category}</p>
            {current.confidenceKnown!==false && <p className="muted small">{current.confidence}% confidence</p>}
            {current.ruleId && <p className="mono muted small">{current.ruleId}</p>}
            <span key={current.status} className={`verification-badge ${(current.status ?? 'Pending').toLowerCase().replaceAll(' ','-')}`}>{current.status ?? 'Pending'}</span>
            <h4>Explanation</h4><p className="detail-explanation">{current.explanation}</p>
            <h4>Suggested fix</h4>{current.suggested_fix?<pre className="suggestion-code"><code>{current.suggested_fix}</code></pre>:<p className="muted small">No code recommendation was returned for this observation.</p>}
          </article>
        </aside>
      </div>}
  </section>;
}
