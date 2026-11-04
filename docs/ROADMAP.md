# Roadmap

## Next

- Confirm every platform from production (YouTube and Instagram can block
  datacenter servers).
- Fact-check text posts (e.g. on X) and news articles, not just videos
  (experiment).

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

## Done recently

Shorter chat replies, optional web search in chat, parallel video
processing, automatic retries, clearer errors for unsupported links, stronger
sources for made-up claims, and a settings page.
