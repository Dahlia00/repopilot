"""Scan production backend modules, excluding offline test fixtures explicitly."""
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
# test_generation.py is a production service, not a unit test.
excluded = [root / 'backend/.venv', *(
    p for p in (root/'backend').glob('test_*.py') if p.name != 'test_generation.py')]
command = [sys.executable, '-m', 'bandit', '-r', str(root/'backend'),
           '-x', ','.join(str(p) for p in excluded), '-ll']
raise SystemExit(subprocess.run(command, cwd=root, check=False).returncode)
