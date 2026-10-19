'use client';

import {useReducedMotion} from './use-reduced-motion';

import dynamic from 'next/dynamic';
import {motion, useTransform} from 'motion/react';
import {Icon} from './icons';
import {ActionLink} from './primitives';
import {useStoryProgress} from './story';
import page from './landing.module.css';
import styles from './hero.module.css';

const HeroStage = dynamic(() => import('./hero-stage'), {ssr: false, loading: () => <div className={styles.stagePlaceholder}/>});

const trust = [
  {icon: 'branch', label: <>Repository-aware<br/>code review</>},
  {icon: 'shield', label: <>Security<br/>analysis</>},
  {icon: 'checkCircle', label: <>Verified fixes<br/>before merge</>},
] as const;

export default function HeroSection() {
  const reduced = useReducedMotion();
  const progress = useStoryProgress();
  // Keep the hero readable through its natural exit; no empty-copy interval or light takeover.
  const copyY = useTransform(progress, [0, 1], [0, reduced ? 0 : -30]);
  const copyOpacity = useTransform(progress, [0, .65, 1], [1, 1, .4]);
  // Restrained depth recession while the next section assembles in normal document flow.
  const stageY = useTransform(progress, [0, 1], [0, reduced ? 0 : 40]);
  const stageScale = useTransform(progress, [.2, .8], [1, reduced ? 1 : .97]);
  const stageOpacity = useTransform(progress, [0, .7, 1], [1, 1, .65]);

  const enter = (index: number) => ({
    initial: reduced ? false : {opacity: 0, y: 18, filter: 'blur(2px)'},
    animate: {opacity: 1, y: 0, filter: 'blur(0px)'},
    transition: {duration: reduced?0:.9, delay: reduced?0:.1 + index * .09, ease: [.22, 1, .36, 1]},
  } as const);

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={`${page.container} ${styles.layout}`}>
        <motion.div className={styles.copy} style={reduced?undefined:{y:copyY,opacity:copyOpacity}}>
          <motion.h1 {...enter(0)} id="hero-title" className={styles.title}>
            Review smarter.<br/><span className={page.gradientText}>Verify before<br/>you ship.</span>
          </motion.h1>
          <motion.p {...enter(1)} className={styles.lede}>
            RepoPilot analyzes your code changes, finds real issues, runs deep verification, and gives you
            the confidence to merge — faster and safer.
          </motion.p>
          <motion.div {...enter(2)} className={styles.actions}>
            <ActionLink href="/app">Open RepoPilot<Icon name="arrow" size={16}/></ActionLink>
            <ActionLink href="#how-it-works" variant="ghost"><span className={styles.play}><Icon name="play" size={12}/></span>See how it works</ActionLink>
          </motion.div>
          <motion.ul {...enter(3)} className={styles.trust}>
            {trust.map(item => <li key={item.icon}><span><Icon name={item.icon} size={18}/></span>{item.label}</li>)}
          </motion.ul>
        </motion.div>
        <motion.div className={styles.visual} style={reduced?undefined:{y:stageY,scale:stageScale,opacity:stageOpacity}}>
          <motion.div initial={reduced ? false : {opacity: 0, scale: .96}} animate={{opacity: 1, scale: 1}}
            transition={{duration: 1.2, delay: .25, ease: [.22, 1, .36, 1]}}>
            <HeroStage/>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
