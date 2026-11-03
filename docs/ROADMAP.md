# Roadmap

## Next

- Stronger sources for made-up claims: cite fact-checkers directly when they
  exist, and separate related context from real evidence.
- Retry automatically when a platform briefly refuses to load a video.
- Settings: display name, profile picture, password.

## Later

- Chat that knows your whole library, not just one video.
- Optional web search inside chat.
- Better extraction when a video has no captions.
- Account deletion and data export.

## Scaling

- Split the background worker from the API so the API can scale without
  processing a video twice.
- Rate limits per user and at the edge.
- Separate development and production environments, with CI checks.
- Monitoring, cost alerts and Firestore backups.
