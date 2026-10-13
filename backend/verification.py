"""Fail-closed verification of restricted Python proposals in disposable workspaces."""
import ast
import asyncio
from collections import Counter
import difflib
import importlib.util
import json
import keyword
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import sys
import tempfile
from typing import Literal

from pydantic import BaseModel, Field
from context import RepositoryContext, FullChangedFile
from contracts import Compatibility, compatibility
from fix_generation import FixGenerationResponse, ValidatedFix, validate_fix, target_function, call_name
from static_analysis import run_static_analysis, StaticResult, StaticFinding
from test_generation import TestGenerationResponse, validate_code, PURE_CALLS, EXCEPTIONS, DANGEROUS_NAMES

MAX_FIXES = 5
MAX_FILES = 32
MAX_FILE_BYTES = 24000
MAX_TESTS = 5
TEST_TIMEOUT = 10
MAX_OUTPUT = 32000
MAX_WORKSPACE_BYTES = 256000


class Check(BaseModel):
    status: Literal['PASSED', 'FAILED', 'SKIPPED'] = 'SKIPPED'
    message: str = 'Not run.'
    exit_code: int | None = None
    collected: int = 0
    passed: int = 0
    failed: int = 0
    errors: int = 0
    stdout: str = ''
    stderr: str = ''
    findings: list[StaticFinding] = Field(default_factory=list)


class SafetyViolation(BaseModel):
    phase: str = 'source'
    rule: str
    node: str
    line: int | None = None
    call: str | None = None
    message: str


class VerificationResult(BaseModel):
    finding_id: str
    file: str
    title: str
    proposal: ValidatedFix | None = None
    status: Literal['PASSED', 'FAILED', 'SKIPPED'] = 'SKIPPED'
    safety_violations: list[SafetyViolation] = Field(default_factory=list)
    syntax_check: Check = Field(default_factory=Check)
    generated_test: Check = Field(default_factory=Check)
    bandit_before: Check = Field(default_factory=Check)
    bandit_after: Check = Field(default_factory=Check)
    semgrep_before: Check = Field(default_factory=Check)
    semgrep_after: Check = Field(default_factory=Check)
    regression_tests: Check = Field(default_factory=Check)
    verification_summary: str = 'Not verified.'
    safe_to_apply: bool = False
    compatibility: Compatibility = Field(default_factory=Compatibility)


class VerificationResponse(BaseModel):
    repository: str
    pull_request: int
    head_sha: str
    results: list[VerificationResult]
    fixes_verified: int
    passed: int
    failed: int
    skipped: int


# This runner is trusted application code, not a model-supplied command/script.
RUNNER = '''import json, os, resource, sys
from pathlib import Path
resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
resource.setrlimit(resource.RLIMIT_FSIZE, (262144, 262144))
resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
import pytest
root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / 'target'))
class Results:
    def __init__(self):
        self.data = {'collected': 0, 'passed': 0, 'failed': 0, 'errors': 0}
    def pytest_runtest_logreport(self, report):
        if report.when == 'call':
            if report.passed: self.data['passed'] += 1
            elif report.failed: self.data['failed'] += 1
        elif report.failed: self.data['errors'] += 1
    def pytest_collectreport(self, report):
        if report.failed: self.data['errors'] += 1
    def pytest_sessionfinish(self, session, exitstatus):
        self.data['collected'] = session.testscollected
plugin = Results()
code = pytest.main(['-q', '--tb=short', '--assert=plain', '--disable-plugin-autoload',
    '-p', 'no:cacheprovider', '--noconftest', '--confcutdir', str(root),
    '-c', str(root / 'pytest.ini'), '--rootdir', str(root), str(root / 'tests')], plugins=[plugin])
(root / 'report.json').write_text(json.dumps(plugin.data), encoding='utf-8')
sys.exit(int(code))
'''
PROBE = '''import os, socket
from pathlib import Path
try:
    open('/etc/hosts').read()
    raise SystemExit(2)
except PermissionError: pass
try:
    socket.socket().connect(('127.0.0.1', 9))
    raise SystemExit(3)
except PermissionError: pass
try:
    Path(__file__).resolve().parent.parent.joinpath('denied-write-probe').write_text('blocked')
    raise SystemExit(4)
except PermissionError: pass
print('isolation-confirmed')
'''


