'use client';

import {useReducedMotion} from './use-reduced-motion';

import {createContext,useContext,useRef,type ReactNode} from 'react';
import {useScroll,useSpring,type MotionValue} from 'motion/react';
import {Starfield} from './primitives';
import styles from './story.module.css';

const StoryContext=createContext<MotionValue<number>|null>(null);
export function useStoryProgress(){const progress=useContext(StoryContext);if(!progress)throw new Error('useStoryProgress must be used inside <Story>');return progress;}

/** Continuous dark atmosphere; section progress animates content, never a growing background mask. */
export function Story({hero,children}:{hero:ReactNode;children:ReactNode}) {
 const heroZone=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
 const {scrollYProgress}=useScroll({target:heroZone,offset:['start start','end start']});
 const smoothed=useSpring(scrollYProgress,{stiffness:150,damping:32,mass:.35});
 return <StoryContext.Provider value={reduced?scrollYProgress:smoothed}>
  <div className={styles.story}>
   <div className={styles.backdrop} aria-hidden="true"><div className={styles.grid}/><div className={styles.stars}><Starfield count={34} seed={7}/></div></div>
   <div ref={heroZone}>{hero}</div>{children}
  </div>
 </StoryContext.Provider>;
}
