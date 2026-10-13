# RepoPilot engineering portfolio

## Problem and implementation

RepoPilot separates AI code-review suggestions from evidence that a change is correct. It retrieves immutable GitHub PR snapshots, selects bounded context, combines specialist AI observations with traditional scanners, and builds contract-driven test/fix proposals. Verification consumes supplied artifacts without OpenAI.

## Verified engineering decisions

- Kept GitHub retrieval, context, review, scanners, contracts, generation, verification, orchestration, API schemas, configuration and previews in separate modules.
- Grounded desired behavior in quoted repository evidence; ambiguous contracts cannot earn automatic approval.
- Preserved generated regression tests rather than rewriting expectations to accommodate a fix.
- Required fail-before/pass-after tests and before/after scans; syntax alone is insufficient.
- Used bounded temporary workspaces, explicit AST restrictions, sanitized subprocess environments, timeouts and macOS OS-sandbox enforcement. Linux verification fails closed.
- Preserved source provenance and complementary observations while conservatively deduplicating known duplicates.
- Kept GitHub writes behind two independent gates; preview endpoints never write.

## Measured validation

192 backend tests passed with zero skips in the local macOS run. This includes real sandboxed pytest execution and deterministic synthetic verification; external AI/GitHub write calls are mocked. Frontend lint, TypeScript checks and production build passed.

Benchmark run: 2026-10-13T19:17:54.507541+00:00 · 12 scan-only synthetic cases · static

| Source | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|
| Bandit | 3 | 1 | 7 | 0.750 | 0.300 | 0.429 |
| Semgrep | 2 | 0 | 8 | 1.000 | 0.200 | 0.333 |
| combined | 4 | 1 | 6 | 0.800 | 0.400 | 0.533 |
| AI | Not run | — | — | — | — | — |

Average measured case latency: 1.061s, including scanner startup. Versions: Bandit 1.9.4, Semgrep 1.180.0.

Scores use exact category/line matches; unsupported/error cases count as misses. This handcrafted dataset does not establish real-world accuracy. See [benchmark methodology](benchmark/README.md) and [raw outputs](benchmark/results.json). AI was not run; no AI accuracy claim is supported.

Final live read-only GitHub check retrieved Dahlia00/repopilot PR #1, its full changed Python file and README context. Bandit and Semgrep completed; one static finding was returned. No OpenAI call or GitHub write occurred. A subsequent live `/review` check against the configured backend returned HTTP 200: two AI findings (SQL injection and unsafe empty-list indexing), one static finding, and two combined unique issues. Both scanners completed. This live check used OpenAI but performed no GitHub writes; it is separate from the static-only benchmark.

## Packaging and CI validation

Both Docker images built successfully. The read-only Compose demo reached healthy status for backend and frontend on alternate localhost ports, with non-root users (UID 10001 and 1001). Health endpoints and the disabled write flag were checked. Linux containers retain fail-closed execution verification.

The GitHub Actions workflow passed pinned actionlint validation. Local Bandit and local-rule Semgrep checks of the backend returned no configured blocking findings. Hosted CI has not been run as part of this milestone; the workflow is ready for a future push.

## Technologies

Python, FastAPI, Pydantic, httpx, official OpenAI SDK, pytest, Bandit, Semgrep, Next.js App Router, TypeScript, React, Docker Compose, GitHub Actions.

## Interview talking points

- Why a test that merely reproduces buggy behavior cannot establish correctness of a behavioral change.
- Why direct deterministic verification should not regenerate AI artifacts or depend on an API key.
- How fail-closed sandbox support trades functionality for a clear execution boundary.
- How scanner coverage differs from AI observations, and why provenance and honest benchmark misses matter.
- Why ephemeral artifact IDs, immutable head SHAs and stale checks matter before any proposed GitHub action.

## Suggested resume bullets

- Built a repository-aware GitHub PR review platform integrating structured AI analysis, Bandit/Semgrep, contract-driven regression tests, local fix proposals and deterministic sandboxed verification.
- Implemented evidence-grounded behavioral contracts and fail-before/pass-after verification with explicit AST restrictions, bounded temporary workspaces and default read-only GitHub controls.
- Validated the pipeline with 192 passing backend tests plus frontend lint, type checks and production build; added read-only GitHub Actions CI.
- Created a reproducible 12-case synthetic static-analysis benchmark measuring 0.800 precision, 0.400 recall and 0.533 F1 for combined scanner outputs, explicitly recording 1 false positive and 6 misses.

## Limits to communicate

Local portfolio demonstrator: no public deployment/authentication/durable job store. Execution isolation is macOS-only; containers do not execute generated tests. AI findings are nondeterministic. Scanner rules and synthetic benchmark coverage are intentionally limited. Real GitHub write operations were not exercised.
