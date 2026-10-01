# Chestify: Simple System Design for Launch

## 1. Purpose

This document describes a low-cost path from the current Chestify demo to a
reliable production system that can support approximately 10,000 users first
and scale toward 100,000 users without redesigning the product.

The goal is not to run 100,000 users on day one. The goal is to keep the first
version simple, put limits around expensive work, and add infrastructure only
when measured traffic requires it.

## 2. Current deployment

Today the system is:

- **Frontend:** Next.js static export deployed to GitHub Pages by
  `.github/workflows/deploy-pages.yml`.
- **Backend:** FastAPI in a Docker container deployed to Railway from the
  `backend` directory.
- **Data and authentication:** Firebase Authentication and Cloud Firestore.
- **AI and video processing:** Gemini and `yt-dlp`.
- **Background processing:** The backend starts a Firestore polling listener
  in the same process as the HTTP API.
- **DNS:** A custom frontend domain can be placed behind Cloudflare.

This is a good low-cost demo architecture. The main production concern is that
the API process and the background listener currently scale together. Running
multiple API replicas would create multiple listeners and could process the
same item more than once.

## 3. Target architecture

```text
User
  |
  v
GitHub Pages / Cloudflare CDN (static Next.js frontend)
  |                         \
  | HTTPS + Firebase Auth    \ direct Firestore reads for permitted data
  v                           v
Cloudflare rate limit ---> Railway API service (FastAPI, stateless)
                                |
                                | enqueue/update job
                                v
                         Firestore job collection
                                |
                                v
                         Railway worker service
                         (one or more replicas)
                           |          |
                           v          v
                      yt-dlp       Gemini API
                           \          /
                            v        v
                         Firestore results
```

### Responsibilities

**Frontend**

- Remains a static site on GitHub Pages.
- Uses Firebase Authentication for sign-in.
- Reads only the data the signed-in user is allowed to read.
- Calls the API for operations that need server-side secrets or processing.
- Never contains the Gemini key or Firebase service-account credentials.

**API service**

- Stays stateless so Railway can restart or add replicas safely.
- Verifies Firebase ID tokens on protected endpoints.
- Validates URLs, request sizes, and allowed operations.
- Creates an idempotent processing job instead of doing long AI/video work in
  the request.
- Returns a job ID immediately and exposes job status.

**Worker service**

- Runs separately from the API.
- Claims queued jobs using a Firestore transaction.
- Performs video extraction and Gemini calls.
- Writes `processing`, `completed`, or `failed` status and a safe error message.
- Uses a lease/timeout so a crashed worker's job can be retried.
- Is the only service that runs the Firestore processing listener/queue loop.

**Firestore**

- Stores users, submitted items, jobs, and analysis results.
- Uses per-user collections or a `userId` field with rules that require the
  authenticated user to match.
- Uses document IDs or a URL hash for duplicate detection and idempotency.
- Keeps large transcripts or raw media out of hot documents where possible.

## 4. Capacity and cost strategy

The expensive operation is not serving the frontend; it is video extraction
and Gemini analysis. Capacity should therefore be controlled at the job
boundary.

### Initial production limits

- One small Railway API instance.
- One small Railway worker instance.
- One worker job at a time initially; increase concurrency only after measuring
  Gemini quota, memory, and processing time.
- Per-user daily processing quota, such as 5-10 videos.
- Per-IP request limit for unauthenticated endpoints.
- Maximum URL length, prompt/context length, and request body size.
- A global queue limit that returns `429 Too Many Requests` when the system is
  full.
- Job timeout and retry limit (for example, three attempts), followed by a
  visible `failed` state.

These limits make a 10,000-user product practical when most users are
occasional users. “100,000 users” should be treated as registered users; active
daily users and videos processed per day determine the real bill.

### Keep it almost free

1. Keep the frontend static on GitHub Pages and cache it through Cloudflare.
2. Use Firebase/Firestore pay-as-you-go with indexes and queries kept small.
3. Keep Railway at one API and one worker until traffic or queue age requires
   more capacity.
4. Prefer Gemini's lower-cost model for normal analysis and reserve stronger
   models for explicit retry/review flows.