def sandbox_command(root: Path, runner: Path) -> list[str] | None:
    executable = '/usr/bin/sandbox-exec'
    if sys.platform != 'darwin' or not Path(executable).is_file():
        return None
    quote = lambda p: json.dumps(str(Path(p).resolve()))
    # macOS's framework launcher needs system runtime reads and its own spawn.
    # Deny user data reads except the trusted venv and this temporary workspace.
    profile = '(version 1) (deny default) (allow file-read*) (allow sysctl-read) (allow mach-lookup) '
    profile += '(deny file-read-data (require-all (subpath "/Users") '
    profile += f'(require-not (subpath {quote(sys.prefix)})) (require-not (subpath {quote(root)})))) '
    profile += '(deny file-read-data (literal "/etc/hosts") (literal "/private/etc/hosts") (subpath "/Library/Keychains")) '
    profile += f'(allow file-write* (subpath {quote(root)})) (allow file-write-data (literal "/dev/null")) '
    profile += '(allow file-write-data (require-not (subpath "/"))) '
    profile += f'(allow process-exec (literal {quote(sys.executable)}) (subpath {quote(sys.base_prefix)})) (allow process-fork) '
    return [executable, '-p', profile, sys.executable, '-I', '-B', str(runner)]


def clean_environment(root: Path) -> dict[str, str]:
    return {'PATH': os.defpath, 'HOME': str(root / 'home'), 'TMPDIR': str(root),
            'LANG': 'en_US.UTF-8', 'PYTEST_DISABLE_PLUGIN_AUTOLOAD': '1',
            'PYTHONDONTWRITEBYTECODE': '1'}


async def bounded_process(command: list[str], root: Path):
    process = await asyncio.create_subprocess_exec(*command, cwd=root, env=clean_environment(root),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, start_new_session=True)
    async def read(stream):
        output = bytearray()
        while chunk := await stream.read(4096):
            output.extend(chunk)
            if len(output) > MAX_OUTPUT:
                raise ValueError('Execution output exceeds limit.')
        return output.decode('utf-8', errors='replace').replace(str(root), '<temporary-workspace>')
    async def collect():
        out, err = await asyncio.gather(read(process.stdout), read(process.stderr))
        return await process.wait(), out, err
    task = asyncio.create_task(collect())
    try:
        return await asyncio.wait_for(task, TEST_TIMEOUT)
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        await process.wait()
        raise


async def execute_tests(root: Path) -> Check:
    if importlib.util.find_spec('pytest') is None:
        return Check(message='pytest is not installed; install backend requirements.')
    (root / 'home').mkdir(exist_ok=True)
    probe = root / 'probe.py'
    probe.write_text(PROBE, encoding='utf-8')
    command = sandbox_command(root, probe)
    if command is None:
        return Check(message='No supported OS execution sandbox. Python execution is disabled on this platform.')
    try:
        code, out, _ = await bounded_process(command, root)
        if code != 0 or 'isolation-confirmed' not in out:
            return Check(message='OS sandbox isolation probe failed; no generated code was executed.')
        runner = root / 'runner.py'
        runner.write_text(RUNNER, encoding='utf-8')
        command = sandbox_command(root, runner)
        code, out, err = await bounded_process(command, root)
        report_path = root / 'report.json'
        if not report_path.is_file() or report_path.stat().st_size > 1000:
            return Check(status='FAILED', message='pytest failed to produce a bounded trusted report.', exit_code=code, stdout=out, stderr=err)
        data = json.loads(report_path.read_text(encoding='utf-8'))
        if set(data) != {'collected', 'passed', 'failed', 'errors'} or any(type(v) is not int or not 0 <= v <= MAX_TESTS for v in data.values()):
            raise ValueError('Invalid pytest report.')
        passed = code == 0 and data['collected'] > 0 and data['passed'] == data['collected'] and not data['errors']
        return Check(status='PASSED' if passed else 'FAILED', message='Restricted generated tests passed.' if passed else 'Generated tests failed or did not complete successfully.',
                     exit_code=code, stdout=out, stderr=err, **data)
    except asyncio.TimeoutError:
        return Check(status='FAILED', message=f'Execution exceeded {TEST_TIMEOUT} seconds; process group stopped.')
    except (OSError, ValueError, TypeError):
        return Check(status='FAILED', message='Execution failed or produced malformed/over-limit output.')


