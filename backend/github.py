"""Read-only GitHub pull request retrieval. No code analysis is performed."""

import os
import time
from collections.abc import AsyncIterator
from typing import Literal

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError


class ChangedFile(BaseModel):
    filename: str
    status: str
    additions: int = Field(ge=0)
    deletions: int = Field(ge=0)
    patch: str | None = None


class PullRequestResponse(BaseModel):
    repository: str
    pull_request: int
    title: str
    state: Literal['open', 'closed']
    author: str
    base_branch: str
    head_branch: str
    changed_files: int = Field(ge=0)
    additions: int = Field(ge=0)
    deletions: int = Field(ge=0)
    files: list[ChangedFile]
    files_truncated: bool


async def get_github_client() -> AsyncIterator[httpx.AsyncClient]:
    headers = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'RepoPilot',
    }
    token = os.environ.get('GITHUB_TOKEN', '').strip()
    if token:
        headers['Authorization'] = f'Bearer {token}'
    async with httpx.AsyncClient(
        base_url='https://api.github.com', headers=headers,
        timeout=httpx.Timeout(10.0), follow_redirects=True,
    ) as client:
        yield client


async def github_json(client: httpx.AsyncClient, path: str, **kwargs) -> tuple[object, httpx.Response]:
    try:
        response = await client.get(path, **kwargs)
    except httpx.TimeoutException as exc:
        raise HTTPException(504, 'GitHub did not respond in time. Please try again.') from exc
    except httpx.RequestError as exc:
        raise HTTPException(502, 'Could not connect to GitHub. Please try again.') from exc

    # Do not return raw upstream errors or request headers, which may contain secrets.
    try:
        data = response.json()
    except ValueError:
        data = None
    message = str(data.get('message', '')) if isinstance(data, dict) else ''
    rate_limited = response.status_code == 429 or (
        response.status_code == 403 and (
            response.headers.get('x-ratelimit-remaining') == '0'
            or 'retry-after' in response.headers
            or 'rate limit' in message.lower()
        )
    )
    if rate_limited:
        retry_after = response.headers.get('retry-after', '')
        if not retry_after.isdigit():
            reset = response.headers.get('x-ratelimit-reset', '')
            retry_after = str(max(1, int(reset) - int(time.time()))) if reset.isdigit() else '60'
        raise HTTPException(
            429, f'GitHub API rate limit reached. Retry in {retry_after} seconds. '
            'An optional GITHUB_TOKEN can increase API limits.',
            headers={'Retry-After': retry_after},
        )
    if response.status_code == 404:
        raise HTTPException(404, 'GitHub resource not found.')
    if response.status_code == 401:
        raise HTTPException(502, 'GitHub rejected GITHUB_TOKEN. Check or unset the optional backend environment variable.')
    if response.status_code == 403:
        raise HTTPException(502, 'GitHub denied access to this resource. Check repository visibility and optional token permissions.')
    if not 200 <= response.status_code < 300:
        raise HTTPException(502, f'GitHub API returned HTTP {response.status_code}. Please try again.')
    if data is None:
        raise HTTPException(502, 'GitHub returned an invalid response. Please try again.')
    return data, response


async def fetch_pull_request(client: httpx.AsyncClient, repository: str, number: int) -> PullRequestResponse:
    path = f'/repos/{repository}/pulls/{number}'
    try:
        metadata, _ = await github_json(client, path)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        # GitHub uses the same 404 for missing repositories and missing PRs.
        try:
            await github_json(client, f'/repos/{repository}')
        except HTTPException as repo_exc:
            if repo_exc.status_code == 404:
                raise HTTPException(404, 'Repository not found or not accessible on GitHub. Check owner/repo and repository visibility.') from repo_exc
            raise
        raise HTTPException(404, f'Pull request #{number} was not found in {repository}.') from exc

    try:
        files: list[ChangedFile] = []
        # GitHub returns at most 100 files per page and 3,000 per PR.
        for page in range(1, 31):
            data, response = await github_json(client, f'{path}/files', params={'per_page': 100, 'page': page})
            if not isinstance(data, list):
                raise ValueError('Expected a list of files')
            files.extend(ChangedFile.model_validate(item) for item in data)
            if 'next' not in response.links:
                break
        if not isinstance(metadata, dict):
            raise ValueError('Expected PR metadata')
        return PullRequestResponse(
            repository=repository, pull_request=number,
            title=metadata['title'], state=metadata['state'],
            author=metadata['user']['login'],
            base_branch=metadata['base']['ref'], head_branch=metadata['head']['ref'],
            changed_files=metadata['changed_files'], additions=metadata['additions'],
            deletions=metadata['deletions'], files=files,
            files_truncated=len(files) < metadata['changed_files'],
        )
    except (KeyError, TypeError, ValueError, ValidationError) as exc:
        raise HTTPException(502, 'GitHub returned unexpected pull request data. Please try again.') from exc
