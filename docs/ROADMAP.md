# Roadmap

## Next

- Confirm every platform from production (YouTube and Instagram can block
  datacenter servers).
- Fact-check text posts (e.g. on X) and news articles, not just videos
  (experiment).

## Later

- Chat that knows your whole library, not just one video.
- Understand videos without captions: transcribe speech, and read on-screen
  text from frames.
- Flag likely AI-generated or edited footage.
- Account deletion and data export.

## Scaling

- Split the background worker from the API so the API can scale without
  processing a video twice.
- Rate limits per user and at the edge.
- Separate development and production environments, with CI checks.
- Monitoring, cost alerts and Firestore backups.
- Keep the video reader up to date automatically (a weekly update check), since
  platforms change their pages often.

## Done recently

Shorter chat replies, optional web search in chat, parallel video
processing, automatic retries, clearer errors for unsupported links, stronger
sources for made-up claims, and a settings page.
