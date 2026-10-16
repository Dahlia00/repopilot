'use client';

import Link from 'next/link';
import ProductMark from '../shared/product-mark';
import {Icon} from './icons';
import {ActionLink, Reveal, RevealItem, Starfield} from './primitives';
import {repositoryUrl} from './site-nav';
import PipelineRail from './pipeline-rail';
import styles from './landing.module.css';

export default function CtaSection() {
  return (
    <section className={`${styles.section} ${styles.cta}`} aria-labelledby="cta-title">
      <div className={styles.ctaGlow} aria-hidden="true"/>
      <Starfield count={46} seed={23} className={styles.ctaStars}/>
      <div className={styles.container}>
        <Reveal className={styles.ctaInner} amount={.4}>
          <RevealItem as="p" className={`${styles.eyebrow} ${styles.ctaEyebrow}`}>Ready when you are</RevealItem>
          <RevealItem>
            <h2 id="cta-title" className={styles.ctaTitle}>Merge with <span className={styles.gradientText}>confidence,</span><br/>every single time.</h2>
          </RevealItem>
          <RevealItem as="p" className={styles.ctaBody}>
            Point RepoPilot at a pull request. It maps the change, reviews it with full repository context,
            and proves every proposed fix before anything reaches main.
          </RevealItem>
          <RevealItem className={styles.ctaActions}>
            <ActionLink href="/app" size="large">Get started<Icon name="arrow" size={17}/></ActionLink>
            <ActionLink href={repositoryUrl} variant="ghost" size="large"><Icon name="github" size={17}/>Star on GitHub</ActionLink>
          </RevealItem>
          <RevealItem><PipelineRail/></RevealItem>
        </Reveal>
        <footer className={styles.footer}>
          <Link href="/" className={styles.brand}><ProductMark size={20}/>RepoPilot</Link>
          <nav aria-label="Footer">
            <Link href="/app">App</Link>
            <a href={`${repositoryUrl}#readme`}>Docs</a>
            <a href={`${repositoryUrl}#safety-design`}>Security</a>
            <a href={repositoryUrl}>GitHub</a>
          </nav>
          <span>AI-powered code review &amp; verification</span>
        </footer>
      </div>
    </section>
  );
}
