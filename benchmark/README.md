# Benchmark methodology

`cases/` contains intentionally vulnerable **scan-only data**. Do not import or execute these fixtures. The hardcoded password fixture is deliberately fake.

`dataset.json` is the ground truth: one expected issue per vulnerable case, exact labeled location/category, expected severity, and two negative cases. Location numbering includes each fixture's warning header. Intended behaviors are explained by the labels; these labels are supplied only to the scorer, never the AI reviewer or scanners.

Run from the project root with backend dependencies and optional Semgrep on PATH:

```sh
python benchmark/run_benchmark.py
python benchmark/run_benchmark.py --ai  # explicit real API usage, optional
```

The runner imports RepoPilot's actual bounded scanner and optional AI review services. It synthesizes an all-added patch and full-file snapshot without fetching or changing GitHub. AI receives code, not answers. Scanners inspect disposable copies; fixtures are not executed. Scanner names/versions/status and observations are recorded.

Scores match exact category and line within each case. Duplicate category/line observations collapse, regardless of source. One matching expected observation is a TP; additional locations/categories are FPs; absent expected observations are FNs. Unsupported languages and scanner failures stay in the recall denominator. Severity is recorded but not a match requirement. Confidence does not filter results.

Combined scores use the union of scanner observations plus AI only when explicitly enabled. They do not claim that the application's more conservative semantic deduplication is measured. Average latency includes service/tool startup and sequential case processing. AI mode overwrites output files; save static results before comparison. API failure aborts rather than inventing AI findings. Existing results remain until a complete successful run replaces them.

The dataset is small and handcrafted, not an independently audited representative sample. Precision/recall characterize this exact dataset and rule configuration. Review raw output alongside aggregate scores. Expanding rules or relabeling fixtures changes the task; comparisons must use the same dataset and versions.
