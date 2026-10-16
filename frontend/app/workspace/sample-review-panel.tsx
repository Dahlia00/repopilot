import type {CSSProperties} from 'react';
export default function SampleReviewPanel() {
  return <section className="sample-review" aria-labelledby="sample-heading">
    <div className="section-heading"><h2 id="sample-heading">Sample review</h2><span className="tag">Example</span></div>
    <div className="sample-card">
      <div className="sample-file-row"><span className="mono truncate">example/app · sample.py</span><span className="muted small">PR patch</span></div>
      <div className="sample-diff">
        <div className="diff-row removed" style={{'--line-delay':'0ms'} as CSSProperties}><span className="line-number">41</span><span className="line-number"></span><code>    return items[index]</code></div>
        <div className="diff-row added" style={{'--line-delay':'40ms'} as CSSProperties}><span className="line-number"></span><span className="line-number">41</span><code>    if not 0 &lt;= index &lt; len(items):</code></div>
        <div className="diff-row added" style={{'--line-delay':'80ms'} as CSSProperties}><span className="line-number"></span><span className="line-number">42</span><code>        raise IndexError(f&quot;index {'{'}index{'}'} out of range&quot;)</code></div>
        <div className="diff-row added" style={{'--line-delay':'120ms'} as CSSProperties}><span className="line-number"></span><span className="line-number">43</span><code>    return items[index]</code></div>
      </div>
      <ol className="sample-thread">
        <li className="sample-entry">
          <span className="sample-avatar" aria-hidden="true">●</span>
          <div><div className="sample-entry-head"><strong>repopilot</strong><span className="tag small">bot</span><span className="severity medium">Medium</span></div>
            <h3>Unchecked indexing can fail for empty input</h3>
            <p>Reading <code className="mono">items[index]</code> without a bounds check raises on empty sequences.</p></div>
        </li>
        <li className="sample-entry">
          <span className="sample-avatar" aria-hidden="true">◆</span>
          <div><div className="sample-entry-head"><strong>repopilot</strong><span className="tag small">fix proposal</span></div>
            <h3>Proposed fix</h3>
            <p>Add a guard consistent with the documented contract.</p></div>
        </li>
        <li className="sample-entry">
          <span className="sample-avatar verified" aria-hidden="true">✓</span>
          <div><div className="sample-entry-head"><strong>repopilot</strong><span className="tag small">verification</span><span className="verification-badge verified">Verified</span></div>
            <p>Failing-before / passing-after tests and scanner regressions checked.</p></div>
        </li>
      </ol>
    </div>
    <p className="muted small">Illustrative example only. No review or verification has run.</p>
  </section>;
}
