# Chestify System Design - Meeting Notes

## The short version

Chestify currently uses a static Next.js frontend on GitHub Pages, a FastAPI
backend on Railway, Firebase/Firestore for data and authentication, and Gemini
for AI analysis.

This is intentionally simple and inexpensive for the current demo. The main
change needed before scaling is to separate the API from the background video
and AI processing worker.

## What I would say in the meeting

> “The current deployment is a GitHub Pages frontend connected to a Dockerized
> FastAPI service on Railway. Firebase handles authentication and Firestore
> handles the data, while Gemini performs the content analysis.
>
> “To take this live, I would keep the frontend static and inexpensive, add
> authentication and rate limits, and move long-running video and AI work into
> a separate worker. The API would create a job and return immediately, while
> the worker processes it safely with retries and duplicate protection.
>
> “For development, we would use feature branches and pull requests, then
> deploy through dev, staging, and production environments. GitHub Actions
> would run the checks and deploy only approved changes.
>
> “This should be enough for an initial 10,000-user target. We would only add
> more Railway replicas, distributed rate limiting, or a more advanced queue
> after metrics show we need them. That keeps the system reliable without
> paying for unnecessary infrastructure.” 

## Main design decisions

- Keep GitHub Pages and Cloudflare for low-cost static frontend hosting.
- Keep Railway for the FastAPI API and a separate worker service.
- Keep Firebase/Firestore as the managed database and authentication layer.
- Limit expensive Gemini/video processing per user and per IP.
- Make jobs idempotent, retryable, and protected by timeouts.
- Replace public demo Firestore rules with authenticated per-user rules.
- Add monitoring for API errors, queue depth, processing time, and cost.

## Branch and deployment flow

```text
feature/* -> dev -> staging -> master
              test     test      production
```

- Pull requests run frontend and backend checks.
- `dev` is for shared development.
- `staging` is for release testing.
- Protected `master` deploys production.
- The previous successful commit remains the rollback version.

## If someone asks about 100k users

The target should be understood as 100,000 registered users, not 100,000
people processing videos at the same time. The expensive part is Gemini and
video processing, so quotas and a controlled job queue protect the budget.
The API can scale horizontally because it is stateless, while worker capacity
can be increased independently when the queue grows.

For the detailed architecture and rollout phases, see
[SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md).
