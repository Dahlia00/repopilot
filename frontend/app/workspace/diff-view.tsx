import {useMemo, type CSSProperties} from 'react';
export type DiffFile={filename:string;patch:string|null};
function diffLines(patch:string) {
  let oldLine=0,newLine=0;
  return patch.split('\n').map((text,index)=>{
    const hunk=text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
    if(hunk) {oldLine=Number(hunk[1]);newLine=Number(hunk[2]);return {text,index,kind:'hunk',old:null,next:null};}
    if(text.startsWith('+++')||text.startsWith('---')||text.startsWith('\\'))return {text,index,kind:'hunk',old:null,next:null};
    const kind=text.startsWith('+')?'added':text.startsWith('-')?'removed':'context';
    const old=kind==='added'?null:oldLine++;
    const next=kind==='removed'?null:newLine++;
    return {text,index,kind,old,next};
  });
}
export default function DiffView({file,line,onLine}: {file?:DiffFile;line?:number|null;onLine?:(line:number)=>void}) {
  const rows=useMemo(()=>file?.patch?diffLines(file.patch):[],[file]);
  return <section className="code-pane" aria-label="Pull request diff">
    <div className="pane-heading"><span className="mono truncate" title={file?.filename}>{file?.filename ?? 'Changed code'}</span><span className="muted small">PR patch</span></div>
    {!file?.patch ? <p className="section-empty">{file?'GitHub did not provide a patch for this file.':'Select a file to inspect its patch.'}</p> :
      <div className="diff-scroll" tabIndex={0} aria-label={`${file.filename} diff`}>
        <div className="diff-lines" key={file.filename}>{rows.map(row=>
          <div key={row.index} className={`diff-row ${row.kind} ${row.next===line?'focused-line':''}`}
            style={{'--line-delay':`${Math.min(row.index*16,320)}ms`,animationName:row.index<40?undefined:'none'} as CSSProperties}>
            <span className="line-number">{row.old || ''}</span>
            {onLine && row.next ? <button type="button" className="line-select line-number" title={`Select finding at line ${row.next}`} onClick={()=>onLine(row.next!)}>{row.next}</button>
              : <span className="line-number">{row.next || ''}</span>}
            <code>{row.text || ' '}</code>
          </div>)}</div>
      </div>}
  </section>;
}
