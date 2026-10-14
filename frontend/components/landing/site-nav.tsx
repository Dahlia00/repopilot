'use client';

import Link from 'next/link';
import {useState} from 'react';
import {motion, useMotionValueEvent, useScroll, useSpring} from 'motion/react';
import ProductMark from '../shared/product-mark';
import {Icon} from './icons';
import {ActionLink} from './primitives';
import styles from './landing.module.css';

export const repositoryUrl = 'https://github.com/Dahlia00/repopilot';

const links = [
  {href: '#how-it-works', label: 'How it works'},
  {href: '#verification', label: 'Verification'},
  {href: `${repositoryUrl}#safety-design`, label: 'Security'},
  {href: `${repositoryUrl}#readme`, label: 'Docs'},
];

export default function SiteNav() {
  const {scrollY, scrollYProgress} = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const progress = useSpring(scrollYProgress, {stiffness: 120, damping: 30});
  useMotionValueEvent(scrollY, 'change', value => setScrolled(value > 24));
  return (
    <header className={styles.nav} data-scrolled={scrolled || undefined}>
      <div className={styles.container}>
        <div className={styles.navBar}>
          <Link href="/" className={styles.brand} aria-label="RepoPilot home"><ProductMark size={24}/>RepoPilot</Link>
          <nav className={styles.links} aria-label="Main">
            {links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}
          </nav>
          <div className={styles.navActions}>
            <ActionLink href={repositoryUrl} variant="ghost" size="small"><Icon name="github" size={15}/>GitHub</ActionLink>
            <ActionLink href="/app" size="small">Open app<Icon name="arrow" size={14}/></ActionLink>
          </div>
          {scrolled && <motion.span className={styles.progress} style={{scaleX: progress}} aria-hidden="true"/>}
        </div>
      </div>
    </header>
  );
}
