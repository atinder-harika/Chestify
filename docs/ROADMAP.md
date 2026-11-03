# Roadmap

## Next

- Shorter, more to-the-point chat replies.
- Web search in chat for questions beyond a saved video.
- Check every supported platform end to end, especially X.
- Process several videos in parallel instead of one at a time.
- Stronger sources for made-up claims: cite fact-checkers directly when they
  exist, and separate related context from real evidence.
- Retry automatically when a platform briefly refuses to load a video.
- Settings: display name, profile picture, password.

## Later

- Chat that knows your whole library, not just one video.
- Better extraction when a video has no captions.
- Account deletion and data export.

## Scaling

- Split the background worker from the API so the API can scale without
  processing a video twice.
- Rate limits per user and at the edge.
- Separate development and production environments, with CI checks.
- Monitoring, cost alerts and Firestore backups.
