# RepoPilot

AI-powered code review and debugging assistant — milestone 2: real GitHub pull request retrieval.

RepoPilot fetches PR metadata and changed files from GitHub and displays expandable patches. Public repositories work without a token. This milestone performs no AI analysis and includes no database, authentication system, Docker, agents, or automatic fixes.

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

Open http://localhost:3000.

## Test Dahlia00/repopilot PR #1

1. Start both services using the commands above.
2. Enter **Dahlia00/repopilot** in GitHub repository.
3. Enter **1** in Pull Request number.
4. Click **Fetch Pull Request**.
5. Confirm the live PR title, number, author, open/closed state, source → target branches, changed file count, additions, and deletions appear.
6. Expand each changed file to see GitHub's patch. If GitHub omitted a patch, the UI says so.

You can also test the backend directly:

```sh
curl http://localhost:8000/health
# {"status":"ok","service":"RepoPilot API"}

curl -X POST http://localhost:8000/analyze \
  -H 'Content-Type: application/json' \
  -d '{"repository":"Dahlia00/repopilot","pull_request":1}'
```

The target must exist and be accessible on GitHub. No fallback or mock findings are returned.

## Optional GitHub token

No token is required for public repositories. To increase API limits, set an existing token in the backend's **GITHUB_TOKEN** environment variable. Tokens stay on the backend and are never returned to the browser. Do not use a `NEXT_PUBLIC_` variable for this token.

To enter an existing token without writing it to shell history, before starting the backend (zsh on macOS):

```sh
read -rs 'GITHUB_TOKEN?GitHub token: '
export GITHUB_TOKEN
```

Alternatively, put `GITHUB_TOKEN=your_existing_token` in `backend/.env` and start Uvicorn with its env-file support:

```sh
python -m pip install python-dotenv
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 --env-file .env
```

The default start command does not load `.env`. `.env` and `.env.local` are already ignored by Git. No secret file is created by this project. To return to token-free requests, run `unset GITHUB_TOKEN` and restart the backend without `--env-file`.

The frontend defaults to `http://localhost:8000`. To change it, set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` and restart the frontend. CORS allows `http://localhost:3000` and `http://127.0.0.1:3000`.

## API response

`POST /analyze` accepts `repository` in `owner/repo` format and a positive integer `pull_request`.

It returns:

- `repository`, `pull_request`, `title`, `state`, `author`
- `base_branch`, `head_branch`, `changed_files`, `additions`, `deletions`
- `files`: objects with `filename`, `status`, `additions`, `deletions`, and `patch` (null when GitHub omits it)
- `files_truncated`: whether fewer files were retrieved than the PR metadata reports

The backend requests `/repos/{owner}/{repo}/pulls/{number}` and `/repos/{owner}/{repo}/pulls/{number}/files`, paginating at 100 files per page. GitHub caps this endpoint at 3,000 files; GitHub patches may be absent or partial, so they are displayed as returned. If the PR changes during retrieval, metadata and files can differ; re-fetch to refresh. See [GitHub pull request API documentation](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests-files).

Errors use FastAPI's `detail` field:

- **422**: invalid repository format or PR number
- **404**: repository not found/inaccessible, or PR not found (a repository lookup distinguishes these)
- **429**: GitHub rate limit; includes `Retry-After` and a retry message
- **502**: GitHub connection/API errors, denied access, invalid token, or unexpected data
- **504**: GitHub timeout (10-second HTTP timeout; 45-second overall retrieval limit)

GitHub also returns 404 for private repositories the caller cannot access, so the backend cannot prove that such a repository does not exist. See [GitHub API troubleshooting](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api).

## Checks

Backend tests use mocked HTTP responses and need no token or internet:

```sh
cd backend
source .venv/bin/activate
python -m unittest -v test_github.py
python -m pip check
```

Frontend checks:

```sh
cd frontend
npm run lint
npm run build
npm run typecheck
```

Run the build before typecheck on a fresh checkout to generate Next.js route types.

## Structure

```text
repopilot/
  backend/
    main.py
    github.py
    test_github.py
    requirements.txt
  frontend/
    app/
      globals.css
      layout.tsx
      page.tsx
    eslint.config.mjs
    next-env.d.ts
    next.config.ts
    package.json
    package-lock.json
    tsconfig.json
  README.md
```
