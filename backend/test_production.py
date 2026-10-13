import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from config import settings
from main import app
from observability import emit

class ProductionTests(unittest.TestCase):
    def test_read_only_default(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(settings().github_write_enabled)
            self.assertEqual(settings().log_level, 'INFO')

    def test_configuration(self):
        with patch.dict(os.environ, {'OPENAI_MODEL':'test-model','ALLOWED_ORIGINS':'https://example.test','LOG_LEVEL':'WARNING'}):
            self.assertEqual(settings().model,'test-model')
            self.assertEqual(settings().allowed_origins,('https://example.test',))

    def test_bad_configuration(self):
        for value in ('*','not-an-origin'):
            with patch.dict(os.environ, {'ALLOWED_ORIGINS':value}):
                with self.assertRaises(ValueError): settings()

    def test_version_alias_timing(self):
        with TestClient(app) as client:
            response=client.get('/api/v1/health')
            self.assertEqual(response.json(),{'status':'ok','service':'RepoPilot API'})
            self.assertGreaterEqual(float(response.headers['X-Process-Time-Ms']),0)
            self.assertEqual(len(response.headers['X-Request-ID']),32)

    def test_validation_does_not_echo_secrets(self):
        response=TestClient(app).post('/analyze',json={'repository':'secret-do-not-echo','pull_request':0})
        self.assertEqual(response.status_code,422)
        self.assertNotIn('secret-do-not-echo',response.text)
        self.assertNotIn('input',response.text)

    def test_log_metadata_allowlist(self):
        with self.assertLogs('repopilot',level='INFO') as logs:
            emit('test',status=200,api_key='do-not-log',payload='private')
        self.assertNotIn('do-not-log',str(logs.output))
        self.assertNotIn('private',str(logs.output))

    def test_scoring_extra_and_missed_findings(self):
        sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'benchmark'))
        from run_benchmark import score
        cases=[dict(case_id='a',category='Bug',expected_issue=True,expected_location={'line':3}),
               dict(case_id='b',category='Bug',expected_issue=False,expected_location=None)]
        result=score(cases,{'a':[{'category':'Bug','line':3}]*2,'b':[{'category':'Security','line':1}]})
        self.assertEqual((result['true_positives'],result['false_positives'],result['false_negatives']),(1,1,0))
        self.assertEqual(score(cases,{})['false_negatives'],1)

    def test_dataset_has_safe_and_vulnerable_cases(self):
        cases=json.loads((Path(__file__).resolve().parents[1]/'benchmark/dataset.json').read_text())
        self.assertTrue(any(not c['expected_issue'] for c in cases))
        self.assertTrue(any(c['expected_issue'] for c in cases))
        self.assertEqual(len({c['case_id'] for c in cases}),len(cases))

    def test_unexpected_error_is_sanitized(self):
        from fastapi import FastAPI
        from observability import install
        isolated=FastAPI()
        install(isolated)
        @isolated.get('/fail')
        async def fail():
            raise RuntimeError('private-token-must-not-leak')
        with self.assertLogs('repopilot',level='INFO') as logs:
            response=TestClient(isolated).get('/fail')
        self.assertEqual(response.status_code,500)
        self.assertNotIn('private-token-must-not-leak',response.text+str(logs.output))

    def test_nonliteral_write_flag_stays_disabled(self):
        with patch.dict(os.environ, {'GITHUB_WRITE_ENABLED':'yes'}):
            self.assertFalse(settings().github_write_enabled)
