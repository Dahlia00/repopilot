"""Deterministic, bounded repository context from an immutable PR head commit."""

import ast
import base64
import binascii
import posixpath
import re
from pathlib import PurePosixPath
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from pydantic import BaseModel

from github import PullRequestResponse, github_json

MAX_CONTEXT_FILES = 8
MAX_CHANGED_FILES = 20
MAX_FILE_BYTES = 24_000
MAX_SOURCE_CHARS = 80_000
MAX_CONTEXT_CANDIDATES = 24
MAX_TREE_ENTRIES = 10_000
MAX_TREE_RESPONSE_BYTES = 2_000_000
MAX_FILE_RESPONSE_BYTES = 64_000
MAX_MODEL_INPUT_CHARS = 60_000
MAX_TOTAL_MODEL_INPUT_CHARS = 200_000
TEXT_EXTENSIONS = {'.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.json',
                   '.toml', '.yaml', '.yml', '.ini', '.cfg', '.txt', '.css', '.scss', '.html', '.sql'}
JS_EXTENSIONS = ('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs')
IGNORED_DIRS = {'.git', '.next', '.venv', 'venv', 'node_modules', 'build', 'dist',
                'out', 'coverage', '__pycache__', 'vendor', 'generated', '__generated__', '.cache'}
LOCKFILES = {'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
             'poetry.lock', 'uv.lock', 'pipfile.lock', 'composer.lock', 'cargo.lock'}


class FileMetadata(BaseModel):
    path: str
    reason: str


class ContextMetadata(FileMetadata):
    used_for: list[str]


class ContextFile(FileMetadata):
    content: str


class FullChangedFile(BaseModel):
    path: str
    status: str
    patch: str | None
    content: str | None = None
    skip_reason: str | None = None


class RepositoryContext(BaseModel):
    repository: str
    commit: str
    changed_files: list[FullChangedFile]
    context_files: list[ContextFile]
    warnings: list[str]


def exclusion_reason(path: str) -> str | None:
    parts = PurePosixPath(path).parts
    if not parts or len(path) > 512 or path.startswith('/') or any(part in {'.', '..'} for part in path.split('/')) or '\\' in path:
        return 'Unsafe file path'
    name = parts[-1].lower()
    if any(part.lower() in IGNORED_DIRS for part in parts[:-1]):
        return 'Generated, dependency, or build directory'
    if name in LOCKFILES or name.endswith(('.lock', '.min.js', '.min.css', '.map', '.d.ts', '.snap', '.g.ts', '.g.js')) or '.generated.' in name or '.gen.' in name:
        return 'Generated file or lockfile'
    if PurePosixPath(name).suffix not in TEXT_EXTENSIONS:
        return 'Binary or unsupported file type'
    return None


def module_candidates(module: str, base: str, paths: set[str]) -> list[str]:
    stem = posixpath.normpath(posixpath.join(base, module.replace('.', '/')))
    return [path for path in (stem + '.py', stem + '/__init__.py') if path in paths]


def imported_paths(path: str, content: str, paths: set[str]) -> list[str]:
    """Resolve direct local imports only, without running code or following dependencies."""
    directory = posixpath.dirname(path)
    found: set[str] = set()
    if path.endswith('.py'):
        try:
            tree = ast.parse(content)
        except (SyntaxError, RecursionError):
            return []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for name in node.names:
                    for base in dict.fromkeys([directory, '', 'src']):
                        matches = module_candidates(name.name, base, paths)
                        if matches:
                            found.update(matches)
                            break
            elif isinstance(node, ast.ImportFrom):
                if node.level:
                    pieces = directory.split('/') if directory else []
                    if node.level - 1 > len(pieces):
                        continue
                    base = '/'.join(pieces[:len(pieces) - node.level + 1])
                    bases = [base]
                else:
                    bases = list(dict.fromkeys([directory, '', 'src']))
                for base in bases:
                    matches = module_candidates(node.module or '', base, paths)
                    for name in node.names:
                        if name.name != '*':
                            module = '.'.join(filter(None, [node.module, name.name]))
                            matches += module_candidates(module, base, paths)
                    if matches:
                        found.update(matches)
                        break
    elif PurePosixPath(path).suffix in JS_EXTENSIONS:
        # Tokenize comments/strings so text inside a comment or string isn't an import.
        tokens = re.findall(r'//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]', content)
        tokens = [token for token in tokens if not token.startswith(('//', '/*'))]
        specs: set[str] = set()
        for index, token in enumerate(tokens):
            if token not in {'import', 'export', 'require'}:
                continue
            tail = tokens[index + 1:index + 81]
            literal = None
            if token in {'import', 'require'} and tail:
                if tail[0].startswith(('"', "'")):
                    literal = tail[0]
                elif len(tail) > 1 and tail[0] == '(':
                    literal = tail[1]
            if literal is None and token in {'import', 'export'}:
                for offset, value in enumerate(tail[:-1]):
                    if value in {';', 'import', 'export'}:
                        break
                    if value == 'from':
                        literal = tail[offset + 1]
                        break
            if literal and literal.startswith(('"', "'")) and '\\' not in literal:
                spec = literal[1:-1]
                if spec.startswith('./') or spec.startswith('../'):
                    specs.add(spec)
        for spec in sorted(specs)[:20]:
            stem = posixpath.normpath(posixpath.join(directory, spec))
            options = [stem]
            if PurePosixPath(stem).suffix in {'.js', '.jsx'}:
                options += [str(PurePosixPath(stem).with_suffix(ext)) for ext in ('.ts', '.tsx')]
            options += [stem + ext for ext in JS_EXTENSIONS]
            options += [stem + '/index' + ext for ext in JS_EXTENSIONS]
            for candidate in options:
                if candidate in paths:
                    found.add(candidate)
                    break
    return sorted(found - {path})[:20]