def module_path(file: str) -> str | None:
    path = PurePosixPath(file)
    if path.is_absolute() or '..' in path.parts or path.suffix != '.py' or len(path.parts) > 5:
        return None
    names = list(path.with_suffix('').parts)
    if names[-1] == '__init__':
        return None
    reserved = set(sys.stdlib_module_names) | {'pytest', '_pytest', 'tests', 'runner', 'probe', 'conftest', 'sitecustomize'}
    if not names or names[0] in reserved or not all(n.isidentifier() and not keyword.iskeyword(n) and not n.startswith('__') for n in names):
        return None
    return '.'.join(names)


# Explicit verification policy, independent of generation eligibility. IfExp only
# selects between checked expressions; it does not grant additional calls/access.
EXECUTION_NODES = (
    ast.Module, ast.FunctionDef, ast.arguments, ast.arg, ast.Return, ast.Assign,
    ast.AnnAssign, ast.Expr, ast.Constant, ast.Name, ast.Load, ast.Store,
    ast.List, ast.Tuple, ast.Dict, ast.Set, ast.Subscript, ast.Slice,
    ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.If, ast.IfExp, ast.Pass,
    ast.Raise, ast.Call, ast.keyword, ast.operator, ast.unaryop, ast.boolop, ast.cmpop,
)


def execution_source_violations(content: str, function: str, phase='source') -> list[SafetyViolation]:
    violations = []
    def reject(node, rule, message, call=None):
        if len(violations) < 16:
            violations.append(SafetyViolation(phase=phase, rule=rule, node=type(node).__name__,
                line=getattr(node, 'lineno', None), call=call, message=message))
    try:
        tree = ast.parse(content)
    except (SyntaxError, ValueError, RecursionError):
        return [SafetyViolation(phase=phase, rule='python_syntax', node='SyntaxError', message='Source is not valid Python.')]
    nodes = list(ast.walk(tree))
    if len(nodes) > 1500:
        reject(tree, 'ast_size', 'Source exceeds 1,500 AST nodes.')
        return violations
    functions = [n for n in tree.body if isinstance(n, ast.FunctionDef)]
    if not any(n.name == function for n in functions):
        reject(tree, 'target_function', 'Target function is absent.')
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef) and not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)):
            reject(node, 'module_side_effect', 'Only function definitions and docstrings are permitted at module level.')
    for node in nodes:
        if isinstance(node, ast.Call):
            name = call_name(node.func) or '<indirect>'
            if not isinstance(node.func, ast.Name) or node.func.id not in PURE_CALLS | EXCEPTIONS:
                reject(node, 'call_allowlist', 'Only explicit safe builtins and builtin exceptions may be called.', name)
        if not isinstance(node, EXECUTION_NODES):
            rule = 'no_imports' if isinstance(node, (ast.Import, ast.ImportFrom)) else 'no_attributes' if isinstance(node, ast.Attribute) else 'ast_allowlist'
            reject(node, rule, f'{type(node).__name__} is not permitted by the execution AST allowlist.', call_name(node) if isinstance(node, ast.Attribute) else None)
        if isinstance(node, ast.Name) and (node.id.startswith('__') or node.id in DANGEROUS_NAMES):
            reject(node, 'reserved_name', 'Dangerous/dunder names are not executable.', node.id)
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store) and node.id in PURE_CALLS | EXCEPTIONS:
            reject(node, 'builtin_rebinding', 'Rebinding trusted builtins is not executable.', node.id)
        if isinstance(node, ast.FunctionDef):
            if node not in functions:
                reject(node, 'no_nested_functions', 'Nested function definitions are not executable.')
            if node.name in PURE_CALLS | EXCEPTIONS | DANGEROUS_NAMES or node.name.startswith('__'):
                reject(node, 'builtin_rebinding', 'Functions may not shadow trusted builtins.', node.name)
            if node.decorator_list:
                reject(node, 'no_decorators', 'Decorators may execute code at import time.')
            if node.args.defaults or any(node.args.kw_defaults):
                reject(node, 'no_defaults', 'Default expressions are outside supported execution.')
            if node.returns is not None:
                reject(node, 'no_annotations', 'Annotations may execute code at import time.')
        if isinstance(node, ast.arg) and node.annotation is not None:
            reject(node, 'no_annotations', 'Argument annotations may execute code at import time.')
        if isinstance(node, ast.AnnAssign):
            reject(node, 'no_annotations', 'Assignment annotations are outside supported execution.')
        errors = computation_errors(node, descend=False)
        if errors:
            reject(node, 'computation_budget', errors[0], call_name(node.func) if isinstance(node, ast.Call) else None)
    return violations


