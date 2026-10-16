'use client';

import {useReducedMotion} from './use-reduced-motion';

import Link from 'next/link';
import type {ComponentProps, CSSProperties, ReactNode} from 'react';
import {motion, type Variants} from 'motion/react';
import {SceneText} from './scene-motion';
import {Icon, type IconName} from './icons';
import styles from './landing.module.css';

export function ActionLink({variant = 'primary', size, className, ...props}:
  ComponentProps<typeof Link> & {variant?: 'primary' | 'ghost'; size?: 'small' | 'large'}) {
  return <Link {...props} className={`${styles.action} ${className ?? ''}`} data-variant={variant} data-size={size}/>;
}

/** Deterministic pseudo-random sequence so server and client render identical stars. */
function sequence(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export function Starfield({count, seed, className}: {count: number; seed: number; className?: string}) {
  const next = sequence(seed);
  const stars = Array.from({length: count}, () => ({
    left: next() * 100, top: next() * 100, size: next() < .85 ? 1 : 2, delay: next() * 6, bright: next() > .7,
  }));
  return (
    <div className={`${styles.starfield} ${className ?? ''}`} aria-hidden="true">
      {stars.map((star, index) => (
        <i key={index} data-bright={star.bright || undefined} style={{
          left: `${star.left.toFixed(2)}%`, top: `${star.top.toFixed(2)}%`,
          width: star.size, height: star.size, animationDelay: `${-star.delay.toFixed(2)}s`,
        }}/>
      ))}
    </div>
  );
}

const ease = [.22, 1, .36, 1] as const;
const group: Variants = {hidden: {}, shown: {transition: {staggerChildren: .09, delayChildren: .05}}};
const item: Variants = {
  hidden: {opacity: 0, y: 26, filter: 'blur(6px)'},
  shown: {opacity: 1, y: 0, filter: 'blur(0px)', transition: {duration: .9, ease}},
};

/** Staggered scroll reveal: wrap a group, mark children with <RevealItem>. */
export function Reveal({children, className, amount = .35, style}: {children: ReactNode; className?: string; amount?: number; style?: CSSProperties}) {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className} style={style} variants={group} initial={reduced ? false : 'hidden'}
      whileInView="shown" viewport={{once:false,amount}}>
      {children}
    </motion.div>
  );
}

export function RevealItem({children, className, as = 'div'}: {children: ReactNode; className?: string; as?: 'div' | 'li' | 'p'}) {
  const Component = motion[as];
  return <Component className={className} variants={item}>{children}</Component>;
}

type IntroProps = {
  id: string;
  eyebrow: string;
  title: ReactNode;
  accent: ReactNode;
  body: string;
  features: {icon: IconName; label: string}[];
};

/** The text column shared by the feature sections. */
export function SectionIntro({id, eyebrow, title, accent, body, features}: IntroProps) {
  return (
    <div className={styles.intro}>
      <SceneText as="p" index={0} className={styles.eyebrow}>{eyebrow}</SceneText>
      <h2 id={id} className={styles.heading}><SceneText as="span" index={1}>{title}</SceneText><br/><SceneText as="span" index={2} className={styles.accentText}>{accent}</SceneText></h2>
      <SceneText as="p" index={3} className={styles.body}>{body}</SceneText>
      <ul className={styles.features}>{features.map((feature,index)=><SceneText as="li" index={4+index} key={feature.label}>
        <span className={styles.featureIcon}><Icon name={feature.icon} size={16}/></span>{feature.label}
      </SceneText>)}</ul>
    </div>
  );
}
