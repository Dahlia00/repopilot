'use client';

import {MotionConfig} from 'motion/react';
import ContextGraph from './context-graph';
import CtaSection from './cta-section';
import FeatureSection from './feature-section';
import HeroSection from './hero-section';
import SiteNav from './site-nav';
import {Story} from './story';
import VerificationStage from './verification-stage';
import styles from './landing.module.css';

export default function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.page}>
        <a href="#main" className={styles.skip}>Skip to content</a>
        <SiteNav/>
        <main id="main">
          <Story hero={<HeroSection/>}>
            <FeatureSection
              anchor="how-it-works"
              className={styles.context}
              id="context-title"
              eyebrow="Repository context"
              title="Understand the change."
              accent="See the full picture."
              body="RepoPilot connects changed files with related code, dependencies, and services so every review has the context it needs."
              features={[
                {icon: 'graph', label: 'Map changes across your entire repository'},
                {icon: 'link', label: 'Understand dependencies and impact'},
                {icon: 'radar', label: 'Surface related code, tests, and services'},
              ]}
              visual={<ContextGraph/>}
            />
            <FeatureSection
              anchor="verification"
              className={styles.verification}
              id="verification-title"
              eyebrow="Verification & confidence"
              title="Prove it’s safe"
              accent="to ship."
              body="RepoPilot runs tests, security checks, and regression analysis to verify proposed fixes before they reach production."
              features={[
                {icon: 'flask', label: 'Run and analyze test results'},
                {icon: 'shield', label: 'Detect security issues and vulnerabilities'},
                {icon: 'regression', label: 'Catch regressions before they ship'},
                {icon: 'message', label: 'Get clear, actionable feedback'},
              ]}
              visual={<VerificationStage/>}
            />
          </Story>
          <CtaSection/>
        </main>
      </div>
    </MotionConfig>
  );
}
