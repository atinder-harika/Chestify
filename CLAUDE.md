# Chestify: handoff notes for Claude Code

Chestify is Atinder's last-semester capstone: an AI fact-checker for short-form
videos (TikTok, YouTube Shorts, Reels). Users paste a link, and the backend pulls
the captions, fact-checks them against Google Search, and shows a verdict.

**Goal for this stretch:** a fully built, deployed prototype at
https://chestify.atinder.dev that makes it *obvious* whether a video is true,
half-true, or false, with good sources, and shows the full scope of the project.
It doesn't need to be production-grade, but real test users must be able to use it.

## Remote workflow (Atinder is away, checks only the live site from his phone)
For every task, in this order:
1. **Change:** make the change.
2. **Check locally:**
   - Frontend: `cd frontend; npx tsc --noEmit; npm run build`.
   - Backend: `backend\venv\Scripts\python.exe -m py_compile` on every changed
     file, plus offline checks of any changed logic with fake data.
   - **No Gemini calls in dev.** The quota is about 3–4 grounded calls a day,
     and Atinder does the real AI test once on the live site.
3. **Firestore rules:** if the change adds or changes Firestore data that the
   browser reads or writes, update `firestore.rules` in the same task and
   deploy with `firebase deploy --only firestore:rules` (project
   `datathon-db`, set in `.firebaserc`).
4. **Ship:** commit (never with AI co-author lines) and push to `master`.
5. **Wait and check deploys:**
   - Pages: `gh run watch` for the "Deploy frontend to GitHub Pages" run.
   - Railway: `railway logs` for the backend. Backend-only changes don't
     trigger Pages.
6. **Report:** send Atinder a short summary of what to test on
   https://chestify.atinder.dev.
7. **Stop:** don't start the next task until he replies "done".

Tools on this PC:
- `gh`: logged in as `atinder-harika`.
- `firebase` and `railway` CLIs: installed globally with npm and logged in
  once by Atinder. If either is logged out, ask him to rerun `firebase login`
  or `railway login`.

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
  Tailwind, Radix/shadcn UI. Firebase Auth (Google only in the UI so far;
  Email/Password is enabled in the console) and Firestore.
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
  3. **Cache:** the listener first looks in the backend-only `video_cache`
     collection. Entries are keyed by a sha256 of yt-dlp's `extractor_key:id`
     (e.g. `TikTok:7593294192688811277`), so share links and short links
     match. They're kept for 7 days and shared across users.
     - **New items** reuse a cache entry when one exists.
     - **"Check again"** (the `check_again` flag) reuses the cache only when
       its entry is newer than the item's `analyzed_at`. Otherwise it runs a
       fresh Gemini call.
  4. On a cache miss, `services/ai_service.py` runs **one grounded
     `gemini-2.5-flash` call** with the accuracy rubric. It returns
     `accuracy_score`, `verdict`, `one_line_summary`, `highlight`,
     `main_false_claim`, `conclusion`, `trust_note`, `score_reason`,
     `sources_for` / `sources_against` (real URLs, matched to grounding
     results), plus summary, category and tags.
  5. Item `status`: true → `verified`, half_truth → `misleading`, false →
     `false`, unverified → `unverified`. A failed check is `error`, with a
     friendly `error_message`; the UI shows it as grey Unverified with a
     "Check again" button.
- **Placeholder data:** 17 pre-rubric items have hand-written verdicts marked
  `placeholder: true`, made for UI testing. They're never cached, and any
  real check clears the flag.
- **Chat:** `POST /chat` in `main.py`, using `gemini-3.1-flash-lite` without
  grounding. It requires a Firebase ID token (`Authorization: Bearer ...`).
- **Don't run `tests/model_testing.py`.** It was a one-time check of which
  models allow grounding (only `gemini-2.5-flash` does), and it spends about
  6 grounded calls per run.

## Gemini model facts (checked Oct 2026, this key/project)
| Model | Grounded search |
|---|---|
| `gemini-2.5-flash` | works on the free tier (current default) |
| `gemini-3.x` | grounding returns 429 (no free quota); plain calls work |
| `gemini-2.5-flash-lite` | 404, "no longer available to new users" |

## Repo state
- History was rewritten (Oct 29) to remove Copilot/Claude co-author trailers and
  force-pushed. `master` is clean and in sync with GitHub. A local branch
  `backup/pre-trailer-cleanup` still holds the old history and can be deleted.
- A friend's frontend changes (new **Stats page** and an **interactive
  "new video" animation**) will be pasted in. Merge them carefully into the
  current `page.tsx` structure.
## Firestore rules (`firestore.rules`, deploy with `firebase deploy --only firestore:rules`)
- The rules currently only allow a signed-in user to read and write
  `users/{uid}` and `users/{uid}/items/*`. **Any new client-side collection
  is denied by default.** Add a rule when adding:
  - chat history, e.g. `users/{uid}/chats/{chatId}` (and its messages);
  - stats data, if the client writes or reads it outside `items`.
- Backend writes via the Firebase Admin SDK bypass the rules, so a
  backend-only `video_cache` needs no client rule. Keep it denied to clients.
- Security bar for this stretch is "reasonable prototype": per-user data
  isolation, no secrets in git, and an authenticated `/chat`. Hardening
  beyond that is out of scope for now.