def describe_violation(item: SafetyViolation) -> str:
    location = f' at line {item.line}' if item.line is not None else ''
    call = f' (call/name {item.call})' if item.call else ''
    return f'{item.phase}: {item.rule} rejected {item.node}{location}{call}: {item.message}'


def execution_source_errors(content: str, function: str) -> list[str]:
    return [describe_violation(item) for item in execution_source_violations(content, function)]


def computation_errors(tree: ast.AST, descend=True) -> list[str]:
    """Reject obvious allocation bombs where macOS lacks portable memory limits."""
    for node in ast.walk(tree) if descend else [tree]:
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and abs(node.value) > 10000:
            return ['Large numeric literals are outside the restricted execution budget.']
        if isinstance(node, ast.BinOp):
            if isinstance(node.op, (ast.Mult, ast.Pow, ast.Mod, ast.LShift, ast.RShift)):
                return ['Multiplication, exponentiation, percent formatting and shifts are not supported for execution.']
            if isinstance(node.op, ast.Add) and not isinstance(node.left, ast.Constant) and not isinstance(node.right, ast.Constant):
                return ['Potentially expanding concatenation is not supported for execution.']
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'range':
            return ['Computed ranges are not supported for execution.']
    return []


def scan_check(static: StaticResult, source: str) -> Check:
    report = next((r for r in static.scanners if r.source == source), None)
    if report is None:
        return Check(message='Scanner report missing.')
    status = 'PASSED' if report.status == 'completed' else 'SKIPPED' if report.status in {'unavailable','skipped'} else 'FAILED'
    return Check(status=status, message=report.message, findings=[f for f in static.findings if f.source == source])


def severe_regression(before: Check, after: Check, original: str | None = None, updated: str | None = None) -> bool:
    if original is not None and updated is not None:
        lines = {}
        for block in difflib.SequenceMatcher(a=original.splitlines(), b=updated.splitlines(), autojunk=False).get_matching_blocks():
            for offset in range(block.size):
                lines[block.a + offset + 1] = block.b + offset + 1
        old = Counter((f.rule_id, f.severity, lines[f.line]) for f in before.findings
                      if f.severity in {'HIGH', 'CRITICAL'} and f.line in lines)
        new = Counter((f.rule_id, f.severity, f.line) for f in after.findings if f.severity in {'HIGH', 'CRITICAL'})
        return bool(new - old)
    def counts(check):
        return Counter((f.rule_id, f.severity) for f in check.findings if f.severity in {'HIGH', 'CRITICAL'})
    return bool(counts(after) - counts(before))


from observability import stage

