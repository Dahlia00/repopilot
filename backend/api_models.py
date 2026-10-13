"""Validated API inputs, separate from endpoint orchestration."""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from review import Finding
from fix_generation import ValidatedFix
from test_generation import ValidatedProposal, TestGenerationResponse

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


