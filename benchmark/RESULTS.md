# Measured benchmark results

Run: 2026-10-13T19:17:54.507541+00:00 · 12 cases · static

Issue-level exact category/line matching; duplicates collapse by category/line; unsupported cases count as misses. Severity is recorded, not used for matching. This small synthetic dataset is not evidence of general real-world accuracy.

| Source | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|
| Bandit | 3 | 1 | 7 | 0.750 | 0.300 | 0.429 |
| Semgrep | 2 | 0 | 8 | 1.000 | 0.200 | 0.333 |
| combined | 4 | 1 | 6 | 0.800 | 0.400 | 0.533 |
| AI | Not run | — | — | — | — | — |

Average case latency: 1.061s.

Scanner availability and raw observations are recorded per case in [results.json](results.json).
Latency includes scanner startup; runs depend on installed versions and platform.
Fixtures are scan-only data and are never imported or executed.