## Goals (prof feedback and Atinder's own list)

### 1. Make the verdict obvious (top priority)
- **Accuracy score 1–10** on every video, shown above or below the video.
  It rates **how accurate the video's main claim is, based on the evidence**,
  not how confident the AI is. Bands (decided: **1–3 false, 4–6 half-truth,
  7–10 true**):
  - **1–3: red, False**
  - **4–6: yellow, Half-truth / misleading**
  - **7–10: green, Mostly true**
  - **No score: grey, Unverified** (no relevant evidence found)

  Rubric to put in the Gemini prompt:

  | Score | Verdict | Means |
  |---|---|---|
  | 1–2 | False | Main claim fabricated or debunked; strong sources directly contradict it |
  | 3 | False | Main claim wrong, maybe with a small true detail mixed in |
  | 4 | Half-truth | Real facts twisted into a false conclusion (the celebrity-charity example) |
  | 5 | Half-truth | Partly right and partly wrong in roughly equal measure, or two sides with real evidence for each |
  | 6 | Half-truth | Mostly right, but missing important context or exaggerated |
  | 7–8 | True | Accurate, with small simplifications or minor errors that don't change the takeaway |
  | 9–10 | True | Accurate and confirmed by several reliable, independent sources |

  Rules on top of the table, so scoring stays consistent:
  1. **Score the main claim, not the average.** Four true details and one
     false main point means false.
  2. **Caps:**
     - If the central claim is false, the score is at most 3.
     - If it's spin or missing key context, the score is at most 6.
     - Anything above 8 needs at least 2 independent reliable sources.
  3. **Weigh sources by quality, not count.** Official bodies, peer-reviewed
     research and major outlets beat blogs and social posts. Sources that just
     repeat the video don't count as independent.
  4. **No relevant evidence means no score.** Return `null` and show grey
     "Unverified". Never default to 5.
  5. **Opinions and jokes aren't scored.** Fact-check only the factual claims
     inside them.

  Gemini also returns a short `score_reason` naming the rule applied (e.g.
  "Capped at 4: real donation, false recipient"). Use it as the one-line
  conclusion and to explain scoring in the demo.
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
  single call* returns `accuracy_score` (1–10 or null),
  `score_reason`, `verdict` (true / half_truth / false / unverified), `one_line_summary`, `highlight` (the exact
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
- **Chat look:** the overflow is fixed (`d071efc`), but Atinder doesn't like
  how the chat looks yet. He'll describe what he wants.

### 4. Issues found in code review (still open)
- **Stale docs:** README/docs still mention Vercel for the frontend. It's on
  GitHub Pages.

These are fixed: fake Unverified on AI failure, daily-quota retries, the
per-video cache, `/chat` auth, Recent Activity stuck on processing, retry not
re-running, the 1000-character transcript limit, and fragile JSON parsing.

### 5. Testing
- Use a user-testing plugin or skill if one is available and not too
  token-heavy. Otherwise Atinder's friends will test manually.
- YouTube from Railway can hit "Sign in to confirm you're not a bot"
  (datacenter IP). TikTok works. A residential proxy env var for yt-dlp is
  the fallback if YouTube must work publicly.

### 6. Final polishing (low priority, after the features above)
- **Sources for absence-of-evidence verdicts:** for fabricated claims (e.g. the
  Beyoncé donation hoax, scored 2/10), Gemini cited pages about *other*
  donations as "contradicting" sources, though none address the claim.
  No extra Gemini calls are needed for either fix:
  - Have the prompt search fact-checkers first (Lead Stories, Snopes,
    Reuters, AP, PolitiFact) for the exact claim, and cite a direct debunk
    when one exists.
  - Add a third group, `sources_context` ("Related context"), for pages
    that don't address the claim, and have the one-liner say e.g. "No
    credible outlet reports this donation".

### 7. Future goals (not important now; chat works well as is)
- **Chat that knows the user's library (RAG):** today chat only knows a
  video if it was opened through "AI Analysis", which passes that one video's
  analysis as context. General chats know nothing about the user's saved
  videos. Idea: before calling `/chat`, select the user's relevant items by
  category, tags or keywords (or embeddings later), and send their stored
  `one_line_summary`, verdict, score and sources as context. That lets it
  answer "what have I saved about health?" or "which of my videos were
  false?". The analyses are already grounded, so this needs **no extra
  grounded calls**.
- **Grounded search in chat:** for explaining a topic in depth, chat could
  use Google Search grounding too. That spends the same scarce grounded quota
  (about 3–4 a day) as fact-checks, so only add it behind an explicit "Search
  the web" button, or once there's a paid tier.
- **Settings page:** the profile menu's dead "Settings" item was removed;
  add it back with the page. Basics would be:
  - **Change display name:** `updateProfile`, which is cheap.
  - **Upload a profile picture:** needs Firebase Storage, which isn't set up
    yet. Store it at `users/{uid}/avatar`, add Storage rules (owner-only, image
    types, size limit), then call `updateProfile({ photoURL })`.
  - **Email accounts:** change password and send a reset link.

## Purpose to keep in mind
Make it obvious and useful: tell **lies, half-truths, and truths** apart at a
glance, with credible sources. Every UI and prompt decision should serve that.
