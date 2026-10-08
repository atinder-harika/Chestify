# Chestify Future Goals

These items are intentionally deferred while restoring the public demo.

## Product and accounts
- Restore Google sign-in and enforce private per-user chests.
- Add account deletion, data export, and privacy/terms messaging.
- Add duplicate URL detection and retry/reprocess controls.

## Video and AI
- Re-enable Google Search grounding after configuring a project with grounding quota/billing; do not present ungrounded analysis as fact-checked.
- Add TikTok, Instagram, and X support.
- Improve transcript extraction when captions are unavailable.
- Evaluate Gemini against curated true/false claims.
- Validate structured AI output and improve source-quality checks.
- Add a review path for uncertain or high-impact health claims.
- Implement "Chat with Chest" retrieval across a user's items.

## Security and reliability
- Rotate old credentials and verify no secrets are tracked or logged.
- Restrict Firestore rules to authenticated users after private chests launch.
- Restrict CORS to the deployed frontend origin.
- Add idempotency, retry limits, and a dead-letter/error workflow.
- Add Firestore backup/export procedures.

## Deployment and DevOps
- Deploy the static frontend to GitHub Pages.
- Deploy the Python worker/API to Railway.
- Configure chestify.atinder.dev through Cloudflare DNS.
- Add separate development and production environments.
- Protect master as production and use dev for development.
- Add GitHub Actions for frontend and backend checks.
- Add rollback documentation, uptime monitoring, and cost alerts.

## UX and polish
- Improve loading, error, empty-state, retry, mobile, and accessibility UX.
- Add processing progress and large-library pagination.
- Add analytics only after privacy requirements are defined.