# Demo videos for the capstone showcase

Researched 2026-10-29 with web search and published fact-checks only. No Gemini
calls, no Chestify backend. Every URL below was checked locally with the
project's own `yt-dlp` (`backend/venv/Scripts/yt-dlp.exe -J <url>`): it
resolves, and the caption, description or subtitle track that the backend reads
states the claim.

**Grounded Gemini budget:** about 3–4 calls a day, so run the top picks once
before the presentation and let the per-video cache (or the saved library items)
cover the live demo.

## Quick list

| # | Topic | Platform | Expected verdict | Rough score |
|---|---|---|---|---|
| 1 | Beyoncé pays for Renee Good's kids (AI video) | TikTok | False (red) | 1 |
| 2 | "Real footage" of where food and air pipes split | X | False (red) | 1–2 |
| 3 | "Massive protest erupting in Greece" (2025 footage) | X | Half-truth / misleading (yellow) | 3–4 |
| 4 | "This is the guy that died at Six Flags" (2024 Arizona clip) | X | Half-truth / misleading (yellow) | 4 |
| 5 | Tuberville says many pilots are furries | X | True (green) | 8–9 |

**Suggested demo order:** 1 → 4 → 5. That's one red, one yellow and one green, all celebrity or viral
news that people actually forward. Use 2 and 3 as backups or as extra examples.

## Why most picks are on X, not TikTok

Most TikToks that fact-checkers debunk get removed or region-locked. yt-dlp
returned *"Your IP address is blocked from accessing this post"* for 8 of the
11 debunked TikToks I tried. The X originals of the same viral claims resolve
fine, and `backend/services/video_service.py` already accepts `x.com` and
`twitter.com` links. Two caveats:

- **Not tested from Railway.** X worked from this machine, but I didn't check it from
  Railway's datacenter IP. Run one X link through the deployed app before the
  presentation.
- **UI label.** `frontend/app/page.tsx:837` labels any URL that isn't YouTube
  or Instagram as "TikTok", so X links will show a "TikTok" badge.

---

## 1. Beyoncé "will cover all expenses" for Renee Good's children: FALSE

- **URL:** https://www.tiktok.com/@royalsecrets1/video/7593294192688811277
- **Claim:** Beyoncé announced she will pay all expenses for Renee Good's three
  children until they reach adulthood.
