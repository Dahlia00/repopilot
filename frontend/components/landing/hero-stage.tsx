'use client';

import {useReducedMotion} from './use-reduced-motion';

import {motion, } from 'motion/react';
import {FileCard, GithubTile} from './glass';
import {Icon, type IconName} from './icons';
import {Connector, Place, Stage, StageSvg} from './stage';
import styles from './hero.module.css';

const rows: {icon: IconName; label: string; tone: 'danger' | 'success' | 'violet'}[] = [
  {icon: 'alert', label: '3 issues found', tone: 'danger'},
  {icon: 'check', label: 'All tests passing', tone: 'success'},
  {icon: 'check', label: 'No security issues', tone: 'success'},
  {icon: 'bulb', label: 'Fixes suggested', tone: 'violet'},
];

const files = [
  {name: 'auth.py', added: 12, removed: 3, x: 116, y: 12, w: 130, z: -30, float: 12, delay: 0, variant: 0},
  {name: 'types.ts', x: 540, y: 0, w: 150, z: -60, float: 10, delay: 2.4, variant: 1, tone: 'blue' as const},
  {name: 'api.py', added: 4, removed: 1, x: 26, y: 206, w: 130, z: 70, float: 14, delay: 1.2, variant: 2},
  {name: 'routes.py', x: 626, y: 168, w: 128, z: 40, float: 11, delay: 3.1, variant: 3, tone: 'blue' as const},
  {name: 'tests.py', added: 28, removed: 2, x: 44, y: 398, w: 140, z: 90, float: 13, delay: .6, variant: 4},
  {name: 'config.ts', x: 604, y: 432, w: 132, z: 100, float: 12, delay: 1.8, variant: 1, tone: 'cyan' as const},
];

const links: {d: string; end: [number, number]; from: string; to: string; pulse: number}[] = [
  {d: 'M246 62 C 282 62, 300 70, 300 96', end: [300, 96], from: '#9b8cff', to: '#7c6cff', pulse: 3.2},
  {d: 'M540 50 C 502 50, 480 62, 480 96', end: [480, 96], from: '#5ea2ff', to: '#7c6cff', pulse: 3.8},
  {d: 'M156 256 C 178 256, 176 282, 196 282', end: [196, 282], from: '#9b8cff', to: '#38cff8', pulse: 2.8},
  {d: 'M626 218 C 600 218, 598 244, 575 244', end: [575, 244], from: '#5ea2ff', to: '#38cff8', pulse: 3.4},
  {d: 'M184 446 C 192 446, 190 412, 196 402', end: [196, 402], from: '#9b8cff', to: '#38cff8', pulse: 3},
  {d: 'M604 470 C 588 470, 592 428, 575 418', end: [575, 418], from: '#38cff8', to: '#7c6cff', pulse: 3.6},
  {d: 'M150 112 C 150 160, 92 166, 92 206', end: [92, 206], from: '#7c6cff', to: '#9b8cff', pulse: 4.2},
  {d: 'M688 318 V 270', end: [688, 270], from: '#5ea2ff', to: '#38cff8', pulse: 2.4},
];

function PullRequestPanel() {
  const reduced = useReducedMotion();
  const enter = (index: number) => ({
    initial: reduced ? false : {opacity: 0, x: -12},
    animate: {opacity: 1, x: 0},
    transition: {delay: .9 + index * .16, duration: .6, ease: [.22, 1, .36, 1]},
  } as const);
  return (
    <div className={styles.screen}>
      <div className={styles.screenHeader}>
        <span className={styles.prTitle}><Icon name="branch" size="1.15em"/>Pull Request <em>#482</em></span>
        <span className={styles.prDots}><i/><i/></span>
      </div>
      <div className={styles.tabs}><span data-active>Review</span><span>Checks</span><span>Files</span></div>
      <div className={styles.rows}>
        {rows.map((row, index) => (
          <motion.div key={row.label} {...enter(index)} className={styles.row} data-tone={row.tone}>
            <span className={styles.rowIcon}><Icon name={row.icon} size="1.05em" strokeWidth="2.4"/></span>
            {row.label}
            <span className={styles.rowLink}>View <Icon name="arrow" size=".95em"/></span>
          </motion.div>
        ))}
      </div>
      <motion.div {...enter(rows.length)} className={styles.merge}>
        <Icon name="check" size="1.2em" strokeWidth="2.4"/>Ready to merge
      </motion.div>
    </div>
  );
}

export default function HeroStage() {
  return (
    <Stage width={760} height={620} tilt={5} rest={{x: 4, y: -9}} className={styles.stage}
      label="Illustration: a pull request review showing three issues found, passing tests, no security issues and suggested fixes, connected to the changed repository files.">
      <div className={styles.floorGlow}/>
      <Place x={60} y={-40} w={180} z={-220} className={styles.ghost}><span/><span/><span/></Place>
      <Place x={590} y={110} w={150} z={-260} className={styles.ghost}><span/><span/></Place>
      <StageSvg>
        {links.map((link, index) =>
          <Connector key={link.d} d={link.d} from={link.from} to={link.to} endpoint={link.end} pulse={link.pulse} delay={.5 + index * .08}/>)}
      </StageSvg>
      <Place x={148} y={96} w={474} className={styles.laptop}>
        <PullRequestPanel/>
        <div className={styles.deck}><i/></div>
      </Place>
      {files.map(({name, x, y, w, z, float, delay, ...card}) => (
        <Place key={name} x={x} y={y} w={w} z={z} float={float} delay={delay}>
          <FileCard name={name} {...card}/>
        </Place>
      ))}
      <Place x={650} y={316} w={76} z={60} float={9} delay={2.2}><GithubTile/></Place>
    </Stage>
  );
}
