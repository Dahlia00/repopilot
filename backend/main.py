import asyncio
import ast

import httpx
from openai import AsyncOpenAI
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

from github import PullRequestResponse, fetch_pull_request, get_github_client
from review import get_openai_client, review_patches, Finding
from context import build_repository_context
from static_analysis import run_static_analysis
from pipeline import PipelineResponse, combine_review
from test_generation import TestGenerationResponse, generate_tests, ValidatedProposal, IdentifiedFinding
from fix_generation import FixGenerationResponse, generate_fixes, ValidatedFix, target_function
from verification import VerificationResponse, VerificationResult, verify_fixes, verify_one, module_path
from agents import orchestrate, STORE
from github_actions import review_plan, fix_plan, post_review, create_fix_pr, public_data


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    repository: str = Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+$', max_length=200)
    pull_request: int = Field(strict=True, gt=0)

    @field_validator('repository')
    @classmethod
    def validate_repository(cls, value: str) -> str:
        if value.split('/')[1] in {'.', '..'}:
            raise ValueError('Repository must be in owner/repo format.')
        return value


class HealthResponse(BaseModel):
    status: str
    service: str


class VerifyFixRequest(AnalyzeRequest):
    model_config = ConfigDict(extra='forbid')
    head_sha: str = Field(pattern=r'^[0-9a-f]{40}$')
    finding: Finding
    validated_fix: ValidatedFix
    validated_test: ValidatedProposal | None = None


class GenerateFixRequest(AnalyzeRequest):
    test_artifacts: TestGenerationResponse | None = None

    @field_validator('test_artifacts')
    @classmethod
    def limit_test_artifacts(cls, value):
        if value is not None and (len(value.tests) > 5 or len(value.findings) > 200):
            raise ValueError('Test artifact count exceeds generation limits.')
        return value


class GithubActionRequest(AnalyzeRequest):
    model_config = ConfigDict(extra='forbid')
    review_id: str = Field(pattern=r'^[0-9a-f-]{36}$')
    finding_id: str | None = Field(default=None, max_length=80)
    confirm_write: bool = Field(default=False, strict=True)


app = FastAPI(title='RepoPilot API')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000', 'http://127.0.0.1:3000'],
    allow_methods=['GET', 'POST'],
    allow_headers=['Content-Type'],
)


@app.get('/health', response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status='ok', service='RepoPilot API')


