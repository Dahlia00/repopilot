from typing import Literal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    repository: str = Field(pattern=r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$', max_length=200)
    pull_request: int = Field(strict=True, gt=0)

class Finding(BaseModel):
    severity: Literal['HIGH', 'MEDIUM', 'LOW']
    category: Literal['Security', 'Bug', 'Code quality']
    title: str
    explanation: str
    suggested_fix: str

class AnalyzeResponse(BaseModel):
    repository: str
    pull_request: int
    findings: list[Finding]

class HealthResponse(BaseModel):
    status: str
    service: str

app = FastAPI(title='RepoPilot API')
app.add_middleware(CORSMiddleware,
    allow_origins=['http://localhost:3000', 'http://127.0.0.1:3000'],
    allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])

@app.get('/health', response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status='ok', service='RepoPilot API')

@app.post('/analyze', response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    # Fixed examples only: no repository content is accessed.
    return AnalyzeResponse(repository=request.repository, pull_request=request.pull_request, findings=[
        Finding(severity='HIGH', category='Security', title='Potential SQL injection',
            explanation='Mock example: user input is interpolated into a SQL query, allowing an attacker to alter the query.',
            suggested_fix='Use parameterized queries and pass user input as bound parameters.'),
        Finding(severity='MEDIUM', category='Bug', title='Missing guard for an empty result',
            explanation='Mock example: accessing the first item in an empty result list can raise an IndexError.',
            suggested_fix='Check whether the list contains items before accessing the first result and handle the empty case.'),
        Finding(severity='LOW', category='Code quality', title='Repeated validation logic',
            explanation='Mock example: duplicate validation across functions makes future changes harder to maintain.',
            suggested_fix='Extract the shared validation into a clearly named helper function.'),
    ])
