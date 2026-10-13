"""Scan labeled data without executing it. AI is an explicit optional paid mode."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import platform
import sys
import time
from datetime import datetime, timezone
from importlib.metadata import version, PackageNotFoundError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from context import FullChangedFile, RepositoryContext
from static_analysis import run_static_analysis


def score(cases, outputs):
    """Issue-level matching: same case/category/exact line, severity reported separately.

    Each fixture has at most one labeled issue. Duplicate observations at the same
    category/location collapse; extra locations/categories are false positives.
    Missing locations cannot substantiate a true positive. Unsupported cases remain
    in the denominator, so coverage gaps cannot inflate recall.
    """
    tp = fp = fn = 0
    for case in cases:
        observations = {(f['category'], f.get('line')) for f in outputs.get(case['case_id'], [])}
        expected = (case['category'], case['expected_location']['line']) if case['expected_issue'] else None
        match = expected is not None and expected in observations
        tp += int(match)
        fn += int(case['expected_issue'] and not match)
        fp += len(observations) - int(match)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return dict(true_positives=tp, false_positives=fp, false_negatives=fn,
                precision=precision, recall=recall,
                f1=2*precision*recall/(precision+recall) if precision+recall else 0.0)


def package_version(name):
    try:
        return version(name)
    except PackageNotFoundError:
        return 'not installed in runner environment'


async def run(ai_enabled=False):
    cases = json.loads((ROOT/'benchmark/dataset.json').read_text())
    sources = {'Bandit': {}, 'Semgrep': {}, 'combined': {}}
    if ai_enabled:
        if not os.environ.get('OPENAI_API_KEY', '').strip():
            raise ValueError('--ai requires OPENAI_API_KEY; no mock fallback is available.')
        from review import get_openai_client, review_patches
        from github import PullRequestResponse, ChangedFile
        sources['AI'] = {}
    details = []
    start = time.perf_counter()
    for case in cases:
        path = case['file']
        content = (ROOT/path).read_text()
        lines = content.splitlines()
        patch = f'@@ -0,0 +1,{len(lines)} @@\n'+'\n'.join('+'+line for line in lines)
        snapshot = RepositoryContext(repository='benchmark/local',commit='a'*40,
            changed_files=[FullChangedFile(path=path,status='added',patch=patch,content=content)],
            context_files=[],warnings=[])
        before = time.perf_counter()
        static = await run_static_analysis(snapshot)
        static_latency = time.perf_counter()-before
        ai_findings = []
        ai_latency = None
        if ai_enabled:
            pr = PullRequestResponse(repository='benchmark/local',pull_request=1,title='Synthetic benchmark',
                state='open',author='benchmark',base_branch='main',head_branch='fixture',head_sha='a'*40,
                head_repository='benchmark/local',changed_files=1,additions=len(lines),deletions=0,
                files=[ChangedFile(filename=path,status='added',additions=len(lines),deletions=0,patch=patch)],
                files_truncated=False)
            before = time.perf_counter()
            async for client in get_openai_client():
                review = await review_patches(pr,client,snapshot)
                ai_findings = [f.model_dump(mode='json') for f in review.findings]
            ai_latency = time.perf_counter()-before
            sources['AI'][case['case_id']] = ai_findings
        findings = [f.model_dump(mode='json') for f in static.findings]
        sources['Bandit'][case['case_id']] = [f for f in findings if f['source']=='bandit']
        sources['Semgrep'][case['case_id']] = [f for f in findings if f['source']=='semgrep']
        sources['combined'][case['case_id']] = findings + ai_findings
        details.append(dict(case_id=case['case_id'],static_latency_seconds=static_latency,
            ai_latency_seconds=ai_latency,scanners=[s.model_dump() for s in static.scanners],
            findings=findings,ai_findings=ai_findings))
    result = dict(generated_at=datetime.now(timezone.utc).isoformat(),total_cases=len(cases),
        mode='static+AI' if ai_enabled else 'static',python=platform.python_version(),
        versions={n:package_version(n) for n in ('bandit','semgrep','openai')},
        ai_status='completed' if ai_enabled else 'not_run',
        methodology='Issue-level exact category/line matching; duplicates collapse by category/line; '
            'unsupported cases count as misses. Severity is recorded, not used for matching. '
            'This small synthetic dataset is not evidence of general real-world accuracy.',
        metrics={source:score(cases,outputs) for source,outputs in sources.items()},
        average_analysis_latency_seconds=(time.perf_counter()-start)/len(cases),
        findings_per_case={k:len(v) for k,v in sources['combined'].items()},cases=details)
    result['metrics']['AI'] = result['metrics'].get('AI')
    (ROOT/'benchmark/results.json').write_text(json.dumps(result,indent=2)+'\n')
    rows=['# Measured benchmark results','',f"Run: {result['generated_at']} · {len(cases)} cases · {result['mode']}",
        '',result['methodology'],'','| Source | TP | FP | FN | Precision | Recall | F1 |',
        '|---|---:|---:|---:|---:|---:|---:|']
    for source,m in result['metrics'].items():
        if m is None:
            rows.append(f'| {source} | Not run | — | — | — | — | — |')
        else:
            rows.append(f"| {source} | {m['true_positives']} | {m['false_positives']} | {m['false_negatives']} | {m['precision']:.3f} | {m['recall']:.3f} | {m['f1']:.3f} |")
    rows += ['',f"Average case latency: {result['average_analysis_latency_seconds']:.3f}s.",
        '', 'Scanner availability and raw observations are recorded per case in [results.json](results.json).',
        'Latency includes scanner startup; runs depend on installed versions and platform.',
        'Fixtures are scan-only data and are never imported or executed.']
    (ROOT/'benchmark/RESULTS.md').write_text('\n'.join(rows)+'\n')
    print(json.dumps({k:result[k] for k in ('total_cases','mode','metrics','average_analysis_latency_seconds')},indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ai',action='store_true',help='Opt in to real paid OpenAI analysis; requires environment key.')
    args=parser.parse_args()
    asyncio.run(run(args.ai))
