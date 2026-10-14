import Link from 'next/link';
import ProductMark from '../shared/product-mark';
import styles from './public-entry.module.css';

export default function PublicEntry() {
  return (
    <div className={styles.entry}>
      <header className={styles.brand}>
        <ProductMark />
        <span>RepoPilot</span>
      </header>
      <main className={styles.content}>
        <h1>RepoPilot</h1>
        <p>Code review with evidence.</p>
        <Link className={styles.openApp} href="/app">Open RepoPilot</Link>
      </main>
    </div>
  );
}
