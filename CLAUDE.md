# Chestify: handoff notes for Claude Code

Chestify is Atinder's last-semester capstone: an AI fact-checker for short-form
videos (TikTok, YouTube Shorts, Reels). Users paste a link, and the backend pulls
the captions, fact-checks them against Google Search, and shows a verdict.

**Goal for this stretch:** a fully built, deployed prototype at
https://chestify.atinder.dev that makes it *obvious* whether a video is true,
half-true, or false, with good sources, and shows the full scope of the project.
It doesn't need to be production-grade, but real test users must be able to use it.

## Hard rules
- **No AI attribution in git.** Never add `Co-Authored-By: Claude`, `Copilot`,
  `Claude-Session`, or similar trailers to commits or PRs. AI contributors are
  not allowed in this repo.
- **Gemini budget is tight.** The free tier gets exhausted quickly by search
  grounding. Keep it to one grounded Gemini call per video. Don't build anything
  that calls Gemini per frame, per claim, or on every page load.
- **Keep yt-dlp** for metadata and captions across platforms. Don't replace it
  with Gemini video understanding.

## Architecture
- **frontend/**: Next.js (static export, `output: "export"`), TypeScript,
  Tailwind, Radix/shadcn UI. Firebase Auth (Google only today) and Firestore.
  Almost everything is in `frontend/app/page.tsx` (~1000 lines, tabs:
  library / add / chat). Deployed to GitHub Pages by
  `.github/workflows/deploy-pages.yml` on every push to `master`. The
  `NEXT_PUBLIC_*` values are GitHub repo variables.
- **backend/**: FastAPI on Railway (`backend/Dockerfile`, which includes Deno
  for yt-dlp). Env vars: `GEMINI_API_KEY`, `FIREBASE_CREDENTIALS_JSON`,
  `ENVIRONMENT`, optional `GEMINI_FACTCHECK_MODEL`.
- **Pipeline:** the frontend writes `users/{uid}/items/{id}` with
  `status: 'processing'`.
  1. `services/firestore_listener.py` picks it up with a collection-group listener.
  2. `services/video_service.py` runs yt-dlp. It downloads and parses the
     English caption track (json3/vtt/xml) and falls back to the description.
  3. `services/ai_service.py` runs **one grounded `gemini-2.5-flash` call**,
     which returns JSON: summary, category, tags, `fact_check{status, reason,
     source_link}`, `urgency_score`, plus grounding `sources`.
  4. The listener maps the result to the UI status
     (`verified` / `misleading` / `unverified` / `error`).
- **Chat:** `POST /chat` in `main.py`, using `gemini-3.1-flash-lite` without
  grounding.
- **Test the pipeline locally:**
  `cd backend; venv\Scripts\activate; python tests/model_testing.py [url]`.
  It shows which models allow grounding for the key, then runs the real
  pipeline on one URL.

## Gemini model facts (checked Oct 2026, this key/project)
| Model | Grounded search |
|---|---|
| `gemini-2.5-flash` | works on the free tier (current default) |
| `gemini-3.x` | grounding returns 429 (no free quota); plain calls work |
| `gemini-2.5-flash-lite` | 404, "no longer available to new users" |

## Repo state to sort out first
- Commit history was rewritten locally to remove Copilot/Claude co-author
  trailers. Local `master` has **diverged** from `origin/master` (18 ahead, 18
  behind), and that's expected. **Don't `git pull`.** Push with
  `git push --force-with-lease origin master`. The old history is kept in
  `backup/pre-trailer-cleanup`, which can be deleted once GitHub looks right.
- A friend's frontend changes (new **Stats page** and an **interactive
  "new video" animation**) will be pasted in. Merge them carefully into the
  current `page.tsx` structure.

## Goals (prof feedback and Atinder's own list)

### 1. Make the verdict obvious (top priority)
- **Confidence score 1–10** on every video, shown above or below the video:
  - **1–4: red, False**
  - **5–6: yellow, Half-truth / misleading**
  - **7–10: green, Mostly true**
  (Atinder said "1-4 red, 4-6 yellow", so the overlap at 4 is resolved as red.
  Confirm with him.)
- **Red X overlay on the thumbnail** for false videos, with matching cues for
  yellow and green.
- **One-line summary statement** that focuses on the *main* lie or spin, with
  the key phrase highlighted in the verdict color. Example: a video claims
  "X celebrity donated $3.5M to the army", and search finds that he donated it
  to his own charity named after the army. The output should be:
  > X celebrity actually donated $3.5M to **his own charity** *(in red)*
- **Short verification text:** about one sentence in the thumbnail card, plus
  a short **conclusion** line.
- **Highlight the most incorrect claim** in the video for impact.
- **Videos showing two opposing views:** say what to trust and why.
- **Good sources:** cite the strongest supporting and contradicting sources.
  Grounding chunk URIs are often `vertexaisearch.cloud.google.com` redirect
  links, so resolve them or show the source title/domain so citations look
  credible.
- **Implementation:** rewrite the prompt in `ai_service.py` so the *same
  single call* returns `confidence_score`, `verdict`
  (true / half_truth / false), `one_line_summary`, `highlight` (the exact
  phrase to color), `main_false_claim`, `conclusion`, and
  `sources_for` / `sources_against`. Update the listener's status mapping and
  the frontend types and filters (they currently use
  Verified/Questionable/False/Unverified).
- **Demo content:** find compromised or suspicious videos (partly true, partly
  false, or two conflicting views) for the capstone showcase.

### 2. Features
- **Stats page** (friend's frontend): usage stats, mainly *how much the user
  has explored each topic*. It needs backend/Firestore data, e.g. per-user
  counts by category and tag, built from the existing `category`/`tags` fields
  (cheap, no extra Gemini calls).
- **New-video animation** (friend's frontend): wire it to the real
  processing state.
- **Chat history:** persist chat messages (e.g. `users/{uid}/chats/...`) and
  reload them. Chat is good for clarifying a video's facts, so keep the "ask
  about this video" flow.
- **Email + password login** alongside Google: Firebase Auth email/password
  (enable it in Firebase console → Authentication → Sign-in method), with
  sign-up, sign-in and password reset.

### 3. Bugs reported
- **Chat layout:** when a chat gets long, the background doesn't extend or
  repeat, and the footer stays fixed, so the chat box "leaks" below it. Fix
  the layout so the messages area scrolls inside a fixed-height container.

### 4. Issues found in code review (not yet fixed)
- **Fake "Unverified" on AI failure:** `get_fallback_analysis()` in
  `ai_service.py` returns a placeholder when Gemini errors or hits quota, and
  the listener logs "processed successfully". The item should be set to
  `error` with a friendly "AI analysis temporarily unavailable, retry later"
  message.
- **Pointless retries:** a daily-quota 429 is retried 3 times. Don't retry
  `RESOURCE_EXHAUSTED` daily limits.
- **No per-video cache:** the same URL analyzed by two users calls Gemini
  twice. Cache results by normalized URL (e.g. a `video_cache/{hash}` doc).
- **`/chat` has no auth:** anyone can call it and burn the Gemini quota.
  Verify the Firebase ID token (send `Authorization: Bearer <idToken>` from
  the frontend and use `firebase_admin.auth.verify_id_token` in the backend).
- **"Recent activity" shows unverified/error items as processing forever:**
  `page.tsx` ~line 237 maps any status that isn't verified/misleading to
  `'processing'`.
- **Retry may not re-run:** `processed_items` in the listener is an
  in-memory set that is never cleared, so an item set back to `processing`
  isn't reprocessed until the server restarts. Remove the key when an item
  finishes.
- **Transcript truncated:** only the first 1000 characters go into the
  prompt. Fine for Shorts, but consider ~3000.
- **Fragile JSON parsing** (code-fence stripping). Validate the fields and
  fall back cleanly.
- **Stale docs:** README/docs still mention Vercel for the frontend. It's on
  GitHub Pages.

### 5. Testing
- Use a user-testing plugin or skill if one is available and not too
  token-heavy. Otherwise Atinder's friends will test manually.
- YouTube from Railway can hit "Sign in to confirm you're not a bot"
  (datacenter IP). TikTok works. A residential proxy env var for yt-dlp is
  the fallback if YouTube must work publicly.

## Purpose to keep in mind
Make it obvious and useful: tell **lies, half-truths, and truths** apart at a
glance, with credible sources. Every UI and prompt decision should serve that.
