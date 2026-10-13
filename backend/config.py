"""Non-secret deployment settings. Credentials remain environment-only."""
import os
from dataclasses import dataclass

@dataclass(frozen=True)
class Settings:
    model: str
    allowed_origins: tuple[str, ...]
    log_level: str
    github_write_enabled: bool

def settings() -> Settings:
    level = os.getenv('LOG_LEVEL', 'INFO').upper()
    if level not in {'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'}:
        raise ValueError('LOG_LEVEL must be a standard logging level.')
    origins = tuple(x.strip() for x in os.getenv('ALLOWED_ORIGINS',
        'http://localhost:3000,http://127.0.0.1:3000').split(',') if x.strip())
    if any(not x.startswith(('http://', 'https://')) or '*' in x for x in origins):
        raise ValueError('ALLOWED_ORIGINS must contain explicit HTTP(S) origins.')
    model = os.getenv('OPENAI_MODEL', 'gpt-4.1-mini-2025-04-14').strip()
    if not model or len(model) > 150:
        raise ValueError('OPENAI_MODEL must be a nonempty model identifier.')
    return Settings(model, origins, level,
        os.getenv('GITHUB_WRITE_ENABLED', 'false').strip().lower() == 'true')