def select_candidates(changed: list[FullChangedFile], paths: set[str]) -> list[FileMetadata]:
    reasons: dict[str, str] = {}
    root_readme = next((path for path in sorted(paths) if path.lower() == 'readme.md'), None)
    if root_readme:
        reasons[root_readme] = 'Root README: project purpose and conventions'
    for file in changed:
        if file.content is None or file.skip_reason or file.patch is None:
            continue
        for path in imported_paths(file.path, file.content, paths):
            reasons.setdefault(path, f'Direct local import from {file.path}')
    for file in changed:
        if file.content is None or file.skip_reason or file.patch is None:
            continue
        directory = posixpath.dirname(file.path)
        nearby = ['README.md']
        if file.path.endswith('.py'):
            nearby += ['__init__.py']
        elif PurePosixPath(file.path).suffix in JS_EXTENSIONS:
            nearby += ['index' + ext for ext in JS_EXTENSIONS]
        for name in nearby:
            path = posixpath.join(directory, name)
            if path in paths and path != file.path:
                reasons.setdefault(path, f'Same-directory module documentation or entry point for {file.path}')
    return [FileMetadata(path=path, reason=reason) for path, reason in reasons.items()
            if exclusion_reason(path) is None][:MAX_CONTEXT_CANDIDATES]


async def read_file(client: httpx.AsyncClient, repository: str, commit: str,
                    path: str, entry: dict | None) -> tuple[str | None, str | None]:
    if entry is not None and entry['size'] > MAX_FILE_BYTES:
        return None, f'File exceeds {MAX_FILE_BYTES:,}-byte limit'
    if entry is not None:
        endpoint = f'/repos/{repository}/git/blobs/{entry["sha"]}'
        params = {}
    else:
        endpoint = f'/repos/{repository}/contents/{quote(path, safe="/")}'
        params = {'ref': commit}
    try:
        data, _ = await github_json(client, endpoint, params=params,
                                   max_response_bytes=MAX_FILE_RESPONSE_BYTES)
    except HTTPException as exc:
        if exc.status_code in {404, 413}:
            return None, 'File unavailable at the PR head commit' if exc.status_code == 404 else 'File response exceeds size limit'
        raise
    try:
        if isinstance(data, dict) and data.get('type', 'file') != 'file':
            return None, 'Symlink or non-regular repository content'
        if not isinstance(data, dict) or data.get('encoding') != 'base64' or type(data.get('size')) is not int or not isinstance(data.get('content'), str):
            raise ValueError('Unexpected file data')
        if data['size'] > MAX_FILE_BYTES:
            return None, f'File exceeds {MAX_FILE_BYTES:,}-byte limit'
        raw = base64.b64decode(''.join(data['content'].split()), validate=True)
        if len(raw) > MAX_FILE_BYTES:
            return None, f'File exceeds {MAX_FILE_BYTES:,}-byte limit'
        if len(raw) != data['size']:
            raise ValueError('File size does not match content')
    except (ValueError, TypeError, KeyError, binascii.Error) as exc:
        raise HTTPException(502, 'GitHub returned invalid repository file data.') from exc
    try:
        content = raw.decode('utf-8')
    except UnicodeDecodeError:
        return None, 'Binary or non-UTF-8 content'
    if any(ord(char) < 32 and char not in '\n\r\t' for char in content):
        return None, 'Binary content'
    if re.search(r'(?im)^\s*(?://|#|/\*|\*|<!--)?\s*(?:@generated|automatically generated|auto[- ]generated|generated file|code generated.*do not edit|do not edit\b)', '\n'.join(content.splitlines()[:5])):
        return None, 'Generated-file header'
    return content, None