5. Cache a completed analysis by normalized video URL so duplicate submissions
   do not trigger another AI call.
6. Add a budget alert and usage dashboard before increasing limits.
7. Do not add Redis, Kafka, Kubernetes, or a separate database at the start.

If distributed rate limiting is needed before the API has multiple replicas,
use Cloudflare's edge rate limiting. Add a small managed Redis instance (for
example, Upstash) only when edge limits and Firestore transactions are no
longer sufficient.

## 5. Reliability and security rules

- Require Firebase authentication for creating jobs and reading private items.
- Replace the current public demo Firestore rules before private data launches.
- Restrict CORS to the production frontend and local development origins.
- Keep all Railway secrets in Railway variables; never commit service-account
  JSON or API keys.
- Validate Gemini output against a typed schema before storing it.
- Make job creation idempotent using `(userId, normalizedUrl)` or a request
  idempotency key.
- Use structured logs with request ID, user ID, job ID, duration, and outcome;
  never log tokens, prompts containing private data, or service credentials.
- Expose `/health` for process health and add an external uptime check.
- Store only safe, user-facing failure messages; keep provider details in
  restricted logs.
- Define retention and deletion behavior for videos, transcripts, and account
  data before the public launch.

## 6. Branching and CI/CD

Use three long-lived environments with short-lived feature branches:

```text
feature/*  ->  dev  ->  staging  ->  master
              test      test          production
```

Recommended rules:

- **`feature/*`:** pull request only; run frontend lint/build and backend
  checks.
- **`dev`:** shared development environment with non-production Firebase data
  and Railway variables.
- **`staging`:** production-like smoke testing and release candidate checks.
- **`master`:** protected production branch; merge only through an approved PR
  with passing checks.

GitHub Actions should provide:

1. **PR checks:** `npm ci`, frontend lint, frontend build, Python dependency
   install, and backend import/health tests.
2. **Deploy dev:** merge to `dev` deploys the dev frontend/backend.
3. **Deploy staging:** merge to `staging` deploys staging after checks pass.
4. **Deploy production:** merge to `master` deploys GitHub Pages and Railway.
5. **Manual rollback:** redeploy the previous known-good Git commit/image.

Railway should use separate services or projects for dev, staging, and
production so a test cannot modify production Firestore data. The worker and
API may share the same Docker image, but they must have different start
commands and separate Railway services.

## 7. Rollout plan

### Phase 1: harden the existing demo

- Add backend and frontend CI checks.
- Protect `master` and document the deploy process.
- Add `/health` monitoring and Railway/Gemini/Firestore budget alerts.
- Add authentication checks, strict CORS, input validation, and basic limits.
- Keep the current single-process deployment while validating product usage.

### Phase 2: make processing safe to scale

- Move the Firestore listener into a dedicated worker service.
- Add job states, leases, retries, idempotency, and duplicate URL detection.
- Return job status to the frontend instead of waiting for AI work in an HTTP
  request.
- Replace public demo Firestore rules with per-user rules.

### Phase 3: support 10k users

- Add Cloudflare caching and edge rate limits.
- Add one API replica only if latency or availability requires it.
- Increase worker count based on queue age and provider quotas, not guesses.
- Add dashboards for request rate, errors, queue depth, job duration, and cost.

### Phase 4: approach 100k registered users

- Add multiple stateless API replicas behind Railway's routing.
- Add distributed rate limiting if Cloudflare limits are insufficient.
- Partition hot Firestore queries by user and time; review indexes and quotas.
- Move very large transcripts/results to object storage if Firestore documents
  become expensive or approach size limits.
- Re-evaluate the worker queue and provider contracts using real metrics.

## 8. Operational success criteria

The system is ready for the next phase when these are measurable:

- API availability and health checks remain above 99.5% over a rolling month.
- No job is processed more than once without an explicit retry.
- 95th-percentile API response time is below 500 ms for non-processing requests.
- Queue age and failure rate have alerts.
- A failed deployment can be rolled back to the previous version in minutes.
- Monthly spend has an alert threshold and an owner.

The central design decision is to scale **stateless API capacity** and
**background processing capacity** independently. Everything else can remain
managed and small until real traffic proves it needs to grow.
