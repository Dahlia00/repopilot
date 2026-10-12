# RepoPilot

AI-powered code review and debugging assistant — milestone 3: AI code review.

RepoPilot fetches real GitHub PR metadata and changed files, displays expandable patches, and optionally analyzes those patches with OpenAI. Public GitHub repositories work without a GitHub token. AI review requires a backend OPENAI_API_KEY. This milestone only reads and analyzes: it does not modify files or the PR, post GitHub comments, or include agents, a database, or Docker.

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
read -rs 'OPENAI_API_KEY?OpenAI API key: '
export OPENAI_API_KEY
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
7. Click **Analyze with AI**. This sends the returned filenames and patches to OpenAI and re-fetches the PR so the displayed diffs match the reviewed data.
8. Wait for findings with severity, category, file/line, title, explanation, suggested fix, confidence, and summary counts.

For the intentionally unsafe `samples/insecure_example.py`, inspect whether the model reports SQL injection in `get_user()` and unsafe empty-list indexing in `first_result()`. These are expected review targets, not hardcoded findings or guaranteed outputs. Model results may vary. If the PR changes, the reviewed code also changes.

You can also test the backend directly:

```sh
curl http://localhost:8000/health
# {"status":"ok","service":"RepoPilot API"}

curl -X POST http://localhost:8000/analyze \
  -H 'Content-Type: application/json' \
  -d '{"repository":"Dahlia00/repopilot","pull_request":1}'

# Real AI review (requires the backend API key):
curl -X POST http://localhost:8000/review \
  -H 'Content-Type: application/json' \
  -d '{"repository":"Dahlia00/repopilot","pull_request":1}'
```

The target must exist and be accessible on GitHub. No fallback or mock findings are returned.

## Configure OPENAI_API_KEY locally

The OpenAI SDK reads the key only from the backend's **OPENAI_API_KEY** environment variable. The app never includes it in responses or logs. Never put it in frontend code, a `NEXT_PUBLIC_` variable, a committed file, or documentation.

In the same zsh terminal where you will start the backend, enter your existing OpenAI API key at the hidden prompt:

```sh
read -rs 'OPENAI_API_KEY?OpenAI API key: '
export OPENAI_API_KEY
```

Then start or restart Uvicorn. The hidden prompt avoids putting the key in shell history. Your OpenAI API project must have billing/quota and access to the configured model. See the [official OpenAI quickstart](https://developers.openai.com/api/docs/quickstart).

The normal run command does not load `.env`. If you prefer an environment file, manually create `backend/.env` containing `OPENAI_API_KEY=your_existing_key`, install `python-dotenv`, and start Uvicorn with `--env-file .env` as described below. This loads the variable into the process environment. `.env` is already ignored by Git; RepoPilot creates no secret file.

Without this variable, **Fetch Pull Request** still works. **Analyze with AI** returns an actionable configuration error. To remove the variable from the current shell, run `unset OPENAI_API_KEY` and restart without an env file.

## How AI review works

- `/analyze` remains a GitHub-only retrieval endpoint.
- `/review` retrieves the real PR and delegates to the separate `backend/review.py` service.
- Every returned file with a patch is sent, with its filename and complete returned patch, in a separate request through the official `AsyncOpenAI` Python SDK. Files without patches are explicitly listed in `skipped_files`.
- The fixed model is `gpt-4.1-mini-2025-04-14`. Instructions require reviewing every changed line, hunk, and function for bugs, security vulnerabilities, edge cases, error handling, performance, and code quality, including assumptions about collections, null/empty values, indexing, and input validation. The model must continue after finding a prominent issue and return independent root causes as separate findings, up to **10 findings per changed file**, without padding the count. No tools or agents are used. Patches are treated as untrusted content, not instructions.
- The Responses API uses a strict Pydantic structured-output schema. The backend validates severity/category, confidence from 0–100, file identity, and line numbers against the new-file lines in the diff. Unknown locations use `line: null`. See [official OpenAI Structured Outputs guidance](https://developers.openai.com/api/docs/guides/structured-outputs) and the [model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
- Results are sorted by severity. Empty findings are valid; no findings are synthesized or substituted when a review fails. The response includes `reviewed_files`, `skipped_files`, and `model` alongside PR information and `findings`.
- Reviews use returned patches only, not the whole repository. Missing or partial GitHub patches limit coverage. Check recommendations before acting on them. AI requests consume your OpenAI API quota; clicking AI review again makes new requests.
- OpenAI requests set `store=False`, use a 60-second HTTP timeout, disable automatic retries, and limit output to 6,000 tokens per file. The AI phase has a five-minute overall limit after GitHub retrieval. Failures return an error rather than a partial review. The frontend waits up to six minutes.

Each finding includes `severity` (CRITICAL/HIGH/MEDIUM/LOW), `category` (Security/Bug/Performance/Error Handling/Code Quality), `file`, nullable `line`, `title`, `explanation`, `suggested_fix`, and `confidence` (0–100). All findings come from the model response; offline tests use mock API responses solely to verify the integration.

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
- **429**: GitHub rate limit (includes `Retry-After`), or OpenAI rate limit/quota
- **502**: GitHub or OpenAI connection/API errors, rejected credentials, malformed model JSON, unsupported file/line references, model refusal, or incomplete output
- **503**: missing backend `OPENAI_API_KEY` for `/review`
- **504**: GitHub timeout (10-second HTTP timeout; 45-second overall retrieval limit), or OpenAI timeout

GitHub also returns 404 for private repositories the caller cannot access, so the backend cannot prove that such a repository does not exist. See [GitHub API troubleshooting](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api).

## Checks

Backend tests exercise GitHub retrieval and the real OpenAI SDK parser with mocked HTTP responses. They need no token, API key, internet, or API spend:

```sh
cd backend
source .venv/bin/activate
python -m unittest discover -v
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
    review.py
    test_review.py
    requirements.txt
  frontend/
    app/
      globals.css
      layout.tsx
      page.tsx
      review-findings.tsx
    eslint.config.mjs
    next-env.d.ts
    next.config.ts
    package.json
    package-lock.json
    tsconfig.json
  README.md
```
