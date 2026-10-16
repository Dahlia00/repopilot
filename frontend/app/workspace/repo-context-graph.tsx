import {useMemo, useRef, useState} from 'react';
import type {ContextFileMetadata} from '../repository-context';
const schematic=[[150,110],[320,70],[220,210],[470,90],[430,230],[600,150],[560,250]];
const schematicLinks=[[0,1],[0,2],[1,3],[2,4],[3,5],[4,6],[5,6]];
const moduleOf=(path:string)=>{const parts=path.split('/');return parts.length>1?parts[0]:'root';};
const hash=(s:string)=>{let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h);};
const CX=370, CY=168;
export default function RepoContextGraph({files,context,loaded}: {files:string[];context:ContextFileMetadata[];loaded:boolean}) {
  const paths=[...new Set([...files,...context.map(f=>f.path)])];
  const visible=paths.slice(0,24);
  const visibleKey=visible.join('|');
  const svgRef=useRef<SVGSVGElement>(null);
  const [tilt,setTilt]=useState({x:0,y:0});
  const onMove=(e:React.MouseEvent<SVGSVGElement>)=>{
    const r=svgRef.current!.getBoundingClientRect();
    const px=(e.clientX-r.left)/r.width-0.5, py=(e.clientY-r.top)/r.height-0.5;
    setTilt({x:py*-6,y:px*8});
  };
  const {clusters,points,links}=useMemo(()=>{
    const groups=new Map<string,string[]>();
    visible.forEach(p=>{const m=moduleOf(p);if(!groups.has(m))groups.set(m,[]);groups.get(m)!.push(p);});
    const keys=[...groups.keys()];
    const multi=keys.length>1;
    const outerRx=multi?250:0, outerRy=multi?120:0;
    const clusters=keys.map((key,i)=>{
      const angle=(i/keys.length)*Math.PI*2-Math.PI/2;
      return {key,count:groups.get(key)!.length,x:multi?CX+outerRx*Math.cos(angle):CX,y:multi?CY+outerRy*Math.sin(angle):CY};
    });
    const points=clusters.flatMap(cl=>{
      const items=groups.get(cl.key)!;
      const innerR=items.length>1?Math.min(96,30+items.length*9):0;
      return items.map((path,j)=>{
        const seed=hash(path);
        const angle=(j/Math.max(1,items.length))*Math.PI*2+(seed%360)*(Math.PI/180);
        const jr=innerR*(0.5+((seed>>4)%100)/100*0.5);
        return {path,cluster:cl.key,x:cl.x+Math.cos(angle)*jr,y:cl.y+Math.sin(angle)*jr*0.85};
      });
    });
    const links=context.flatMap(c=>(c.used_for ?? []).map(target=>({source:c.path,target,reason:c.reason})))
      .filter(edge=>visible.includes(edge.source)&&visible.includes(edge.target)&&edge.source!==edge.target);
    return {clusters,points,links};
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleKey is a stable content fingerprint for `visible`
  },[visibleKey,context]);
  const byPath=(path:string)=>points.find(p=>p.path===path)!;
  const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(b.x-a.x,b.y-a.y);
  const nodeDelay=(path:string)=>Math.min(points.findIndex(p=>p.path===path)*28,420);
  return <section className="context-graph" aria-labelledby="graph-heading">
    <div className="section-heading"><h2 id="graph-heading">Repository context</h2>{loaded && <span className="mono muted small">{paths.length} files{clusters.length>1?` · ${clusters.length} modules`:''}</span>}</div>
    <svg ref={svgRef} className="graph-stage" viewBox="0 0 740 340" role="img" onMouseMove={loaded?onMove:undefined} onMouseLeave={()=>setTilt({x:0,y:0})}
      style={{transform:`perspective(1400px) rotateX(${4+tilt.x}deg) rotateY(${tilt.y}deg)`}}
      aria-label={loaded?'Actual changed files and selected context relationships':'Schematic illustration; no repository data loaded'}>
      <defs>
        <filter id="node-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="cluster-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="22"/></filter>
      </defs>
      {!loaded ? <g className="schematic-group" aria-hidden="true">
        {schematicLinks.map(([a,b],i)=>{const[ax,ay]=schematic[a];const[bx,by]=schematic[b];return <path key={i} d={`M${ax} ${ay}L${bx} ${by}`}/>;})}
        {schematic.map(([x,y],i)=><g className="schematic-node" key={i} style={{animationDelay:`${i*-1.3}s`}}><circle cx={x} cy={y} r={i===2?10:6}/><circle cx={x} cy={y} r={i===2?20:14} className="node-outline"/></g>)}
      </g> : <g key={paths.join('|')}>
        {clusters.length>1 && clusters.map(cl=><g key={cl.key} className="graph-cluster">
          <circle className="cluster-glow" cx={cl.x} cy={cl.y} r={38+cl.count*6} filter="url(#cluster-glow)"/>
          <text className="cluster-label" x={cl.x} y={cl.y-(38+cl.count*6)-10} textAnchor="middle">{cl.key}</text>
        </g>)}
        {links.map((edge,i)=>{
          const a=byPath(edge.source), b=byPath(edge.target);
          if(!a||!b) return null;
          const len=dist(a,b), delay=Math.max(nodeDelay(a.path),nodeDelay(b.path))+140;
          return <g key={`${edge.source}:${edge.target}:${i}`} className="graph-edge-group">
            <path className="graph-edge" d={`M${a.x} ${a.y}L${b.x} ${b.y}`} style={{strokeDasharray:len,strokeDashoffset:len,animationDelay:`${delay}ms`}}><title>{edge.reason}</title></path>
            <circle className="edge-pulse" r="2.2" cx={a.x} cy={a.y} style={{animationDelay:`${delay+200}ms`}}><animateMotion dur="900ms" begin={`${delay+200}ms`} fill="freeze" path={`M${a.x} ${a.y}L${b.x} ${b.y}`}/></circle>
          </g>;
        })}
        {points.map(p=><g className="graph-node" key={p.path} tabIndex={0} aria-label={p.path} style={{animationDelay:`${nodeDelay(p.path)}ms`}}>
          <title>{p.path}{context.find(c=>c.path===p.path)?` — ${context.find(c=>c.path===p.path)!.reason}`:''}</title>
          <circle className="node-dot" cx={p.x} cy={p.y} r={context.some(c=>c.path===p.path)?7:9.5} filter="url(#node-glow)"/>
          <text x={p.x} y={p.y+22} textAnchor="middle">{p.path.split('/').pop()!.length>20?`${p.path.split('/').pop()!.slice(0,17)}…`:p.path.split('/').pop()}</text>
        </g>)}
      </g>}
    </svg>
    <p className="muted small">{!loaded?'Schematic · Repository context builds here once a review runs.':context.length?'Links show actual context selection relationships, not a complete dependency graph.':'Changed file metadata loaded. Selected context appears after a review.'}
      {paths.length>visible.length && ` Showing ${visible.length} of ${paths.length} files; full paths remain available in Changed files and Repository context.`}</p>
  </section>;
}
