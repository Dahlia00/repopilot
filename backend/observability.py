"""Allowlisted structured metadata only: no payloads, credentials or exception text."""
import functools
import json
import logging
import time
from uuid import uuid4
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from config import settings

logger = logging.getLogger('repopilot')

def emit(event, **metadata):
    allowed = {'duration_ms', 'status', 'method', 'route', 'request_id', 'error_type', 'count'}
    log = logger.error if event.endswith('.failed') else logger.info
    log(json.dumps({'event': event, **{k: v for k, v in metadata.items() if k in allowed}}))

def stage(event):
    def decorate(function):
        @functools.wraps(function)
        async def wrapped(*args, **kwargs):
            start = time.perf_counter()
            emit(event + '.started')
            try:
                result = await function(*args, **kwargs)
            except Exception as exc:
                emit(event + '.failed', error_type=type(exc).__name__,
                    duration_ms=round((time.perf_counter()-start)*1000, 2))
                raise
            count = None
            for field in ('findings', 'tests', 'fixes', 'results', 'context_files', 'files'):
                value = getattr(result, field, None)
                if isinstance(value, list):
                    count = len(value)
                    break
            emit(event + '.completed', count=count, status=getattr(result, 'status', None),
                duration_ms=round((time.perf_counter()-start)*1000, 2))
            return result
        return wrapped
    return decorate

def install(app):
    logging.basicConfig(level=settings().log_level, format='%(message)s')
    for name in ('httpx', 'httpcore', 'openai'):
        logging.getLogger(name).setLevel(logging.WARNING)

    @app.middleware('http')
    async def timing(request: Request, call_next):
        start = time.perf_counter()
        request_id = uuid4().hex
        try:
            response = await call_next(request)
        except Exception as exc:
            emit('request.failed', request_id=request_id, error_type=type(exc).__name__)
            response = JSONResponse(status_code=500, content={'detail': 'Internal service error. Please retry.'})
        elapsed = round((time.perf_counter()-start)*1000, 2)
        response.headers['X-Request-ID'] = request_id
        response.headers['X-Process-Time-Ms'] = str(elapsed)
        route = request.scope.get('route')
        emit('request.completed', request_id=request_id, method=request.method,
            route=getattr(route, 'path', 'unmatched'), status=response.status_code, duration_ms=elapsed)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Pydantic errors can contain secret-bearing input: retain field locations only.
        return JSONResponse(status_code=422, content={'detail': [
            {'loc': e['loc'], 'type': e['type'], 'msg': 'Invalid request field.'}
            for e in exc.errors()]})
