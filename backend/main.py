import asyncio

import httpx
from openai import AsyncOpenAI
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

from github import PullRequestResponse, fetch_pull_request, get_github_client
from review import get_openai_client, review_patches
from context import build_repository_context
from static_analysis import run_static_analysis
from pipeline import PipelineResponse, combine_review
from test_generation import TestGenerationResponse, generate_tests
from fix_generation import FixGenerationResponse, generate_fixes


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
    request: AnalyzeRequest,
    client: httpx.AsyncClient = Depends(get_github_client),
    ai_client: AsyncOpenAI = Depends(get_openai_client),
) -> FixGenerationResponse:
    pr = await analyze(request, client)
    try:
        repository = await asyncio.wait_for(build_repository_context(pr, client), timeout=45)
        static = await run_static_analysis(repository)
        ai = await asyncio.wait_for(review_patches(pr, ai_client, repository), timeout=300)
        reviewed = combine_review(ai, static)
        tests = await asyncio.wait_for(generate_tests(ai, repository, ai_client), timeout=120)
        return await asyncio.wait_for(generate_fixes(reviewed, repository, tests, ai_client), timeout=180)
    except asyncio.TimeoutError as exc:
        raise HTTPException(504, 'Review or fix generation exceeded its time limit. No proposal was applied or executed.') from exc