from observability import stage

@stage('context.selected')
async def build_repository_context(pr: PullRequestResponse, client: httpx.AsyncClient) -> RepositoryContext:
    warnings: list[str] = []
    data, _ = await github_json(client, f'/repos/{pr.head_repository}/git/trees/{pr.head_sha}',
                               params={'recursive': '1'}, max_response_bytes=MAX_TREE_RESPONSE_BYTES)
    try:
        if not isinstance(data, dict) or not isinstance(data.get('tree'), list):
            raise ValueError('Expected repository tree')
        if data.get('truncated') or len(data['tree']) > MAX_TREE_ENTRIES:
            warnings.append('Repository tree was truncated or exceeded 10,000 entries; context discovery is incomplete.')
        entries = {}
        blocked_paths = set()
        for entry in data['tree'][:MAX_TREE_ENTRIES]:
            if not isinstance(entry, dict):
                raise ValueError('Invalid tree entry')
            if entry.get('type') != 'blob' or entry.get('mode') not in {'100644', '100755'}:
                if isinstance(entry.get('path'), str):
                    blocked_paths.add(entry['path'])
                continue  # Never follow symlinks or submodules.
            path, sha, size = entry['path'], entry['sha'], entry['size']
            if not isinstance(path, str) or not isinstance(size, int) or size < 0 or not re.fullmatch(r'[0-9a-f]{40}', sha):
                raise ValueError('Invalid tree file')
            if exclusion_reason(path) is None:
                entries[path] = entry
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(502, 'GitHub returned invalid repository tree data.') from exc

    changed: list[FullChangedFile] = []
    cache: dict[str, tuple[str | None, str | None]] = {}
    source_chars = 0
    attempted = 0
    for file in pr.files:
        item = FullChangedFile(path=file.filename, status=file.status, patch=file.patch)
        reason = exclusion_reason(file.filename)
        if file.filename in blocked_paths:
            reason = 'Symlink, submodule, or non-regular file'
        if file.status == 'removed':
            reason = 'Removed file has no full content at the head commit'
        if reason is None and attempted >= MAX_CHANGED_FILES:
            reason = f'Changed-file retrieval limit ({MAX_CHANGED_FILES}) reached'
        if reason is None:
            attempted += 1
            if file.patch is not None and len(file.patch) > MAX_FILE_BYTES:
                reason = 'Patch exceeds per-file character limit'
            else:
                content, reason = await read_file(client, pr.head_repository, pr.head_sha,
                                                  file.filename, entries.get(file.filename))
                cost = len(content or '') + len(file.patch or '')
                if reason is None and source_chars + cost > MAX_SOURCE_CHARS:
                    reason = 'Total source character limit reached'
                if reason is None:
                    source_chars += cost
                    item.content = content
                cache[file.filename] = (item.content, reason)
        item.skip_reason = reason
        changed.append(item)

    selected: list[ContextFile] = []
    candidates = select_candidates(changed, set(entries))
    for candidate in candidates:
        if len(selected) >= MAX_CONTEXT_FILES:
            warnings.append(f'Context file limit ({MAX_CONTEXT_FILES}) reached; remaining candidates were omitted.')
            break
        if candidate.path in cache:
            content, reason = cache[candidate.path]
            cost = 0
        else:
            content, reason = await read_file(client, pr.head_repository, pr.head_sha,
                                              candidate.path, entries[candidate.path])
            cost = len(content or '')
        if reason:
            warnings.append(f'{candidate.path}: {reason}')
            continue
        if source_chars + cost > MAX_SOURCE_CHARS:
            warnings.append(f'{candidate.path}: total source character limit reached')
            continue
        source_chars += cost
        selected.append(ContextFile(**candidate.model_dump(), content=content))
    if not data.get('truncated') and len(data['tree']) <= MAX_TREE_ENTRIES and len(candidates) == MAX_CONTEXT_CANDIDATES:
        warnings.append('Context candidate limit reached; additional imports may be omitted.')
    return RepositoryContext(repository=pr.head_repository, commit=pr.head_sha,
                             changed_files=changed, context_files=selected, warnings=warnings)
