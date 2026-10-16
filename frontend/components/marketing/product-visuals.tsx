'use client';
import {motion,useReducedMotion} from 'motion/react';
import type {CSSProperties,ReactNode} from 'react';
import Icon,{type IconName} from './marketing-icon';
import styles from './product-visuals.module.css';

function Floating({children,className,delay=0}:{children:ReactNode;className:string;delay?:number}) {
 const reduced=useReducedMotion();
 return <motion.div className={className} animate={reduced?undefined:{y:[0,-7,0]}} transition={{duration:7+delay,delay,repeat:Infinity,ease:'easeInOut'}}>{children}</motion.div>;
}
function Window({title,icon='file',children,className=''}:{title:string;icon?:IconName;children:ReactNode;className?:string}) {
 return <div className={`${styles.window} ${className}`}><div className={styles.title}><Icon name={icon} size={16}/><span>{title}</span><i/></div>{children}</div>;
}
function FileList({items}:{items:string[]}) {return <ul className={styles.fileList}>{items.map(item=><li key={item}><Icon name="file" size={12}/>{item}</li>)}</ul>;}
function ArchitectureBlocks(){return <div className={styles.blocks}>{Array.from({length:9},(_,i)=><i key={i} style={{'--i':i} as CSSProperties}/>)}</div>;}
function Connections({verification=false}:{verification?:boolean}) {
 const paths=verification?['M320 260C100 260 190 70 70 90','M320 260C120 260 170 350 60 380','M320 260C500 260 410 100 570 110','M320 260C480 260 420 400 570 390']:['M330 260C150 260 220 90 100 100','M330 260C480 260 400 70 520 100','M330 260C120 260 230 420 100 400','M330 260C490 260 400 430 520 420','M330 260C550 260 460 245 600 245'];
 return <svg className={styles.connections} viewBox="0 0 680 530" fill="none" aria-hidden="true"><defs><linearGradient id={verification?'verify-flow':'context-flow'}><stop stopColor="#8551f8"/><stop offset="1" stopColor="#28c9fa"/></linearGradient></defs>{paths.map((d,i)=><g key={d}><path d={d} stroke={verification?'#5f9dfb':`url(#context-flow)`} strokeWidth="1.5" opacity=".65"/><path className={styles.signal} d={d} stroke={i%2?'#45cafa':'#b388ff'} strokeWidth="3" strokeDasharray="3 600" style={{animationDelay:`${i*-1.7}s`}}/></g>)}</svg>;
}
export function RepositoryVisual(){
 return <div className={`${styles.diagram} ${styles.repository}`} role="img" aria-label="Product illustration: a pull request connected to related files, dependencies, tests and repository context">
  <div className={styles.orbit}/><ArchitectureBlocks/><Connections/>
  <Floating className={`${styles.float} ${styles.related}`} delay={.3}><Window title="Related files" icon="branch"><FileList items={['auth.py','middleware.py','routes.py']}/></Window></Floating>
  <Floating className={`${styles.float} ${styles.dependencies}`} delay={1.1}><Window title="Dependencies" icon="layers"><FileList items={['Local imports','Shared types','Call sites']}/></Window></Floating>
  <Floating className={`${styles.float} ${styles.services}`} delay={.8}><Window title="Connected code" icon="link"><FileList items={['API handlers','Data access','Configuration']}/></Window></Floating>
  <Floating className={`${styles.float} ${styles.relatedTests}`} delay={1.6}><Window title="Related tests" icon="flask"><FileList items={['test_auth.py','test_routes.py','test_validation.py']}/></Window></Floating>
  <Floating className={`${styles.float} ${styles.contextFiles}`} delay={.6}><Window title="Repository context" icon="file"><FileList items={['api.py','config.ts','database.py']}/></Window></Floating>
  <Floating className={`${styles.float} ${styles.change}`}><Window title="PR CHANGE" icon="branch" className={styles.changeWindow}><div className={styles.diffBars}><i/><i/><i/></div><p>Changed code, connected.</p><div className={styles.codeBars}><i/><i/><i/></div></Window></Floating>
  <span className={styles.diagramCaption}>ONE CHANGE. THE CONTEXT AROUND IT.</span>
 </div>;
}
const checks:{icon:IconName;title:string;detail:string}[]=[{icon:'code',title:'Syntax validation',detail:'Parse the proposed change'},{icon:'flask',title:'Focused tests',detail:'Validate expected behavior'},{icon:'shield',title:'Security analysis',detail:'Compare before and after'},{icon:'branch',title:'Regression checks',detail:'Look for unintended changes'}];
export function VerificationVisual(){
 return <div className={`${styles.diagram} ${styles.verification}`} role="img" aria-label="Product illustration of the verification workflow: syntax validation, focused tests, security analysis and regression checks before human approval">
  <div className={styles.orbit}/><ArchitectureBlocks/><Connections verification/>
  <div className={styles.verifyBase}><i/><i/><i/></div>
  <div className={styles.checkStack}>{checks.slice(1).map((check,i)=><Floating key={check.title} className={styles.miniCheck} delay={i*.6}><Icon name={check.icon} size={21}/><div><strong>{check.title}</strong><span>Part of verification</span></div><span className={styles.miniDot}/></Floating>)}</div>
  <Floating className={`${styles.float} ${styles.verifyMain}`}><Window title="Fix verification" icon="shield" className={styles.verifyWindow}><p className={styles.workflowLabel}>EVIDENCE BEFORE APPROVAL</p><div className={styles.checkRows}>{checks.map((check,i)=><div key={check.title}><span className={styles.checkIcon}><Icon name={check.icon} size={19}/></span><div><strong>{check.title}</strong><span>{check.detail}</span></div><span className={styles.step}>{String(i+1).padStart(2,'0')}</span></div>)}</div><div className={styles.approval}><Icon name="check" size={17}/>Verified evidence. Human decision.</div></Window></Floating>
  <Floating className={`${styles.float} ${styles.evidence}`} delay={.9}><Icon name="check" size={23}/><span>Confidence, backed<br/><strong>by evidence.</strong></span></Floating>
  <Floating className={`${styles.float} ${styles.merge}`} delay={1.5}><Window title="Before you merge" icon="branch"><p>Review the evidence.<br/>Make the final call.</p><div className={styles.readiness}><span/></div></Window></Floating>
 </div>;
}
