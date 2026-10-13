# INTENTIONALLY SYNTHETIC BENCHMARK FIXTURE; never execute.
from pathlib import Path
def read_document(name):
    return (Path('/srv/docs') / name).read_text()
