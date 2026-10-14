'use client';

import {useMemo, useRef, type ComponentRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Line} from '@react-three/drei';
import {Color, Mesh, MeshStandardMaterial, QuadraticBezierCurve3, Vector3} from 'three';
import {nodePosition, phase, repositoryNodes, repositoryRelationships, repositoryHub, type SceneProgress} from './scene-progress';

const relationships=[...repositoryRelationships,['PR CHANGE','auth.py'],['PR CHANGE','api.py']] as const;
const origin:[number,number,number][]=[[0,0,0],[.001,0,0]];
function Dependency({from,to,index,progress,reduced,hovered}:{from:string;to:string;index:number;progress:SceneProgress;reduced:boolean;hovered:string|null}) {
  const signal=useRef<MeshStandardMaterial>(null);
  const line=useRef<ComponentRef<typeof Line>>(null);const pulse=useRef<Mesh>(null);
  const last=useRef(-1);
  const source=from==='PR CHANGE'?repositoryHub:repositoryNodes.find(node=>node.name===from)!;
  const target=to==='PR CHANGE'?repositoryHub:repositoryNodes.find(node=>node.name===to)!;
  const curveRef=useRef(new QuadraticBezierCurve3(new Vector3(),new Vector3(),new Vector3()));
  const color=target.role==='dependency'?'#38cff8':source.role==='changed'?'#8b5cf6':'#3978ff';
  const tones=useMemo(()=>({dark:new Color(color),light:new Color(target.role==='dependency'?'#158398':source.role==='changed'?'#6651b7':'#647f9b')}),[color,target.role,source.role]);
  useFrame(({clock})=>{
    const curve=curveRef.current;
    const p=progress.current.value;
    const reveal=phase(p,.4+index*.018,.65+index*.013);
    if(line.current){
      line.current.visible=reveal>.001;
      line.current.material.color.lerpColors(tones.dark,tones.light,phase(p,.35,.9));
      line.current.material.opacity=reveal*(hovered?(hovered===from||hovered===to?.85:.12):.72);
      if(Math.abs(p-last.current)>.0001){
        curve.v0.set(...nodePosition(source,p));curve.v2.set(...nodePosition(target,p));
        curve.v1.copy(curve.v0).lerp(curve.v2,.5);curve.v1.z-=.8;curve.v1.y+=index%2?.2:-.2;
        const points=Array.from({length:25},(_,i)=>curve.getPoint(i/24*reveal).toArray()).flat();
        line.current.geometry.setPositions(points);last.current=p;
      }
    }
    if(signal.current){signal.current.color.lerpColors(tones.dark,tones.light,phase(p,.55,.85));signal.current.emissiveIntensity=2.2*(1-phase(p,.55,.85));}
    if(pulse.current){pulse.current.visible=!reduced&&!progress.current.scrolling&&reveal>.95;pulse.current.position.copy(curve.getPoint((clock.elapsedTime*.07+index*.3)%1));}
  });
  return <><Line ref={line} points={origin} color={color} lineWidth={1.2} transparent opacity={0}/>
    {index<3&&<mesh ref={pulse} visible={false}><sphereGeometry args={[.032,8,6]}/><meshStandardMaterial ref={signal} color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false}/></mesh>}
  </>;
}
export default function RepositoryContextGraph({progress,reduced,hovered,compact}:{progress:SceneProgress;reduced:boolean;hovered:string|null;compact:boolean}) {
  return <group>{relationships.filter(([from,to])=>!compact||![from,to].some(name=>name==='types.ts'||name==='tests.py')).map(([from,to],i)=><Dependency key={`${from}-${to}`} from={from} to={to} index={i} progress={progress} reduced={reduced} hovered={hovered}/>)}</group>;
}