@app.post('/analyze', response_model=PullRequestResponse)
async def analyze(
    request: AnalyzeRequest,
    client: httpx.AsyncClient = Depends(get_github_client),
) -> PullRequestResponse:
    try:
        return await asyncio.wait_for(
            fetch_pull_request(client, request.repository, request.pull_request), timeout=45,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(504, 'Fetching GitHub pull request data timed out. Please try again.') from exc


@app.post('/review', response_model=PipelineResponse)
async def review(
    request: AnalyzeRequest,
    client: httpx.AsyncClient = Depends(get_github_client),
    ai_client: AsyncOpenAI = Depends(get_openai_client),
) -> PipelineResponse:
    pr = await analyze(request, client)
    try:
        repository = await asyncio.wait_for(build_repository_context(pr, client), timeout=45)
    except asyncio.TimeoutError as exc:
        raise HTTPException(504, 'GitHub repository context retrieval timed out. Please try again.') from exc
    static = await run_static_analysis(repository)
    try:
        ai = await asyncio.wait_for(review_patches(pr, ai_client, repository), timeout=300)
        return combine_review(ai, static)
    except asyncio.TimeoutError as exc:
        raise HTTPException(504, 'AI review exceeded the five-minute time limit. No partial review is returned.') from exc


@app.post('/generate-tests', response_model=TestGenerationResponse)
async def generate_test_proposals(
    request: AnalyzeRequest,
    client: httpx.AsyncClient = Depends(get_github_client),
    ai_client: AsyncOpenAI = Depends(get_openai_client),
) -> TestGenerationResponse:
    pr = await analyze(request, client)
    try:
        repository = await asyncio.wait_for(build_repository_context(pr, client), timeout=45)
        reviewed = await asyncio.wait_for(review_patches(pr, ai_client, repository), timeout=300)
        return await asyncio.wait_for(generate_tests(reviewed, repository, ai_client), timeout=120)
    except asyncio.TimeoutError as exc:
        raise HTTPException(504, 'Review or test generation exceeded its time limit. No generated code was executed.') from exc


@app.post('/generate-fixes', response_model=FixGenerationResponse)
async def generate_fix_proposals(
    request: GenerateFixRequest,
    client: httpx.AsyncClient = Depends(get_github_client),
    ai_client: AsyncOpenAI = Depends(get_openai_client),
) -> FixGenerationResponse:
    pr = await analyze(request, client)
    tests = request.test_artifacts
    if tests is not None and (tests.head_sha != pr.head_sha or tests.repository != pr.repository or tests.pull_request != pr.pull_request):
        raise HTTPException(409, 'Test artifacts do not match this PR head; regenerate tests for the current commit.')
    try:
        repository = await asyncio.wait_for(build_repository_context(pr, client), timeout=45)
        static = await run_static_analysis(repository)
        ai = await asyncio.wait_for(review_patches(pr, ai_client, repository), timeout=300)
        reviewed = combine_review(ai, static)
        if tests is None:
            tests = await asyncio.wait_for(generate_tests(ai, repository, ai_client), timeout=120)
        return await asyncio.wait_for(generate_fixes(reviewed, repository, tests, ai_client), timeout=180)
    except asyncio.TimeoutError as exc:
        raise HTTPException(504, 'Review or fix generation exceeded its time limit. No proposal was applied or executed.') from exc


@app.post('/verify-fixes', response_model=VerificationResponse)
async def verify_fix_proposals(
    request: AnalyzeRequest,
    client: httpx.AsyncClient = Depends(get_github_client),
    ai_client: AsyncOpenAI = Depends(get_openai_client),
) -> VerificationResponse:
    pr = await analyze(request, client)
    try:
        repository = await asyncio.wait_for(build_repository_context(pr, client), timeout=45)
        static = await run_static_analysis(repository)
        ai = await asyncio.wait_for(review_patches(pr, ai_client, repository), timeout=300)
        tests = await asyncio.wait_for(generate_tests(ai, repository, ai_client), timeout=120)
        fixes = await asyncio.wait_for(generate_fixes(combine_review(ai, static), repository, tests, ai_client), timeout=180)
        return await asyncio.wait_for(verify_fixes(fixes, repository, tests), timeout=360)
    except asyncio.TimeoutError as exc:
        raise HTTPException(504, 'Verification exceeded its time limit. Temporary processes were stopped and workspaces cleaned up; no repository changes were applied.') from exc


@app.post('/verify-fix', response_model=VerificationResult)
async def verify_existing_fix(
    request: VerifyFixRequest,
    client: httpx.AsyncClient = Depends(get_github_client),
) -> VerificationResult:
    """Deterministic stage: no OpenAI client/key/generation dependency."""
    fix, finding, test = request.validated_fix, request.finding, request.validated_test
    if module_path(fix.file) is None or finding.file != fix.file or test is not None and test.file != fix.file:
        raise HTTPException(422, 'Fix, finding and test must refer to the same supported Python file.')
    pr = await analyze(request, client)
    if pr.head_sha != request.head_sha:
        raise HTTPException(409, 'PR head changed; regenerate artifacts for the current commit before verifying.')
    changed = next((file for file in pr.files if file.filename == fix.file), None)
    if changed is None:
        raise HTTPException(422, 'Proposal file is not a changed file in this pull request.')
    try:
        # Reuse bounded immutable retrieval, but only fetch the selected changed file.
        snapshot = await asyncio.wait_for(build_repository_context(
            pr.model_copy(update={'files': [changed], 'changed_files': 1}), client), timeout=45)
        source = next((file for file in snapshot.changed_files if file.path == fix.file), None)
        target = target_function(source.content, finding.line) if source and source.content else None
        if target is None or finding.line is None or fix.original_code != ast.get_source_segment(source.content, target):
            raise HTTPException(422, 'Finding location and original code must identify the same current source function.')
        identified = IdentifiedFinding(**finding.model_dump(), finding_id=test.finding_id if test else fix.finding_id)
        tests = TestGenerationResponse(repository=pr.repository, pull_request=pr.pull_request, head_sha=pr.head_sha,
            findings=[identified], tests=[test] if test else [], skipped_findings=[],
            total_tests=int(test is not None), safe_tests=int(test is not None and test.execution_safe),
            rejected_tests=int(test is not None and not test.execution_safe))
        return await asyncio.wait_for(verify_one(fix, snapshot, tests), timeout=100)
    except asyncio.TimeoutError as exc:
        raise HTTPException(504, 'Deterministic verification timed out; temporary processes and files were cleaned up.') from exc


@app.post('/agent-review')
async def agent_review(request: AnalyzeRequest, client: httpx.AsyncClient = Depends(get_github_client),
                       ai_client: AsyncOpenAI = Depends(get_openai_client)):
    pr = await analyze(request, client)
    try:
        snapshot = await asyncio.wait_for(build_repository_context(pr, client), timeout=45)
        static = await run_static_analysis(snapshot)
        response = await asyncio.wait_for(orchestrate(pr, snapshot, static, ai_client), timeout=900)
        return public_data(response.model_dump(mode='json'))
    except asyncio.TimeoutError as exc:
        raise HTTPException(504, 'Agent review exceeded its overall limit; no GitHub writes were performed.') from exc


@app.post('/github/preview-review')
async def preview_github_review(request: GithubActionRequest):
    return review_plan(STORE.get(request.review_id, request.repository, request.pull_request))


@app.post('/github/post-review')
async def post_github_review(request: GithubActionRequest, client: httpx.AsyncClient = Depends(get_github_client)):
    return await post_review(STORE.get(request.review_id, request.repository, request.pull_request), client, request.confirm_write)


@app.post('/github/preview-fix-pr')
async def preview_github_fix_pr(request: GithubActionRequest):
    return fix_plan(STORE.get(request.review_id, request.repository, request.pull_request), request.finding_id)


@app.post('/github/create-fix-pr')
async def create_github_fix_pr(request: GithubActionRequest, client: httpx.AsyncClient = Depends(get_github_client)):
    return await create_fix_pr(STORE.get(request.review_id, request.repository, request.pull_request), client,
                               request.finding_id, request.confirm_write)
