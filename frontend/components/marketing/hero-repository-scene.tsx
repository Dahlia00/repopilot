'use client';

import {Component, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject} from 'react';
import {Canvas, useFrame} from '@react-three/fiber';
import {PerspectiveCamera, RoundedBox, QuadraticBezierLine} from '@react-three/drei';
import {Bloom, EffectComposer} from '@react-three/postprocessing';
import {Group, Mesh, QuadraticBezierCurve3, Vector3, MathUtils, CanvasTexture, SRGBColorSpace, PointLight, MeshStandardMaterial, MeshBasicMaterial, Color} from 'three';
import HeroRepositoryFallback from './hero-repository-fallback';
import ArchitectureNode from './architecture-node';
import RepositoryContextGraph from './repository-context-graph';
import {repositoryNodes, isRelatedNode, nodePosition, phase, sceneStates, interpolatePose, nodeSceneStates, type SceneProgress, type Point, type RepositoryNode} from './scene-progress';

export type ScenePointer = RefObject<{x: number; y: number}>;
const files=repositoryNodes;
const darkSurface=new Color('#151e34'),lightSurface=new Color('#e9edf7');
function FileTexture({name,color,progress}:{name:string;color:string;progress:SceneProgress}) {
  const material=useRef<MeshBasicMaterial>(null);
  useFrame(()=>{if(material.current)material.current.opacity=1-phase(progress.current.value,.55,.85);});
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=576;canvas.height=400;
    const c=canvas.getContext('2d');
    if(c){c.scale(4,4);c.textBaseline='middle';c.fillStyle='#9898df';c.font='14px monospace';c.fillText('⌘',15,24);c.fillStyle='#ccd5e8';c.font='11px monospace';c.fillText(name,35,24);[85,62,73].forEach((w,i)=>{c.fillStyle=i===1?color+'88':'#7483a345';c.fillRect(16+(i===1?8:0),49+i*9,w,2);});}
    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;return map;
  },[name,color]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <mesh position={[0,0,.081]}><planeGeometry args={[1.44,1]}/><meshBasicMaterial ref={material} map={texture} transparent depthWrite={false}/></mesh>;
}
function FilePanel({node,index,reduced,pointer,hovered,related,hasSelection,onHover,progress}: {node:RepositoryNode;index:number;reduced:boolean;pointer:ScenePointer;hovered:boolean;related:boolean;hasSelection:boolean;onHover:(name:string|null)=>void;progress:SceneProgress}) {
  const {name,position,scale,tilt,color}=node;
  const ref=useRef<Group>(null);const shell=useRef<Group>(null);const surface=useRef<MeshStandardMaterial>(null);const edge=useRef<MeshStandardMaterial>(null);
  useFrame(({clock},delta)=>{
    if(!ref.current)return;
    const p=progress.current.value, flatten=phase(p,.55,.85), expanded=phase(p,.2,.8), reveal=node.reveal===undefined?1:phase(p,node.reveal,node.reveal+.15);
    const states=nodeSceneStates(node), pose=interpolatePose(states.hero,states.repository,expanded);
    const base=nodePosition(node,p), size=pose.scale*reveal;
    ref.current.visible=reveal>.001;ref.current.scale.setScalar(size);

    if(shell.current)shell.current.scale.set(1,1-flatten*.5,1-flatten*.85);
    if(surface.current){surface.current.color.copy(darkSurface).lerp(lightSurface,flatten);surface.current.transparent=true;surface.current.opacity=(hasSelection&&!related?1-flatten*.55:1)*reveal;}
    if(edge.current){edge.current.transparent=true;edge.current.opacity=reveal*(hasSelection&&!related?1-flatten*.55:1);}
    if(edge.current)edge.current.emissiveIntensity=(1-flatten)*(.035*pose.emphasis+expanded*(node.role==='changed'?.16:.04)+(!reduced&&hovered?.2:0));
    const t=clock.elapsedTime,depth=position[2]>0?1.4:.6, idle=reduced||progress.current.scrolling?0:1;
    ref.current.position.set(base[0],base[1]+(Math.sin(t*.32+index)*.04*idle+(reduced||progress.current.scrolling?0:pointer.current.y*.035*depth)),base[2]+(!reduced&&hovered?.12:0));
    ref.current.rotation.set(pose.rotation[0],MathUtils.damp(ref.current.rotation.y,pose.rotation[1]+(reduced||progress.current.scrolling?0:pointer.current.x*.045*depth+Math.sin(t*.2+index)*.012),4,delta),pose.rotation[2]);

  });
  return <group ref={ref} position={position} scale={scale} rotation={[.04,-.08,tilt]} onPointerOver={e=>{e.stopPropagation();if(!reduced)onHover(name);}} onPointerOut={()=>onHover(null)}>
    <group ref={shell}>
    <RoundedBox args={[1.55,1.15,.10]} position={[0,0,-.045]} radius={.08} smoothness={3}><meshStandardMaterial ref={edge} color={hovered&&!reduced?color:'#424d70'} emissive={color} emissiveIntensity={hovered&&!reduced?.25:.035} roughness={.5}/></RoundedBox>
    <RoundedBox args={[1.52,1.12,.15]} radius={.08} smoothness={3}><meshStandardMaterial ref={surface} color="#151e34" roughness={.5} metalness={.18}/></RoundedBox>
    </group>
    <FileTexture name={name} color={color} progress={progress}/>
    <ArchitectureNode label={name} role={node.role} progress={progress} appearAt={node.reveal} selected={hovered} related={related} hasSelection={hasSelection}/>
  </group>;
}
function Connection({end,color,index,reduced,highlighted,progress}:{end:Point;color:string;index:number;reduced:boolean;highlighted:boolean;progress:SceneProgress}) {
  const connection=useRef<Group>(null);
  const pulse=useRef<Mesh>(null);const line=useRef<ComponentRef<typeof QuadraticBezierLine>>(null);
  const start=useMemo(()=>new Vector3(end[0]<0?-1.5:1.5,end[1]*.2,-.22),[end]);
  const mid=useMemo(()=>new Vector3(end[0]*.7,end[1]*.12,-.9),[end]);
  const curve=useMemo(()=>new QuadraticBezierCurve3(start,mid,new Vector3(...end)),[start,mid,end]);
  useFrame(({clock})=>{
    const t=clock.elapsedTime;
    if(connection.current)connection.current.visible=progress.current.value<.55;
    if(line.current)line.current.material.opacity=(reduced?1:MathUtils.smoothstep(t,.4,1.1))*(highlighted?.85:.5)*(1-phase(progress.current.value,.25,.55));
    if(pulse.current&&!reduced){pulse.current.visible=t>.9&&!progress.current.scrolling&&progress.current.value<.5;pulse.current.position.copy(curve.getPoint(1-((Math.max(0,t-.9)*.065+index*.29)%1)));}
  });
  return <group ref={connection}><QuadraticBezierLine ref={line} start={start} mid={mid} end={end} color={color} lineWidth={highlighted?1.35:.85} transparent opacity={reduced?.5:0}/>
    <mesh position={end}><sphereGeometry args={[.034,10,8]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} toneMapped={false}/></mesh>
    {index<3&&!reduced&&<mesh ref={pulse} visible={false}><sphereGeometry args={[.033,10,8]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} toneMapped={false}/><mesh scale={2.6}><sphereGeometry args={[.033,10,8]}/><meshBasicMaterial color={color} transparent opacity={.2} depthWrite={false}/></mesh></mesh>}</group>;
}
/** A small procedural texture keeps the central face crisp without external fonts/assets. */
function PullRequestTexture({progress}:{progress:SceneProgress}) {
  const material=useRef<MeshBasicMaterial>(null);
  useFrame(()=>{if(material.current)material.current.opacity=1-phase(progress.current.value,.55,.85);});
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=900;canvas.height=780;
    const c=canvas.getContext('2d');
    if(c){
      c.scale(3,3);c.textBaseline='middle';
      c.fillStyle='#bca4ff';c.font='22px system-ui';c.fillText('⑂',20,29);
      c.fillStyle='#f6f5ff';c.font='500 15px system-ui';c.fillText('Pull Request',47,29);
      ['#a47dff','#7772c9'].forEach((color,i)=>{c.fillStyle=color;c.beginPath();c.arc(271+i*8,29,2.5,0,Math.PI*2);c.fill();});
      c.font='10px system-ui';['Review','Checks','Files'].forEach((label,i)=>{c.fillStyle=i===0?'#ede7ff':'#a2acd2';c.fillText(label,21+i*70,67);});
      c.strokeStyle='#adabff30';c.beginPath();c.moveTo(18,83);c.lineTo(282,83);c.stroke();
      c.fillStyle='#9d9cff';c.fillRect(20,81,42,2);
      const rows=[{label:'Review findings',color:'#b48eff',glyph:'◇'},{label:'Focused tests',color:'#65cfd3',glyph:'⌁'},{label:'Security signals',color:'#65d8b5',glyph:'◈'},{label:'Fix proposals',color:'#c28bfa',glyph:'↗'}];
      rows.forEach((row,i)=>{const y=93+i*29;c.fillStyle='#172342';c.strokeStyle=row.color+'38';c.lineWidth=.6;c.beginPath();c.roundRect(18,y,264,25,4);c.fill();c.stroke();c.fillStyle=row.color;c.beginPath();c.arc(34,y+12.5,8,0,Math.PI*2);c.fill();c.fillStyle='#111b38';c.font='12px system-ui';c.fillText(row.glyph,29,y+12.5);c.fillStyle='#e2e8ff';c.font='11px system-ui';c.fillText(row.label,51,y+12.5);c.fillStyle='#8baaff';c.fillText('→',264,y+12.5);});
      const action=c.createLinearGradient(18,220,282,240);action.addColorStop(0,'#8a64ff');action.addColorStop(1,'#5a9dff');c.fillStyle=action;c.strokeStyle='#c8bdff';c.beginPath();c.roundRect(18,219,264,27,5);c.fill();c.stroke();c.fillStyle='#ffffff';c.font='500 11px system-ui';c.textAlign='center';c.fillText('✓   Verify before merge',150,233);
    }

    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;return map;
  },[]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <mesh position={[0,0,.111]}><planeGeometry args={[3,2.6]}/><meshBasicMaterial ref={material} map={texture} transparent depthWrite={false}/></mesh>;
}
function Repository({reduced,compact,pointer,progress}:{reduced:boolean;compact:boolean;pointer:ScenePointer;progress:SceneProgress}) {
  const prSurface=useRef<MeshStandardMaterial>(null);const prEdge=useRef<MeshStandardMaterial>(null);const guides=useRef<Group>(null);const prShell=useRef<Group>(null);const root=useRef<Group>(null);const center=useRef<Group>(null);const [hovered,setHovered]=useState<string|null>(null);
  const platform=useRef<Group>(null);
  useFrame(({clock,camera},delta)=>{
    const expand=phase(progress.current.value,.2,.8), idle=reduced||progress.current.scrolling?0:1;
    const cameraPose=interpolatePose(sceneStates.hero.camera,sceneStates.repository.camera,expand);
    if(compact)cameraPose.position[2]+=.8*expand;
    camera.position.set(cameraPose.position[0]+pointer.current.x*.045*idle,cameraPose.position[1]+pointer.current.y*.035*idle,cameraPose.position[2]);
    camera.rotation.set(...cameraPose.rotation);
    const flatten=phase(progress.current.value,.55,.85);
    if(prSurface.current)prSurface.current.color.copy(new Color('#19213b')).lerp(lightSurface,flatten);
    if(prEdge.current)prEdge.current.emissiveIntensity=.65*(1-flatten);
    if(guides.current)guides.current.traverse(child=>{if(child instanceof Mesh){const materials=Array.isArray(child.material)?child.material:[child.material];materials.forEach(material=>{material.opacity=.18*(1-flatten);});}});
    if(prShell.current){const t=phase(progress.current.value,.55,.85);prShell.current.scale.set(1,1-t*.74,1-t*.88);}
    if(root.current){root.current.rotation.z=-.045*(1-expand);root.current.rotation.y=MathUtils.damp(root.current.rotation.y,-.12*(1-expand)+pointer.current.x*.045*idle,4,delta);root.current.rotation.x=MathUtils.damp(root.current.rotation.x,.08*(1-expand)-pointer.current.y*.035*idle,4,delta);}
    if(center.current){const pose=interpolatePose(sceneStates.hero.pullRequest,sceneStates.repository.pullRequest,expand);center.current.position.set(pose.position[0],pose.position[1]+Math.sin(clock.elapsedTime*.35)*.025*idle,pose.position[2]);center.current.scale.setScalar(pose.scale);center.current.rotation.set(...pose.rotation);}
    if(platform.current){const pose=interpolatePose(sceneStates.hero.platform,sceneStates.repository.platform,expand);const retract=phase(progress.current.value,.45,.85);platform.current.scale.set(pose.scale*(1-retract),pose.scale*(1-retract)**2,pose.scale*(1-retract));platform.current.position.set(pose.position[0],pose.position[1]-retract*.3,pose.position[2]);platform.current.visible=retract<.999;}

  });
  const visible=compact?files.filter(node=>node.name!=='tests.py'&&node.name!=='types.ts'):files;
  return <group ref={root} rotation={[.08,-.12,-.045]}>
    {visible.filter(file=>file.reveal===undefined).map((file,i)=><Connection key={file.name} end={file.position} color={file.color} index={i} reduced={reduced} highlighted={!reduced&&hovered===file.name} progress={progress}/>)}
    <group ref={center} scale={1.08} position={[.05,.08,.1]}>
      <group ref={prShell}>
      <RoundedBox args={[3.2,2.84,.2]} radius={.14} smoothness={4}><meshStandardMaterial ref={prSurface} color="#19213b" roughness={.48} metalness={.35}/></RoundedBox>
      <RoundedBox args={[3.23,2.87,.1]} position={[0,0,-.08]} radius={.14} smoothness={4}><meshStandardMaterial ref={prEdge} color="#525baf" emissive="#6663ff" emissiveIntensity={.65} roughness={.5} metalness={.4}/></RoundedBox>
      </group>
      <PullRequestTexture progress={progress}/>
      <ArchitectureNode label="PR CHANGE" role="changed" progress={progress} hub/>
    </group>
    {visible.map((file,i)=><FilePanel key={file.name} node={file} index={i} progress={progress} reduced={reduced} pointer={pointer} hovered={hovered===file.name} related={isRelatedNode(file.name,hovered)} hasSelection={!!hovered} onHover={setHovered}/>)}
    <group ref={platform}><RepositoryPlatform/></group>
    <RepositoryContextGraph progress={progress} reduced={reduced} hovered={hovered} compact={compact}/>
    <group ref={guides}>
    <QuadraticBezierLine start={[-3.3,2.65,-2.5]} mid={[0,3.3,-2.8]} end={[3.2,.8,-2.5]} color="#9397c3" lineWidth={.6} transparent opacity={.18}/>
    <QuadraticBezierLine start={[-2.5,-2.7,-2.4]} mid={[.7,-3,-2.5]} end={[3.4,-1,-2.4]} color="#839abb" lineWidth={.6} transparent opacity={.15}/>
    </group>
  </group>;
}
/** Stepped repository chassis: a physical base connected to the review panel. */
function RepositoryPlatform() {
  return <group position={[.3,-2.75,-.75]} rotation={[.08,.06,-.045]}>
    {[0,1,2].map(i=><RoundedBox key={i} args={[4.6-i*.18,.17,2.05-i*.12]} position={[0,i*.2,0]} radius={.07} smoothness={3}>
      <meshStandardMaterial color={i===2?'#26345c':'#111d37'} roughness={.45} metalness={.5}/>
    </RoundedBox>)}
    <mesh position={[0,.49,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[4.18,1.75]}/><meshStandardMaterial color="#34457e" emissive="#414fc5" emissiveIntensity={.25} metalness={.4} roughness={.5}/></mesh>
    <QuadraticBezierLine start={[-2.1,.51,.88]} mid={[0,.51,.88]} end={[2.1,.51,.88]} color="#7e80ff" lineWidth={1.4} transparent opacity={.8}/>
    <QuadraticBezierLine start={[0,.5,0]} mid={[0,1,-.6]} end={[-.25,1.25,.7]} color="#618aff" lineWidth={.8} transparent opacity={.45}/>
    {[-1.7,-1.4,-1.1].map(x=><mesh key={x} position={[x,.23,1.03]}><boxGeometry args={[.14,.025,.025]}/><meshStandardMaterial color="#72baff" emissive="#497dff" emissiveIntensity={2} toneMapped={false}/></mesh>)}
  </group>;
}
function StudioLighting({reduced,progress}:{reduced:boolean;progress:SceneProgress}) {
  const rim=useRef<PointLight>(null);
  useFrame(({clock})=>{if(rim.current&&!reduced&&!progress.current.scrolling)rim.current.intensity=28+Math.sin(clock.elapsedTime*.22)*.5;});
  return <><ambientLight intensity={.65}/><directionalLight position={[-4,6,6]} intensity={3} color="#dce8ff"/>
    <pointLight ref={rim} position={[4,3,3]} intensity={28} color="#9e87ff"/><pointLight position={[2,-3,2]} intensity={20} color="#7dddf0"/></>;
}
function SceneBloom({progress}:{progress:SceneProgress}) {
  const bloom=useRef<ComponentRef<typeof Bloom>>(null);
  useFrame(()=>{if(bloom.current)bloom.current.intensity=.22*(1-phase(progress.current.value,.55,.85));});
  return <EffectComposer multisampling={2}><Bloom ref={bloom} intensity={.22} luminanceThreshold={1.4} luminanceSmoothing={.35} mipmapBlur/></EffectComposer>;
}
class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<HeroRepositoryFallback/>:this.props.children;}
}
export default function HeroRepositoryScene({reduced,compact,active,pointer,progress}:{reduced:boolean;compact:boolean;active:boolean;pointer:ScenePointer;progress:SceneProgress}) {
  return <SceneBoundary><Canvas dpr={[1,1.5]} frameloop={reduced||!active?'demand':'always'} gl={{antialias:true,alpha:true,powerPreference:'low-power'}} fallback={<HeroRepositoryFallback/>}>
    <PerspectiveCamera makeDefault position={[0,0,10.8]} fov={39}/>
    <StudioLighting reduced={reduced} progress={progress}/>
    <Repository reduced={reduced} compact={compact} pointer={pointer} progress={progress}/>
    <SceneBloom progress={progress}/>
  </Canvas></SceneBoundary>;
}
