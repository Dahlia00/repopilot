"""Combine provenance-preserving AI and static findings conservatively."""

import re
from typing import Literal
from pydantic import BaseModel

from context import FileMetadata
from review import Finding, ReviewResponse, SEVERITY_ORDER
from static_analysis import ScannerReport, StaticFinding, StaticResult


class AIFinding(Finding):
    source: Literal['AI'] = 'AI'


class Evidence(BaseModel):
    source: Literal['AI', 'bandit', 'semgrep']
    index: int  # Index into ai_findings or static_findings, depending on source.


class CombinedIssue(BaseModel):
    file: str
    line: int | None
    severity: str
    title: str
    sources: list[str]
    evidence: list[Evidence]


class CombinedSummary(BaseModel):
    ai_findings: int
    static_findings: int
    unique_issues: int


class PipelineResponse(ReviewResponse):
    ai_findings: list[AIFinding]
    static_findings: list[StaticFinding]
    scanners: list[ScannerReport]
    static_skipped_files: list[FileMetadata]
    combined_issues: list[CombinedIssue]
    summary: CombinedSummary


def issue_signature(title: str, explanation: str) -> str:
    text = re.sub(r'[^a-z0-9]+', ' ', f'{title} {explanation}'.lower())
    # These are issue families for grouping observations, never generated findings.
    for phrase in ['sql injection', 'command injection', 'path traversal', 'unsafe deserialization',
                   'cross site scripting', 'hardcoded password', 'weak cryptography']:
        if phrase in text:
            return phrase
    return re.sub(r'[^a-z0-9]+', ' ', title.lower()).strip()


def combine_review(ai: ReviewResponse, static: StaticResult) -> PipelineResponse:
    ai_findings = [AIFinding(**finding.model_dump()) for finding in ai.findings]
    issues: list[CombinedIssue] = []
    keys: list[tuple] = []
    for source_list in [ai_findings, static.findings]:
        for index, finding in enumerate(source_list):
            source = finding.source
            category = 'Bug' if finding.category == 'Error Handling' else finding.category
            key = (finding.file, finding.line, category, issue_signature(finding.title, finding.explanation))
            match = next((i for i, old in enumerate(keys)
                          if key == old and finding.line is not None and source not in issues[i].sources), None)
            evidence = Evidence(source=source, index=index)
            if match is None:
                keys.append(key)
                issues.append(CombinedIssue(file=finding.file, line=finding.line, severity=finding.severity,
                                            title=finding.title, sources=[source], evidence=[evidence]))
            else:
                issue = issues[match]
                issue.sources.append(source)
                issue.evidence.append(evidence)
                if SEVERITY_ORDER[finding.severity] < SEVERITY_ORDER[issue.severity]:
                    issue.severity = finding.severity
    return PipelineResponse(
        **ai.model_dump(), ai_findings=ai_findings, static_findings=static.findings,
        scanners=static.scanners, static_skipped_files=static.skipped_files,
        combined_issues=issues,
        summary=CombinedSummary(ai_findings=len(ai_findings), static_findings=len(static.findings), unique_issues=len(issues)),
    )
