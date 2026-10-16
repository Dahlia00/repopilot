'use client';

import {useReducedMotion} from './use-reduced-motion';

import {createContext,useContext,type ReactNode} from 'react';
import {motion,useMotionValue,useTransform,type MotionValue} from 'motion/react';

const SceneContext=createContext<MotionValue<number>|null>(null);
export function SceneMotion({progress,children}:{progress:MotionValue<number>;children:ReactNode}) {
 return <SceneContext.Provider value={progress}>{children}</SceneContext.Provider>;
}
/** Hero elements default to their designed rest; feature scenes supply reversible local progress. */
export function useSceneProgress(){const rest=useMotionValue(1);return useContext(SceneContext)??rest;}
export function SceneLayer({children,start=0,end=.38,className,depth=24}:{children:ReactNode;start?:number;end?:number;className?:string;depth?:number}) {
 const progress=useSceneProgress(),reduced=useReducedMotion();
 const opacity=useTransform(progress,[start,end],[0,1]);
 const scale=useTransform(progress,[start,end],[.88,1]);
 const y=useTransform(progress,[start,end],[18,0]);
 const z=useTransform(progress,[start,end],[-depth,0]);
 const rotateX=useTransform(progress,[start,end],[5,0]);
 return <motion.div className={className} style={reduced?{opacity:1,scale:1,y:0,z:0,rotateX:0}:{opacity,scale,y,z,rotateX,transformStyle:'preserve-3d'}}>{children}</motion.div>;
}
export function SceneText({children,index=0,as='div',className}:{children:ReactNode;index?:number;as?:'div'|'span'|'p'|'li';className?:string}) {
 const progress=useSceneProgress(),reduced=useReducedMotion(),start=.04+index*.065;
 const opacity=useTransform(progress,[start,start+.23],[0,1]);
 const y=useTransform(progress,[start,start+.23],[12,0]);
 const Element=motion[as];
 return <Element className={className} style={{...(reduced?{opacity:1,y:0}:{opacity,y}),...(as==='span'?{display:'inline-block'}:{})}}>{children}</Element>;
}
