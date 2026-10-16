'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useEffect,useRef,useState,useSyncExternalStore,type MouseEvent,type ReactNode} from 'react';
import {motion,useInView,useReducedMotion,useScroll,useTransform} from 'motion/react';
import ProductMark from '../shared/product-mark';
import Icon,{type IconName} from './marketing-icon';
import HeroRepositoryFallback from './hero-repository-fallback';
import {RepositoryVisual,VerificationVisual} from './product-visuals';
import styles from './public-entry.module.css';

const HeroScene=dynamic(()=>import('./hero-repository-scene'),{ssr:false,loading:()=> <HeroRepositoryFallback/>});
const subscribe=(notify:()=>void)=>{const query=window.matchMedia('(min-width: 768px)');query.addEventListener('change',notify);return()=>query.removeEventListener('change',notify);};
const desktopSnapshot=()=>window.matchMedia('(min-width: 768px)').matches;
const serverSnapshot=()=>false;
const ease=[.22,1,.36,1] as [number,number,number,number];
function Reveal({children,className='',delay=0}:{children:ReactNode;className?:string;delay?:number}) {
 const reduced=useReducedMotion();
 return <motion.div className={className} initial={reduced?false:{opacity:0,y:22}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.15}} transition={{duration:reduced?0:.75,delay:reduced?0:delay,ease}}>{children}</motion.div>;
}
function FeatureList({items}:{items:{icon:IconName;text:string}[]}) {return <ul className={styles.features}>{items.map(item=><li key={item.text}><span><Icon name={item.icon} size={18}/></span>{item.text}</li>)}</ul>;}
export default function PublicEntry(){
 const hero=useRef<HTMLElement>(null),pointer=useRef({x:0,y:0}),progress=useRef({value:0,scrolling:false});
 const desktop=useSyncExternalStore(subscribe,desktopSnapshot,serverSnapshot),reduced=useReducedMotion(),active=useInView(hero,{margin:'100px'});
 const [compact,setCompact]=useState(false),[visible,setVisible]=useState(true);
 useEffect(()=>{const query=window.matchMedia('(max-width:1100px)');const update=()=>setCompact(query.matches);update();query.addEventListener('change',update);const visibility=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',visibility);return()=>{query.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility);};},[]);
 const {scrollYProgress}=useScroll({target:hero,offset:['start start','end start']});
 const parallax=useTransform(scrollYProgress,[0,1],[0,reduced?0:55]);
 function scrollToSection(e:MouseEvent<HTMLAnchorElement>){const target=document.querySelector(e.currentTarget.hash);if(target){e.preventDefault();target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});}}
 return <div className={styles.page}>
  <div className={styles.heroShell}>
   <div className={styles.technicalGrid}/><div className={styles.heroRays}/>
   <header className={`${styles.container} ${styles.navbar}`}>
    <Link href="/" className={styles.brand} aria-label="RepoPilot home"><ProductMark size={25}/><span>RepoPilot</span></Link>
    <nav aria-label="Main navigation"><a href="#product" onClick={scrollToSection}>Product</a><a href="#repository" onClick={scrollToSection}>How it works</a><a href="#verification" onClick={scrollToSection}>Verification</a><a href="https://github.com/Dahlia00/repopilot#safety-design">Security</a><a href="https://github.com/Dahlia00/repopilot#readme">Docs</a><a href="https://github.com/Dahlia00/repopilot">GitHub</a></nav>
    <Link href="/app" className={`${styles.button} ${styles.navAction}`}>Open App<Icon name="arrow" size={14}/></Link>
   </header>
   <main>
    <section ref={hero} id="product" className={`${styles.container} ${styles.hero}`} aria-labelledby="hero-title">
     <div className={styles.heroCopy}>
      <Reveal><p className={styles.heroEyebrow}><Icon name="spark" size={14}/>AI-POWERED CODE REVIEW & VERIFICATION</p></Reveal>
      <Reveal delay={.06}><h1 id="hero-title">Review smarter.<br/><span>Verify before<br/>you ship.</span></h1></Reveal>
      <Reveal delay={.12}><p className={styles.heroDescription}>RepoPilot reviews your code changes, finds real issues, and verifies proposed fixes. Move from pull request to confident decision—with evidence.</p></Reveal>
      <Reveal delay={.18}><div className={styles.actions}><Link className={styles.button} href="/app">Open RepoPilot<Icon name="arrow" size={16}/></Link><a className={`${styles.button} ${styles.secondary}`} href="https://github.com/Dahlia00/repopilot"><Icon name="github" size={17}/>View on GitHub</a></div></Reveal>
      <Reveal delay={.22}><ul className={styles.heroFeatures}><li><Icon name="branch" size={24}/><span>Repository-aware<br/>code review</span></li><li><Icon name="shield" size={24}/><span>Security<br/>analysis</span></li><li><Icon name="check" size={24}/><span>Verified fixes<br/>before merge</span></li></ul></Reveal>
     </div>
     <motion.div className={styles.heroVisual} style={{y:parallax}} onPointerMove={e=>{if(reduced)return;const r=e.currentTarget.getBoundingClientRect();pointer.current={x:Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1)),y:Math.max(-1,Math.min(1,1-(e.clientY-r.top)/r.height*2))};}} onPointerLeave={()=>{pointer.current={x:0,y:0};}} aria-hidden="true">
      <div className={styles.sceneHalo}/>{desktop?<HeroScene reduced={!!reduced} compact={compact} active={active&&visible} pointer={pointer} progress={progress}/>:<HeroRepositoryFallback/>}
     </motion.div>
    </section>
   </main>
   <div className={styles.waveLines} aria-hidden="true"><i/><i/><i/></div>
  </div>
  <section id="repository" className={`${styles.section} ${styles.contextSection}`} aria-labelledby="context-title">
   <div className={styles.sectionGrid}/>
   <div className={`${styles.container} ${styles.sectionLayout}`}>
    <Reveal className={styles.sectionCopy}><p className={styles.eyebrow}>REPOSITORY CONTEXT</p><h2 id="context-title">Understand the change.<br/><span>See the full picture.</span></h2><p className={styles.body}>RepoPilot connects changed files with related code, dependencies, and tests—so your review sees beyond the diff.</p><FeatureList items={[{icon:'branch',text:'Map changes across your repository'},{icon:'link',text:'Understand dependencies and impact'},{icon:'shield',text:'Bring related code and tests into view'}]}/></Reveal>
    <Reveal className={styles.sectionVisual} delay={.1}><RepositoryVisual/></Reveal>
   </div>
  </section>
  <section id="verification" className={`${styles.section} ${styles.verificationSection}`} aria-labelledby="verification-title">
   <div className={styles.sectionGrid}/>
   <div className={`${styles.container} ${styles.sectionLayout}`}>
    <Reveal className={styles.sectionCopy}><p className={styles.eyebrow}>VERIFICATION & CONFIDENCE</p><h2 id="verification-title">Prove it’s safe<br/><span>to ship.</span></h2><p className={styles.body}>A proposed fix is a starting point. RepoPilot checks syntax, runs focused tests, and compares security findings in an isolated workspace—before you decide what ships.</p><FeatureList items={[{icon:'flask',text:'Validate behavior with focused tests'},{icon:'shield',text:'Compare security findings before and after'},{icon:'branch',text:'Check for regressions and unintended changes'},{icon:'check',text:'Keep the final decision in your hands'}]}/></Reveal>
    <Reveal className={styles.sectionVisual} delay={.1}><VerificationVisual/></Reveal>
   </div>
  </section>
  <section className={styles.finalSection} aria-labelledby="cta-title"><div className={styles.finalGlow}/><Reveal className={`${styles.container} ${styles.finalContent}`}><span className={styles.finalMark}><ProductMark size={30}/></span><p className={styles.eyebrow}>FROM CODE CHANGE TO CONFIDENCE</p><h2 id="cta-title">Better reviews.<br/><span>Evidence before you ship.</span></h2><p>Understand the context. Review the risks. Verify the fix.</p><div className={styles.actions}><Link className={styles.button} href="/app">Open RepoPilot<Icon name="arrow" size={16}/></Link><a className={`${styles.button} ${styles.secondary}`} href="https://github.com/Dahlia00/repopilot">Explore the code<Icon name="github" size={16}/></a></div></Reveal></section>
  <footer className={styles.footer}><div className={styles.container}><Link href="/" className={styles.brand}><ProductMark size={20}/>RepoPilot</Link><span>Code review. With evidence.</span><a href="https://github.com/Dahlia00/repopilot">Built in the open<Icon name="arrow" size={12}/></a></div></footer>
 </div>;
}