@stage('verification')
async def verify_one(fix: ValidatedFix, repository: RepositoryContext, tests: TestGenerationResponse) -> VerificationResult:
    result = VerificationResult(finding_id=fix.finding_id, file=fix.file, title=fix.title, proposal=fix)
    def stop(message, status='SKIPPED'):
        result.status, result.verification_summary = status, message
        return result
    if not fix.safe_to_verify or fix.validation_errors:
        return stop('Fix was rejected by proposal validation; no execution attempted.')
    path = module_path(fix.file)
    source = next((f for f in repository.changed_files if f.path == fix.file), None)
    if not path or not source or source.content is None or source.skip_reason:
        return stop('Unsupported path or unavailable source; no execution attempted.')
    if len(source.content.encode()) > MAX_FILE_BYTES:
        return stop('Source file exceeds verification size limit.')
    try:
        original_tree = ast.parse(source.content)
        proposal_tree = ast.parse(fix.original_code)
        name = proposal_tree.body[0].name if len(proposal_tree.body) == 1 and isinstance(proposal_tree.body[0], ast.FunctionDef) else None
        target = next((n for n in original_tree.body if isinstance(n, ast.FunctionDef) and n.name == name), None)
        if target is None:
            return stop('Exact target function is unavailable.')
        errors, _ = validate_fix(fix, source.content, target)
        if errors:
            result.syntax_check = Check(status='FAILED', message=' '.join(errors))
            return stop('Fix failed independent syntax/source/safety revalidation.', 'FAILED')
        lines = source.content.splitlines(keepends=True)
        updated = ''.join(lines[:target.lineno-1]) + fix.fixed_code.rstrip('\n') + '\n' + ''.join(lines[target.end_lineno:])
        ast.parse(updated)
    except (SyntaxError, ValueError, RecursionError):
        result.syntax_check = Check(status='FAILED', message='Invalid Python syntax.')
        return stop('Source or fixed code failed syntax validation.', 'FAILED')
    result.syntax_check = Check(status='PASSED', message='Replacement and resulting full file are valid Python ASTs.')
    if len(updated.encode('utf-8')) > MAX_FILE_BYTES:
        return stop('Fixed file exceeds the verification/scanner file size limit.')
    result.safety_violations = execution_source_violations(source.content, name, 'before') + execution_source_violations(updated, name, 'after')
    if result.safety_violations:
        return stop('Full-file execution gate rejected source: ' + ' '.join(describe_violation(v) for v in result.safety_violations))
    if tests.head_sha != repository.commit or tests.repository != repository.repository:
        return stop('Test proposals do not match the immutable repository snapshot.')
    identified = {f.finding_id: f for f in tests.findings}
    selected = []
    for proposal in tests.tests:
        finding = identified.get(proposal.finding_id)
        located = target_function(source.content, finding.line) if finding and finding.file == fix.file else None
        if proposal.file != fix.file or not located or located.name != name:
            continue
        test_errors = proposal.validation_errors + validate_code(proposal, path, name)
        if not proposal.execution_safe:
            test_errors.append('Test was not previously marked safe.')
        if not test_errors:
            test_errors.extend(computation_errors(ast.parse(proposal.test_code)))
        if test_errors:
            result.generated_test = Check(status='FAILED', message='Related generated test failed fresh safety validation: ' + ' '.join(test_errors))
            return stop('Unsafe generated tests are never executed.', 'FAILED')
        selected.append(proposal)
    if not selected:
        return stop('No related, safe generated regression test is available.')
    if len(selected) > MAX_TESTS:
        return stop('Generated test count exceeds verification limit.')
    contract_sources = {f.path:f.content for f in repository.changed_files if f.content is not None}
    contract_sources.update({f.path:f.content for f in repository.context_files})
    for test in selected:
        result.compatibility = compatibility(fix, test, contract_sources)
        if not result.compatibility.compatible:
            return stop(result.compatibility.reason, 'SKIPPED' if result.compatibility.behavior_ambiguous else 'FAILED')
    result.generated_test = Check(status='PASSED', message=f'{len(selected)} related tests passed fresh AST/import/safety validation.')
    # Every copied file is constructed from validated data. No real package __init__,
    # repository tests, configuration, conftest, dependencies, or imports are copied.
    with tempfile.TemporaryDirectory(prefix='repopilot-verify-') as directory:
        work = Path(directory)
        for variant, content in [('before', source.content), ('after', updated)]:
            root = work / variant
            dest = root / 'target' / fix.file
            dest.parent.mkdir(parents=True)
            dest.write_text(content, encoding='utf-8')
            for parent in list(dest.parents):
                if parent == root / 'target':
                    break
                (parent / '__init__.py').write_text('', encoding='utf-8')
            (root / 'tests').mkdir()
            for i, proposal in enumerate(selected):
                (root / 'tests' / f'test_proposal_{i}.py').write_text(proposal.test_code, encoding='utf-8')
            (root / 'pytest.ini').write_text('[pytest]\n', encoding='utf-8')
        copied = [p for p in work.rglob('*') if p.is_file()]
        if len(copied) + 8 > MAX_FILES or sum(p.stat().st_size for p in copied) > MAX_WORKSPACE_BYTES:
            return stop('Verification workspace file/byte limit reached.')
        before_tests = await execute_tests(work / 'before')
        after_tests = await execute_tests(work / 'after') if before_tests.status != 'SKIPPED' else Check(message=before_tests.message)
        result.regression_tests = after_tests
        # Baseline test outcome remains visible independently of validation.
        result.generated_test = before_tests
        def snapshot(content):
            return RepositoryContext(repository=repository.repository, commit=repository.commit,
                changed_files=[FullChangedFile(path=fix.file, status='modified', patch=None, content=content)], context_files=[], warnings=[])
        before_scans = await run_static_analysis(snapshot(source.content))
        after_scans = await run_static_analysis(snapshot(updated))
        result.bandit_before, result.bandit_after = scan_check(before_scans, 'bandit'), scan_check(after_scans, 'bandit')
        result.semgrep_before, result.semgrep_after = scan_check(before_scans, 'semgrep'), scan_check(after_scans, 'semgrep')
    if after_tests.status == 'SKIPPED':
        return stop(after_tests.message)
    if after_tests.status != 'PASSED':
        return stop('Fixed-code regression tests failed. Characterization tests may still expect the original bug; no test expectations were altered.', 'FAILED')
    checks = [(result.bandit_before, result.bandit_after), (result.semgrep_before, result.semgrep_after)]
    if result.bandit_before.status != 'PASSED' or result.bandit_after.status != 'PASSED':
        return stop('Bandit must complete successfully before and after; verification is incomplete.')
    for old, new in checks:
        if old.status == 'FAILED' or new.status == 'FAILED' or old.status != new.status:
            return stop('Scanner failure or inconsistent availability prevents approval.')
        if severe_regression(old, new, source.content, updated):
            return stop('Fixed code introduced a new HIGH/CRITICAL scanner finding.', 'FAILED')
    baseline_failure = before_tests.exit_code == 1 and before_tests.failed > 0 and before_tests.errors == 0
    if not baseline_failure:
        return stop('Tests passed after, but no baseline test failure demonstrates that the issue was reproduced. Approval requires fail-before/pass-after evidence.')
    result.status = 'PASSED'
    result.safe_to_apply = True
    result.verification_summary = 'Related tests failed before and passed after; Bandit completed and available Semgrep scans showed no new HIGH/CRITICAL findings. Approved only within this restricted verification scope; nothing was applied to GitHub.'
    return result


async def verify_fixes(fixes: FixGenerationResponse, repository: RepositoryContext, tests: TestGenerationResponse) -> VerificationResponse:
    results = []
    mismatch = fixes.head_sha != repository.commit or fixes.repository != repository.repository or tests.pull_request != fixes.pull_request
    for index, fix in enumerate(fixes.fixes):
        if mismatch or index >= MAX_FIXES:
            results.append(VerificationResult(finding_id=fix.finding_id, file=fix.file, title=fix.title, proposal=fix,
                verification_summary='Snapshot mismatch or verification fix limit reached.'))
            continue
        results.append(await verify_one(fix, repository, tests))
    return VerificationResponse(repository=fixes.repository, pull_request=fixes.pull_request, head_sha=fixes.head_sha,
        results=results, fixes_verified=sum(r.status != 'SKIPPED' for r in results),
        passed=sum(r.status == 'PASSED' for r in results), failed=sum(r.status == 'FAILED' for r in results),
        skipped=sum(r.status == 'SKIPPED' for r in results))
