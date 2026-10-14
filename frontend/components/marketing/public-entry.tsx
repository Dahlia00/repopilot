import ProductMark from '../shared/product-mark';
import {ButtonLink, CodeSurface, MonoLabel, PanelHeader, SectionEyebrow, StatusChip} from '../ui/primitives';
import styles from './public-entry.module.css';

export default function PublicEntry() {
  return (
    <div className={`ds-theme-light ds-bg-editorial ${styles.entry}`}>
      <div className="ds-container">
        <header className={styles.brand}><ProductMark size={24} /><span>RepoPilot</span></header>
        <main className={`ds-grid ${styles.preview}`}>
          <div className={styles.copy}>
            <SectionEyebrow>CODE REVIEW + VERIFICATION</SectionEyebrow>
            <h1 className="ds-display ds-signature-text">RepoPilot</h1>
            <p className="ds-body-large ds-muted">Review code. Verify fixes. Ship with confidence.</p>
            <div className={styles.actions}>
              <ButtonLink href="/app">Open RepoPilot<span aria-hidden="true">↗</span></ButtonLink>
              <ButtonLink href="https://github.com/Dahlia00/repopilot" variant="secondary">View on GitHub</ButtonLink>
            </div>
          </div>
          <div className={`ds-theme-dark ${styles.technical}`}>
            <CodeSurface className={styles.codePreview} aria-label="Design-system code example">
              <PanelHeader title="Review input" metadata={<StatusChip>Preview only</StatusChip>} />
              <pre><code><span className={styles.keyword}>const</span> repository = <span className={styles.string}>{'"owner/repository"'}</span>;</code></pre>
            </CodeSurface>
            <MonoLabel className={styles.caption}>Design-system preview · illustrative code only</MonoLabel>
          </div>
        </main>
      </div>
    </div>
  );
}
