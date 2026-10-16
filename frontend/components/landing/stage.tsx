'use client';

import {useReducedMotion} from './use-reduced-motion';

import {createContext, useContext, useId, useRef, type CSSProperties, type PointerEvent, type ReactNode} from 'react';
import {motion, useInView, useMotionValue, useSpring, useTransform} from 'motion/react';
import styles from './stage.module.css';
import {SceneLayer,useSceneProgress} from './scene-motion';

/**
 * A stage is a fixed design canvas (width × height in px) that scales uniformly with its container.
 * Everything inside is sized in `em`, where 1em equals 16 design pixels, so text stays crisp at any size.
 */
const StageContext = createContext({width: 1, height: 1,active:true});

type StageProps = {
  width: number;
  height: number;
  label: string;
  className?: string;
  /** Degrees of pointer-driven tilt; 0 disables it. */
  tilt?: number;
  /** Resting rotation of the 3D canvas. */
  rest?: {x: number; y: number};
  children: ReactNode;
};

export function Stage({width, height, label, className, tilt = 0, rest = {x: 0, y: 0}, children}: StageProps) {
  const ref=useRef<HTMLDivElement>(null);
  const active=useInView(ref,{margin:'100px'});
  const progress=useSceneProgress();
  const reduced = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const spring = {stiffness: 60, damping: 18, mass: .8};
  const rotateY = useSpring(useTransform(()=>rest.y+pointerX.get()*tilt+(reduced?0:(1-progress.get())*-3)), spring);
  const rotateX = useSpring(useTransform(()=>rest.x-pointerY.get()*tilt*.7+(reduced?0:(1-progress.get())*4)), spring);
  const track = (event: PointerEvent<HTMLDivElement>) => {
    if (reduced || !tilt || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1);
    pointerY.set(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  };
  const release = () => { pointerX.set(0); pointerY.set(0); };
  return (
    <div ref={ref} data-active={active} role="img" aria-label={label} className={`${styles.stage} ${className ?? ''}`}
      style={{aspectRatio: `${width} / ${height}`, '--stage-w': width} as CSSProperties}
      onPointerMove={track} onPointerLeave={release}>
      <StageContext.Provider value={{width, height,active}}>
        <motion.div aria-hidden="true" className={styles.canvas} style={reduced?{rotateX:rest.x,rotateY:rest.y}:{rotateX,rotateY}}>
          {children}
        </motion.div>
      </StageContext.Provider>
    </div>
  );
}

type PlaceProps = {
  x: number;
  y: number;
  w?: number;
  /** Depth in design pixels; positive values sit closer to the viewer. */
  z?: number;
  rotate?: number;
  /** Float amplitude in design pixels; 0 keeps the element still. */
  float?: number;
  delay?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
  reveal?:number;
  children: ReactNode;
};

export function Place({x, y, w, z = 0, rotate = 0, float = 0, delay = 0, duration = 7, className, style, reveal=0, children}: PlaceProps) {
  const {width, height} = useContext(StageContext);
  return (
    <div className={`${styles.place} ${float ? styles.float : ''} ${className ?? ''}`} style={{
      left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%`, width: w ? `${w / 16}em` : undefined,
      '--z': `${z / 16}em`, '--r': `${rotate}deg`, '--amp': `${float / 16}em`,
      '--dur': `${duration}s`, '--delay': `${-delay}s`, ...style,
    } as CSSProperties}>
      <SceneLayer start={reveal} end={Math.min(.99,reveal+.3)} depth={28}>{children}</SceneLayer>
    </div>
  );
}

/** SVG overlay sharing the stage's coordinate system. */
export function StageSvg({children, className}: {children: ReactNode; className?: string}) {
  const {width, height} = useContext(StageContext);
  return <svg className={`${styles.svg} ${className ?? ''}`} viewBox={`0 0 ${width} ${height}`} fill="none">{children}</svg>;
}

type ConnectorProps = {
  d: string;
  /** Gradient stops from source to target. */
  from?: string;
  to?: string;
  /** Seconds before the line draws in once revealed. */
  delay?: number;
  /** Seconds for one data pulse to travel the path; omit for a static line. */
  pulse?: number;
  dimmed?: boolean;
  active?: boolean;
  drawn?: boolean;
  endpoint?: [number, number];
};

/** A glowing link: soft halo, crisp core, a flowing dash and a travelling packet of light. */
export function Connector({d, from = '#7c6cff', to = '#38cff8', delay = 0, pulse, dimmed, active, drawn = true, endpoint}: ConnectorProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const reduced = useReducedMotion();
  const progress=useSceneProgress();
  const {active:stageActive}=useContext(StageContext);
  const start=.1+delay*.13,end=Math.min(.96,start+.35);
  const pathLength=useTransform(progress,[start,end],[0,1]);
  const opacity=useTransform(progress,[start,end],[0,1]);
  const haloOpacity=useTransform(progress,[start,end],[0,.12]);
  const nodeOpacity=useTransform(progress,[end-.08,end],[0,1]);

  return (
    <motion.g animate={{opacity:drawn?(dimmed?.22:1):0}} transition={{duration:reduced?0:.3}} className={styles.connector} data-dimmed={dimmed || undefined} data-active={active || undefined}>
      <defs>
        <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100%" y2="0">
          <stop offset="0" stopColor={from}/><stop offset="1" stopColor={to}/>
        </linearGradient>
      </defs>
      <motion.path style={reduced?undefined:{pathLength,opacity:haloOpacity}} d={d} className={styles.halo} stroke={`url(#g${id})`}/>
      <motion.path style={reduced?undefined:{pathLength,opacity}} d={d} className={styles.core} stroke={`url(#g${id})`}/>
      {!reduced && drawn && stageActive && <motion.path d={d} className={styles.flow} stroke={to} style={{opacity,animationDelay:`${-delay*2}s`}}/>}
      {!reduced && drawn && pulse && stageActive && (
        <motion.circle r="2.2" className={styles.packet} fill={to} style={{color:to,opacity}}>
          <animateMotion dur={`${pulse}s`} begin={`${delay + 1}s`} repeatCount="indefinite" path={d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .55 1"/>
        </motion.circle>
      )}
      {endpoint && drawn && (
        <motion.g style={reduced?undefined:{opacity:nodeOpacity}}>
          <circle cx={endpoint[0]} cy={endpoint[1]} r="7" fill={to} className={styles.nodeGlow}/>
          <circle cx={endpoint[0]} cy={endpoint[1]} r="3.4" fill="#fff" stroke={to} strokeWidth="2"/>
        </motion.g>
      )}
    </motion.g>
  );
}

/**
 * Isometric glass cube built from three clipped faces. Plain CSS gradients are used rather than SVG
 * paint servers, which Chrome can drop to black inside 3D-composited layers.
 */
export function GlassCube({size = 1, tone = 'violet'}: {size?: number; tone?: 'violet' | 'blue' | 'cyan'}) {
  return (
    <span className={styles.cube} data-tone={tone} style={{width: `${3.75 * size}em`}} aria-hidden="true">
      <i data-face="top"/><i data-face="left"/><i data-face="right"/>
    </span>
  );
}
