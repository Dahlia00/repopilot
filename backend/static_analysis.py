"""Bounded local scanners over disposable copies; never execute reviewed code."""

import asyncio
import importlib.util
import json
import os
import shutil
import signal
import sys
import tempfile
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from context import FileMetadata, RepositoryContext, exclusion_reason

MAX_SCAN_FILES = 20
MAX_SCAN_FILE_BYTES = 24_000
MAX_SCAN_TOTAL_BYTES = 80_000
SCAN_TIMEOUT_SECONDS = 15
MAX_OUTPUT_BYTES = 1_000_000
MAX_STDERR_BYTES = 64_000
MAX_STATIC_FINDINGS = 200
SUPPORTED_EXTENSIONS = {'.py', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'}
RULES_PATH = Path(__file__).with_name('semgrep-rules.yml').resolve()


class StaticFinding(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    source: Literal['bandit', 'semgrep']
    severity: Literal['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
    category: Literal['Security', 'Bug', 'Performance', 'Code Quality']
    file: str
    line: int | None = Field(ge=1)
    rule_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    explanation: str = Field(min_length=1)


class ScannerReport(BaseModel):
    source: Literal['bandit', 'semgrep']
    status: Literal['completed', 'partial', 'unavailable', 'skipped', 'error', 'timeout']
    message: str
    files: list[str]


class StaticResult(BaseModel):
    findings: list[StaticFinding]
    scanners: list[ScannerReport]
    skipped_files: list[FileMetadata]


def severity(value: str, source: str) -> str:
    mapping = {'LOW': 'LOW', 'MEDIUM': 'MEDIUM', 'HIGH': 'HIGH', 'CRITICAL': 'CRITICAL'}
    if source == 'semgrep':
        mapping.update({'INFO': 'LOW', 'WARNING': 'MEDIUM', 'ERROR': 'HIGH'})
    return mapping[value.upper()]


def location(path: str, line: int | None, root: Path, files: dict[str, str]) -> tuple[str, int | None]:
    original = files[str((root / path).resolve())]
    if line is not None and (type(line) is not int or not 1 <= line <= len((root / original).read_text(encoding='utf-8').splitlines())):
        raise ValueError('Invalid scanner line')
    return original, line


def normalize_bandit(data: dict, root: Path, files: dict[str, str]) -> list[StaticFinding]:
    if not isinstance(data.get('results'), list) or not isinstance(data.get('errors', []), list):
        raise ValueError('Invalid Bandit JSON')
    findings = []
    for item in data['results'][:MAX_STATIC_FINDINGS]:
        path, line = location(item['filename'], item.get('line_number'), root, files)
        findings.append(StaticFinding(
            source='bandit', severity=severity(item['issue_severity'], 'bandit'), category='Security',
            file=path, line=line, rule_id=item['test_id'],
            title=item['test_name'].replace('_', ' ').capitalize(), explanation=item['issue_text'],
        ))
    return findings


def normalize_semgrep(data: dict, root: Path, files: dict[str, str]) -> list[StaticFinding]:
    if not isinstance(data.get('results'), list) or not isinstance(data.get('errors', []), list):
        raise ValueError('Invalid Semgrep JSON')
    categories = {'security': 'Security', 'correctness': 'Bug', 'bug': 'Bug',
                  'performance': 'Performance', 'maintainability': 'Code Quality', 'code quality': 'Code Quality'}
    findings = []
    for item in data['results'][:MAX_STATIC_FINDINGS]:
        extra = item['extra']
        metadata = extra.get('metadata', {})
        path, line = location(item['path'], item.get('start', {}).get('line'), root, files)
        findings.append(StaticFinding(
            source='semgrep', severity=severity(extra['severity'], 'semgrep'),
            category=categories.get(str(metadata.get('category', '')).lower(), 'Code Quality'),
            file=path, line=line, rule_id=item['check_id'],
            title=metadata.get('title') or item['check_id'].replace('-', ' ').replace('_', ' ').capitalize(),
            explanation=extra['message'],
        ))
    return findings


def scanner_command(source: str) -> list[str] | None:
    if source == 'bandit':
        return [sys.executable, '-I', '-m', 'bandit'] if importlib.util.find_spec('bandit') else None
    executable = shutil.which('semgrep')
    return [executable, 'scan'] if executable else None


async def run_process(command: list[str], cwd: Path, env: dict[str, str]) -> tuple[int, bytes]:
    process = await asyncio.create_subprocess_exec(
        *command, cwd=str(cwd), env=env, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE, start_new_session=True,
    )

    async def read_limited(stream, maximum):
        chunks = bytearray()
        while chunk := await stream.read(8192):
            if len(chunks) + len(chunk) > maximum:
                raise ValueError('Scanner output exceeds limit')
            chunks.extend(chunk)
        return bytes(chunks)

    async def collect():
        stdout, _ = await asyncio.gather(read_limited(process.stdout, MAX_OUTPUT_BYTES),
                                         read_limited(process.stderr, MAX_STDERR_BYTES))
        code = await process.wait()
        return code, stdout

    task = asyncio.create_task(collect())
    try:
        return await asyncio.wait_for(task, timeout=SCAN_TIMEOUT_SECONDS)
    except BaseException:
        # Kill the scanner and its worker processes before removing temporary inputs.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        await process.wait()
        raise


async def run_scanner(source: str, paths: list[Path], root: Path, env: dict[str, str],
                      files: dict[str, str]) -> tuple[list[StaticFinding], ScannerReport]:
    originals = [files[str(path.resolve())] for path in paths]
    if not paths:
        return [], ScannerReport(source=source, status='skipped', message='No supported full changed files available.', files=[])
    command = scanner_command(source)
    if command is None:
        instruction = 'python -m pip install -r requirements.txt' if source == 'bandit' else 'pipx install semgrep'
        return [], ScannerReport(source=source, status='unavailable', message=f'Scanner not installed. Run {instruction}, ensure PATH is available to the backend, then restart.', files=[])
    if source == 'bandit':
        command += ['-f', 'json', '-q', '--ignore-nosec']
    else:
        command += ['--config', str(RULES_PATH), '--json', '--quiet', '--metrics=off',
                    '--disable-version-check', '--no-git-ignore', '--no-rewrite-rule-ids',
                    '--disable-nosem', '--no-autofix', '--jobs', '1', '--timeout', '5',
                    '--max-target-bytes', str(MAX_SCAN_FILE_BYTES)]
    command += [str(path) for path in paths]
    try:
        code, output = await run_process(command, root, env)
        if code not in {0, 1}:
            return [], ScannerReport(source=source, status='error', message=f'Scanner failed with exit code {code}. Check local installation/configuration.', files=originals)
        data = json.loads(output)
        if not isinstance(data, dict):
            raise ValueError('Expected JSON object')
        normalized = normalize_bandit(data, root, files) if source == 'bandit' else normalize_semgrep(data, root, files)
        partial = bool(data.get('errors')) or len(data['results']) > MAX_STATIC_FINDINGS
        message = 'Scan completed.' if not partial else 'Partial scan: tool reported errors or the 200-finding limit was reached.'
        return normalized, ScannerReport(source=source, status='partial' if partial else 'completed', message=message, files=originals)
    except asyncio.TimeoutError:
        return [], ScannerReport(source=source, status='timeout', message=f'Scanner exceeded {SCAN_TIMEOUT_SECONDS} seconds; its processes were stopped.', files=originals)
    except OSError:
        return [], ScannerReport(source=source, status='error', message='Scanner could not be executed. Check local installation and permissions.', files=originals)
    except (ValueError, KeyError, TypeError, AttributeError):
        return [], ScannerReport(source=source, status='error', message='Scanner returned malformed or over-limit output; results were not accepted.', files=originals)


async def run_static_analysis(repository: RepositoryContext) -> StaticResult:
    findings = []
    reports = []
    skipped = []
    with tempfile.TemporaryDirectory(prefix='repopilot-scan-') as directory:
        work = Path(directory)
        root = work / 'targets'
        root.mkdir()
        home = work / 'home'
        home.mkdir()
        # Scanner subprocesses do not inherit API keys, tokens, or repo configuration.
        env = {'PATH': os.environ.get('PATH', os.defpath), 'HOME': str(home), 'TMPDIR': str(work),
               'LANG': 'en_US.UTF-8', 'SEMGREP_SEND_METRICS': 'off', 'SEMGREP_ENABLE_VERSION_CHECK': '0'}
        files: dict[str, str] = {}
        targets: list[Path] = []
        total_bytes = 0
        for file in repository.changed_files:
            reason = file.skip_reason or exclusion_reason(file.path)
            if Path(file.path).suffix.lower() not in SUPPORTED_EXTENSIONS:
                reason = reason or 'Unsupported static-analysis file type'
            if file.content is None:
                reason = reason or 'Full changed-file content unavailable'
            if reason is None:
                size = len(file.content.encode('utf-8'))
                if size > MAX_SCAN_FILE_BYTES:
                    reason = 'Static scan file size limit reached'
                elif len(targets) >= MAX_SCAN_FILES or total_bytes + size > MAX_SCAN_TOTAL_BYTES:
                    reason = 'Static scan file count or total size limit reached'
                elif any(ord(char) < 32 and char not in '\n\r\t' for char in file.content):
                    reason = 'Binary content'
            if reason:
                skipped.append(FileMetadata(path=file.path, reason=reason))
                continue
            target = root / file.path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(file.content, encoding='utf-8')
            targets.append(target)
            files[str(target.resolve())] = file.path
            total_bytes += size
        for source in ['bandit', 'semgrep']:
            selected = [path for path in targets if source == 'semgrep' or path.suffix.lower() == '.py']
            found, report = await run_scanner(source, selected, root, env, files)
            findings.extend(found)
            reports.append(report)
    return StaticResult(findings=findings, scanners=reports, skipped_files=skipped)
