"""Conservative duplicate grouping preserves all source evidence."""
import unittest
from pipeline import combine_review
from review import Finding, ReviewResponse
from static_analysis import StaticFinding, StaticResult


def ai_finding(**overrides):
    return Finding.model_validate({
        'severity': 'HIGH', 'category': 'Security', 'file': 'code.py', 'line': 3,
        'title': 'Path traversal risk', 'explanation': 'Path traversal may expose unintended files.',
        'suggested_fix': 'Constrain resolved paths.', 'confidence': 85,
        **overrides,
    })


def static_finding(**overrides):
    return StaticFinding.model_validate({
        'source': 'semgrep', 'severity': 'MEDIUM', 'category': 'Security', 'file': 'code.py',
        'line': 3, 'rule_id': 'test-path-traversal', 'title': 'Path traversal',
        'explanation': 'Path traversal can escape the intended directory.', **overrides,
    })


def review(findings):
    return ReviewResponse(repository='owner/repo', pull_request=1, title='Test', state='open',
        author='owner', base_branch='main', head_branch='feature', head_sha='a' * 40,
        head_repository='owner/repo', changed_files=1, additions=1, deletions=0,
        files=[], files_truncated=False, findings=findings, reviewed_files=['code.py'],
        skipped_files=[], model='test', repository_context=[], context_warnings=[],
        skipped_file_details=[], input_characters=0)


class DeduplicationTests(unittest.TestCase):
    def combine(self, ai, static):
        return combine_review(review(ai), StaticResult(findings=static, scanners=[], skipped_files=[]))

    def test_same_location_and_family_grouped_without_losing_details(self):
        result = self.combine([ai_finding()], [static_finding()])
        self.assertEqual(result.summary.model_dump(), {'ai_findings': 1, 'static_findings': 1, 'unique_issues': 1})
        self.assertEqual(result.ai_findings[0].source, 'AI')
        self.assertEqual(result.ai_findings[0].suggested_fix, 'Constrain resolved paths.')
        self.assertEqual(result.static_findings[0].rule_id, 'test-path-traversal')
        self.assertEqual(result.combined_issues[0].sources, ['AI', 'semgrep'])
        self.assertEqual(result.combined_issues[0].severity, 'HIGH')
        self.assertEqual(len(result.combined_issues[0].evidence), 2)

    def test_different_line_file_category_or_problem_not_merged(self):
        for override in [{'line': 4}, {'line': None}, {'file': 'other.py'}, {'category': 'Bug'},
                         {'title': 'Other issue', 'explanation': 'A separate problem.'}]:
            with self.subTest(override=override):
                result = self.combine([ai_finding()], [static_finding(**override)])
                self.assertEqual(result.summary.unique_issues, 2)

    def test_independent_ai_observations_not_collapsed(self):
        result = self.combine([ai_finding(), ai_finding(title='Second path traversal issue')], [])
        self.assertEqual(result.summary.unique_issues, 2)

    def test_highest_severity_and_complementary_scanner_evidence(self):
        result = self.combine([ai_finding()], [static_finding(severity='CRITICAL'), static_finding(source='bandit')])
        self.assertEqual(result.summary.unique_issues, 1)
        self.assertEqual(result.combined_issues[0].severity, 'CRITICAL')
        self.assertEqual(len(result.combined_issues[0].evidence), 3)

    def test_empty_results(self):
        self.assertEqual(self.combine([], []).summary.unique_issues, 0)


if __name__ == '__main__':
    unittest.main()
