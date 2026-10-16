'use client';

import {useEffect, useMemo, useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {CanvasTexture, Mesh, MeshBasicMaterial, SRGBColorSpace} from 'three';
import {phase, type RepositoryNode, type SceneProgress} from './scene-progress';

/** Compact diagram face, introduced on the same objects as their physical shells flatten. */
export default function ArchitectureNode({label,role,progress,selected=false,related=true,hasSelection=false,hub=false,appearAt}: {
  label:string;role:RepositoryNode['role'];progress:SceneProgress;selected?:boolean;related?:boolean;hasSelection?:boolean;hub?:boolean;appearAt?:number;
}) {
  const face=useRef<Mesh>(null),material=useRef<MeshBasicMaterial>(null),halo=useRef<MeshBasicMaterial>(null);
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=720;canvas.height=240;
    const c=canvas.getContext('2d');
    if(c){
      c.scale(4,4);const accent=role==='changed'?'#6752cd':role==='dependency'?'#13859a':'#8391aa';
      c.fillStyle=role==='context'?'#f4f6fb':'#ffffff';c.strokeStyle=selected?'#5640c2':accent;c.lineWidth=selected?2:1;
      c.beginPath();c.roundRect(2,2,176,56,7);c.fill();c.stroke();
      c.fillStyle=role==='changed'?'#8255db':role==='dependency'?'#1593a7':'#798ba6';
      c.beginPath();c.roundRect(15,24,8,8,2);c.fill();
      c.fillStyle='#1d2941';c.font=hub?'600 16px system-ui':'500 14px monospace';c.textBaseline='middle';c.fillText(label,32,29);
      if(hub){c.fillStyle='#8b80c5';c.fillRect(32,44,80,1);}
    }
    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;return map;
  },[label,role,selected,hub]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  useFrame(()=>{
    const t=phase(progress.current.value,.55,.85)*(appearAt===undefined?1:phase(progress.current.value,appearAt,appearAt+.15));
    if(face.current)face.current.position.z=.087*(1-t)+.019*t;
    if(material.current)material.current.opacity=t*(hasSelection&&!related?.45:1);
    if(halo.current)halo.current.opacity=t*(selected?.12:0);
  });
  const width=hub?3:1.54,height=hub?.85:.56;
  return <group>
    <mesh position={[0,0,.01]}><planeGeometry args={[width+.14,height+.14]}/><meshBasicMaterial ref={halo} color="#8b78de" transparent opacity={0} depthWrite={false} toneMapped={false}/></mesh>
    <mesh ref={face} position={[0,0,.087]}><planeGeometry args={[width,height]}/><meshBasicMaterial ref={material} map={texture} transparent opacity={0} depthWrite={false} toneMapped={false}/></mesh>
  </group>;
}