- **Expected:** False, about **1** (fabricated: there's no announcement, and the voice is AI).
- **Fact-check:** Lead Stories, Jan 11, 2026:
  https://leadstories.com/hoax-alert/2026/01/fact-check-beyonce-renee-good-children-expenses.html
  (The creator labeled the video AI-generated. Neither Beyoncé nor her BeyGOOD foundation
  made any such announcement.)
- **Verified:** resolves, posted 2026-01-09, about 355K views. There's no subtitle track,
  but the **description states the claim** ("#Beyoncé has stated that she is willing
  to cover all expenses…"), and the backend falls back to it.
- **Why it's a good demo:** a classic fake celebrity donation story with a
  sympathetic angle, which is exactly what people forward. It shows the red X overlay and a
  clean "no such announcement" one-line summary.

## 2. "Real footage" of where your food and air pipes split: FALSE (health)

- **URL:** https://x.com/Doctors__squad/status/2113991739296166387
- **Claim:** "Real Footage: The Junction Where Your Food and Air Pipes Split"
  (presented as real endoscopic camera footage).
- **Expected:** False, about **1–2** (AI-generated, and the anatomy is wrong).
- **Fact-check:** Lead Stories, Oct 26, 2026:
  https://leadstories.com/hoax-alert/2026/10/fact-check-fake-footage-showing-junction-where-your-food-and-air-pipes-split-is-ai-generated.html
- **Verified:** resolves, posted 2026-10-24, **about 15.5M views**, 10 s long. The claim is in
  the post text. The video has no speech.
- **Why it's a good demo:** a huge-reach "medical educator" account posting fake
  medical footage. It's the health-misinformation example, and it's harmless and
  not political.
- **Caveat:** it's a "fake footage" claim rather than a "miracle cure" claim.
  Fact-checks of health *advice* videos from 2026 that still resolve were hard to find.
  Every candidate was removed, image-only, or text-only.

## 3. "Massive protest erupting in Greece, media silent": HALF-TRUTH / MISLEADING

- **URL:** https://x.com/realgerhardtvdm/status/2107635699138568213
- **Claim:** "THE MEDIA IS SILENT ON THIS AGAIN: Massive protest erupting in
  Greece, everything in the country is at a stand still." (posted Oct 2026)
- **Expected:** Half-truth / misleading, about **3–4**. The footage is real and shows a
  genuinely huge Greek protest, but from **Feb 28, 2025** (the Tempi train-crash
  rally, which the media covered heavily), not Oct 2026. Gemini may land on a 3 (false,
  "central claim wrong") or a 4 ("real facts twisted"). Either is defensible.
- **Fact-check:** Lead Stories, Oct 8, 2026:
  https://leadstories.com/hoax-alert/2026/10/fact-check-video-does-not-show-protests-in-greece-in-2026.html
- **Verified:** resolves, posted 2026-10-07, about 287K views. The claim is in the post text.
- **Why it's a good demo:** the "protest footage out of context" case the
  professor asked for. The highlight phrase writes itself: the footage is
  actually **from February 2025**.
- **Optional pairing:** the original Feb 28, 2025 post of the same footage from
  Greek outlet News 24/7 also resolves
  (https://x.com/News247gr/status/1895405206755750004, about 6.9M views). Its caption
  is in Greek, so treat it as untested.

## 4. "This is the guy that died at Six Flags": HALF-TRUTH / MISLEADING

- **URL:** https://x.com/its_The_Dr/status/2110350774215585933
- **Claim:** The video shows the man who died on a Six Flags (Atlanta) roller
  coaster, and it suggests he stood up out of his seat.
- **Expected:** Half-truth, about **4**. The death is **real** (police identified
  Hassan Kariem, 42), but the footage is a **Nov 2024 incident at Castles N'
  Coasters in Phoenix, Arizona**, and witnesses said he fell, not that he stood up.
  Real event, wrong video, false implication.
- **Fact-check:** Lead Stories, Oct 14, 2026:
  https://leadstories.com/hoax-alert/2026/10/fact-check-video-does-not-show-man-standing-up-on-six-flags-roller-coaster-before-his-death-in-atlanta-2024-video-from-arizona.html
  (original footage: ABC7, Nov 28, 2024,
  https://abc7.com/post/video-shows-man-jump-off-roller-coaster-after-lap-bar-unlocks-mid-ride-castles-coasters-phoenix-arizona/15599427/)
- **Verified:** resolves, posted 2026-10-14, about 1.3M views, 65 s long, **has an English
  subtitle track** and the claim in the post text.
- **Why it's a good demo:** it's this month's viral news, and it's the clearest example of the
  rubric's "4: real facts twisted into a false conclusion". It shows the
  yellow verdict and the "which part is true, which part is false" explanation.

## 5. Tuberville says many pilots and flight attendants are furries: TRUE

- **URL:** https://x.com/allenanalysis/status/2102812468078682462
- **Claim:** Sen. Tommy Tuberville said on the Senate floor that "many" airline
  pilots, flight attendants and air traffic controllers are part of the furry
  community.
- **Expected:** True, about **8–9** (confirmed by C-SPAN2 footage of the Sept 22,
  2026 Senate session, which a fact-checker independently checked).
- **Fact-check:** Lead Stories, Sep 24, 2026 ("Yes, that's true", "Video Proof"):
  https://leadstories.com/hoax-alert/2026/09/fact-check-senator-tommy-tuberville-did-say-many-pilots-flight-attendants-air-traffic-controllers-furry.html
- **Verified:** resolves, posted 2026-09-23, about 3.6M views, 30 s long, **has an English
  subtitle track**, and the post text quotes him.
- **Why it's a good demo:** it sounds fake but is real, which proves the tool doesn't just
  flag everything weird as false. It's funny rather than divisive.
- **Caveat (worth explaining in the demo):** the *video's* claim ("he said this")
  is true, but *what he said* is unsupported. If Gemini scores the furry claim
  instead of the quote, it may come back yellow or red. That's a good talking point for
  rule 1 ("score the main claim"). If you want a guaranteed green, run it once
  beforehand and check.

---

## Checked and rejected

| Candidate | Fact-check | Why rejected |
|---|---|---|
| Trump "has 4 days left" after vein diagnosis (TikTok, half-truth) | [PolitiFact, Jul 2025](https://politifact.com/factchecks/2025/jul/21/tiktok-posts/4-days-left-tiktoks-exaggerate-the-danger-of-presi/) | Both TikToks (`@patrickontik/video/7528880989351775543`, `@ogmightyjohnson2x/video/7529283247352679711`) are IP-blocked or removed. It would be the ideal half-truth if a live copy turns up. |
| Fake RFK Jr. quote, "Infertility is genetic…" (TikTok) | [Lead Stories, Jul 2026](https://leadstories.com/hoax-alert/2026/07/fact-check-robert-f-kennedy-jr-did-not-say-infertility-is-genetic-if-your-parents-couldnt-have-kids-then-you-wont-either.html) | Resolves (`@nic6867/video/7662554667745824018`), but the claim is only on-screen text. The description is just "07.14", so the backend gets nothing to check. |
| Bikers "on the way to California to back ICE" (TikTok) | [Lead Stories, Jun 2025](https://leadstories.com/hoax-alert/2025/06/fact-check-video-documents-bikers-headed-to-california-to-back-ice.html) | Resolves (`@conservative_gator/video/7514499358545481006`), but its description is empty and the claim is on-screen text only. |
| "Laser beams" before the Venezuela quake (TikTok) | [Lead Stories, Jun 2026](https://leadstories.com/hoax-alert/2026/06/fact-check-laser-beam-video-labeled-instant-before-the-venezuela-earthquake-struck-published-on-tiktok-months-before-quake.html) | The TikTok resolves, but its own caption makes no earthquake claim. The claim was added on X. |
| £10 GP charge / King Charles deepfakes (TikTok) | [Full Fact](https://fullfact.org/health/gp-charge-10-pounds-false/) | TikToks are IP-blocked or removed, and the topics are UK-only. |
| Hantavirus cruise "infected" videos (TikTok) | [PolitiFact, May 2026](https://politifact.com/factchecks/2026/may/13/tiktok-posts/hantavirus-infectados-imagenes-crucero/) | Claim videos are IP-blocked or removed, and the claim is in Spanish. |
| Fred Savage death hoax (TikTok) | [Lead Stories, Sep 2026](https://leadstories.com/hoax-alert/2026/09/fact-check-fred-savage-not-dead-age-50.html) | It's a TikTok **photo** post, which yt-dlp doesn't support. |
| Ed Sheeran donates tickets to veterans | [Lead Stories, Sep 2026](https://leadstories.com/hoax-alert/2026/09/fact-check-ed-sheeran-did-not-donate-thousands-of-unsold-tickets-to-his-us-concerts-to-veterans.html) | Only image and text posts, no video. |

Note: Snopes, AFP and Reuters fact-check pages couldn't be fetched (paywalled
or blocked to automated fetches), so the picks lean on Lead Stories, PolitiFact
and Full Fact.
