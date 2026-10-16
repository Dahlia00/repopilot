'use client';

import {useReducedMotion} from './use-reduced-motion';

import {useState} from 'react';
import {AnimatePresence, motion, useMotionValueEvent, } from 'motion/react';
import {CheckCard, GlassCard, GithubTile} from './glass';
import {Icon, type IconName} from './icons';
import {Connector, Place, Stage, StageSvg} from './stage';
import styles from './verify.module.css';
import {useSceneProgress} from './scene-motion';

const TOTAL_TESTS = 12;
/** Steps: 0 idle · 1 running tests · 2–4 checks resolve in turn · 5 complete. */
const COMPLETE = 5;

const summary: {icon: IconName; title: string; detail: string}[] = [
  {icon: 'flask', title: 'Unit Tests', detail: '12/12 passing'},
  {icon: 'shield', title: 'Security Scan', detail: 'No issues'},
  {icon: 'regression', title: 'Regression Check', detail: 'No regressions'},
  {icon: 'chart', title: 'Code Quality', detail: 'All good'},
];

const checks: {icon: IconName; title: string; done: string}[] = [
  {icon: 'shield', title: 'Security scan', done: 'No issues found'},
  {icon: 'regression', title: 'Regression check', done: 'No regressions'},
  {icon: 'chart', title: 'Code quality', done: 'All checks passing'},
];

function useVerificationRun(reduced:boolean) {
  const progress=useSceneProgress();
  const sample=(p:number)=>({step:p>=.9?COMPLETE:p>=.79?4:p>=.71?3:p>=.62?2:p>=.18?1:0,passed:Math.max(0,Math.min(TOTAL_TESTS,Math.floor((p-.2)/.37*TOTAL_TESTS)))});
  const [state,setState]=useState(()=>sample(progress.get()));
  useMotionValueEvent(progress,'change',value=>{const next=sample(value);setState(old=>old.step===next.step&&old.passed===next.passed?old:next);});
  return reduced?{step:COMPLETE,passed:TOTAL_TESTS}:state;
}

export default function VerificationStage() {
  const reduced = !!useReducedMotion();
  const {step, passed} = useVerificationRun(reduced);
  const complete = step >= COMPLETE;

  return (
    <div className={styles.wrap}>
      <Stage width={680} height={520} tilt={3} rest={{x: 3, y: -6}}
        label="Illustration: RepoPilot verifying a fix — 12 of 12 tests passing, no security issues, no regressions, code quality checks passing, and the pull request ready to merge.">
        <Place x={150} y={340} w={500} z={-140}>
          <div className={styles.platformWrap}><div className={styles.platform} data-complete={complete || undefined}><i/></div></div>
        </Place>
        <StageSvg>
          {summary.map((item, index) => {
            const y = 74 + index * 100;
            return <Connector key={item.title} d={`M204 ${y} C 220 ${y}, 218 ${150 + index * 52}, 236 ${150 + index * 52}`}
              from="#2ee6a0" to="#7c6cff" drawn delay={.5 + index * .12} pulse={index<2?4.2+index*.25:undefined}/>;
          })}
          <Connector d="M532 236 C 556 236, 558 200, 574 196" from="#7c6cff" to="#5ea2ff" drawn delay={.9} endpoint={[574, 196]}/>
          <Connector d="M470 382 C 470 404, 476 412, 476 420" from="#7c6cff" to="#2ee6a0" drawn={complete} pulse={2}/>
        </StageSvg>
        {summary.map((item, index) => (
          <Place key={item.title} x={0} y={40 + index * 100} w={204} z={50} float={6} duration={9} delay={index * 1.1} reveal={.08+index*.06}>
            <CheckCard {...item}/>
          </Place>
        ))}
        <Place x={236} y={40} w={296} z={20} reveal={.16}>
          <div>
            <GlassCard tone={complete ? 'success' : 'violet'} strong className={styles.panel}>
              <div className={styles.panelHead}>
                <span className={styles.status} data-complete={complete || undefined}>
                  <Icon name={complete ? 'checkCircle' : 'spinner'} size="1.25em"/>
                </span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={complete ? 'done' : 'running'} initial={{opacity: 0, y: 6}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -6}}
                    transition={{duration: reduced?0:.3}}>
                    {complete ? 'Verification complete' : 'Verification in progress'}
                  </motion.span>
                </AnimatePresence>
                <Icon name="arrow" size=".85em" className={styles.headArrow}/>
              </div>
              <div className={styles.task}>
                <span className={styles.taskIcon}><Icon name="flask" size="1.1em"/></span>
                <div className={styles.taskBody}>
                  <div className={styles.taskTop}>
                    <strong>{passed < TOTAL_TESTS ? 'Running tests…' : 'Tests passed'}</strong>
                    <span className={styles.count}>{passed}/{TOTAL_TESTS}</span>
                  </div>
                  <div className={styles.bar}><motion.i animate={{scaleX: passed / TOTAL_TESTS}} transition={{duration: reduced?0:.3, ease: 'easeOut'}}/></div>
                </div>
              </div>
              {checks.map((check, index) => {
                const done = step >= index + 2;
                const running = step === index + 1 && passed === TOTAL_TESTS;
                return (
                  <div key={check.title} className={styles.task} data-done={done || undefined}>
                    <span className={styles.taskIcon}><Icon name={check.icon} size="1.1em"/></span>
                    <div className={styles.taskBody}>
                      <strong>{check.title}</strong>
                      <small>{done ? check.done : running ? 'Analyzing…' : 'Queued'}</small>
                    </div>
                    <span className={styles.result}>
                      {done
                        ? <motion.span initial={reduced ? false : {scale: 0}} animate={{scale: 1}} transition={{duration:reduced?0:.35,ease:[.22,1,.36,1]}} className={styles.tick}>
                            <Icon name="check" size=".8em" strokeWidth="3"/>
                          </motion.span>
                        : <span className={styles.pending} data-running={running || undefined}/>}
                    </span>
                  </div>
                );
              })}
            </GlassCard>
          </div>
        </Place>
        <Place x={470} y={-14} w={204} z={90} float={8} delay={.5}>
          <motion.div initial={reduced ? false : {opacity: 0, scale: .7, y: 10}}
            animate={complete ? {opacity: 1, scale: 1, y: 0} : {opacity: 0, scale: .7, y: 10}}
            transition={{duration:reduced?0:.5,ease:[.22,1,.36,1]}}>
            <GlassCard tone="success" strong className={styles.badge}>
              <span className={styles.tick} data-large><Icon name="check" size="1em" strokeWidth="3"/></span>All checks passing
            </GlassCard>
          </motion.div>
        </Place>
        <Place x={574} y={160} w={72} z={40} float={6} delay={2} reveal={.48}>
          <GithubTile/>
        </Place>
        <Place x={420} y={398} w={236} z={110} float={7} delay={1.4} reveal={.58}>
          <div>
            <GlassCard tone={complete ? 'success' : 'blue'} strong className={styles.ready} >
              <div className={styles.readyHead}><Icon name="merge" size="1.5em"/>{complete ? 'Ready to merge' : 'Awaiting checks'}</div>
              <div className={styles.readyBar}><motion.i animate={{scaleX: complete ? 1 : passed / TOTAL_TESTS * .6}} transition={{duration: reduced?0:.6, ease: [.22, 1, .36, 1]}}/></div>
            </GlassCard>
          </div>
        </Place>
      </Stage>
      <p className={styles.srStatus}>Illustrative verification sequence; scrolling does not execute tests or modify a repository.</p>
    </div>
  );
}
