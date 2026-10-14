'use client';

import {useReducedMotion} from './use-reduced-motion';

import {useRef,type ComponentProps,type ReactNode} from 'react';
import {motion,useScroll,useSpring,useTransform} from 'motion/react';
import {SectionIntro} from './primitives';
import {SceneMotion} from './scene-motion';
import styles from './landing.module.css';

type FeatureSectionProps=ComponentProps<typeof SectionIntro>&{anchor:string;className:string;decor?:ReactNode;visual:ReactNode};
/** A section-local, reversible assembly timeline. Native scrolling remains untouched. */
export default function FeatureSection({anchor,className,decor,visual,...intro}:FeatureSectionProps) {
 const ref=useRef<HTMLElement>(null),artRef=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
 const {scrollYProgress}=useScroll({target:ref,offset:['start 95%','start 12%']});
 const {scrollYProgress:artScroll}=useScroll({target:artRef,offset:['start 95%','start 14%']});
 const artSmooth=useSpring(artScroll,{stiffness:150,damping:32,mass:.35});
 const artProgress=reduced?artScroll:artSmooth;
 const smooth=useSpring(scrollYProgress,{stiffness:150,damping:32,mass:.35});
 const progress=reduced?scrollYProgress:smooth;
 const scale=useTransform(artProgress,[0,1],[.94,1]);
 const y=useTransform(artProgress,[0,1],[30,0]);
 const rotateX=useTransform(artProgress,[0,1],[3,0]);
 return <SceneMotion progress={progress}><section ref={ref} id={anchor} className={`${styles.section} ${className}`} aria-labelledby={intro.id}>
  {decor}<div className={`${styles.container} ${styles.split}`}>
   <SectionIntro {...intro}/>
   <motion.div ref={artRef} style={reduced?undefined:{scale,y,rotateX,transformPerspective:1400}}><SceneMotion progress={artProgress}>{visual}</SceneMotion></motion.div>
  </div>
 </section></SceneMotion>;
}
