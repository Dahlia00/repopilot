# RepoPilot

AI-powered code review and debugging assistant — milestone 1: local foundation.

Returns three fixed **mock findings**: HIGH security, MEDIUM bug, and LOW code quality. No repository code is accessed. No GitHub integration, authentication, database, Docker, or LLM is included.

## Requirements

- Python 3.10 or newer
- Node.js 20.9 or newer and npm

## Run locally

From the `repopilot` project root, use two separate terminals.

### Backend (terminal 1)

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

API: http://localhost:8000 · Interactive docs: http://localhost:8000/docs

### Frontend (terminal 2)

```sh
cd frontend
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open http://localhost:3000. Enter `owner/repository` and a positive integer pull request number, then click **Analyze Pull Request**. All valid inputs return the same three mock findings.

The frontend defaults to `http://localhost:8000`. To change it, set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` and restart the frontend. CORS allows `http://localhost:3000` and `http://127.0.0.1:3000`.

## API checks

```sh
curl http://localhost:8000/health
# {"status":"ok","service":"RepoPilot API"}

curl -X POST http://localhost:8000/analyze \
  -H 'Content-Type: application/json' \
  -d '{"repository":"owner/repository","pull_request":1}'
```

Analysis returns `repository`, `pull_request`, and `findings`. Each finding contains `severity`, `category`, `title`, `explanation`, and `suggested_fix`. Invalid input returns HTTP 422.

## Frontend checks

```sh
cd frontend
npm run typecheck
npm run build
```

## Structure

```text
repopilot/
  backend/
    main.py
    requirements.txt
  frontend/
    app/
      globals.css
      layout.tsx
      page.tsx
    next-env.d.ts
    next.config.ts
    package.json
    package-lock.json
    tsconfig.json
  README.md
```
