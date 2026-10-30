"""
AI Analysis Service using Google Gemini 2.5 Flash
Performs summarization, categorization, and fact-checking with Google Search grounding
Owner: Christain Malan
Review focus: Gemini analysis, grounded source extraction, accuracy scoring, and error handling.
"""

import os
import json
import time
import requests
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from google import genai
from google.genai import types
from typing import Any, Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

_gemini_client = None

TRANSCRIPT_LIMIT = 3000
MAX_SOURCES = 10
VERDICTS = ("true", "half_truth", "false", "unverified")
UNAVAILABLE_MESSAGE = "AI analysis is temporarily unavailable. Please retry later."


class AIAnalysisError(Exception):
    """Raised when Gemini cannot produce a usable analysis. The message is user-facing."""


def initialize_gemini():
    """Initialize Gemini API client with key from environment"""
    global _gemini_client

    if _gemini_client:
        return _gemini_client  # Already initialized

    from dotenv import load_dotenv
    load_dotenv(override=True)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("❌ GEMINI_API_KEY not found in environment variables!")
        raise ValueError("GEMINI_API_KEY not configured")

    logger.info("Gemini API key loaded")
    _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


def _domain(url: str) -> str:
    """Return the bare host of a URL (no www.), or '' if it can't be parsed."""
    try:
        host = urlparse(url).netloc.lower()
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def _resolve_redirect(url: str) -> str:
    """Follow one vertexaisearch grounding redirect to get the real article URL."""
    if "vertexaisearch.cloud.google.com" not in url:
        return url
    try:
        resp = requests.head(url, allow_redirects=False, timeout=4)
        return resp.headers.get("Location") or url
    except requests.RequestException:
        return url


def extract_grounding_sources(response: Any) -> List[Dict[str, Any]]:
    """
    Return unique web sources supplied by Gemini Search grounding, with real URLs.
    Each source also carries internal `_redirect` and `_chunks` keys (used to
    match citations, stripped before saving).
    """
    raw: List[Dict[str, Any]] = []
    by_url: Dict[str, Dict[str, Any]] = {}

    for candidate in (getattr(response, "candidates", []) or [])[:1]:
        metadata = getattr(candidate, "grounding_metadata", None)
        for index, chunk in enumerate(getattr(metadata, "grounding_chunks", []) or []):
            web = getattr(chunk, "web", None)
            url = getattr(web, "uri", None)
            if not url:
                continue
            if url not in by_url:
                by_url[url] = {"title": getattr(web, "title", None) or "", "_redirect": url, "_chunks": set()}
                raw.append(by_url[url])
            by_url[url]["_chunks"].add(index)

    raw = raw[:MAX_SOURCES]
    with ThreadPoolExecutor(max_workers=5) as pool:
        resolved = list(pool.map(lambda s: _resolve_redirect(s["_redirect"]), raw))

    for source, url in zip(raw, resolved):
        # Grounding chunk titles are usually the publisher's domain.
        domain = _domain(url) if "vertexaisearch" not in url else source["title"].lower()
        source["domain"] = domain[4:] if domain.startswith("www.") else domain
        source["url"] = url
        source["title"] = source["title"] or source["domain"]
    return raw


def _supporting_chunks(response: Any, text: str) -> set:
    """Chunk indices that Gemini's grounding supports attach to `text` in its reply."""
    chunks = set()
    text = text.strip().lower()
    if len(text) < 15:
        return chunks
    for candidate in (getattr(response, "candidates", []) or [])[:1]:
        metadata = getattr(candidate, "grounding_metadata", None)
        for support in getattr(metadata, "grounding_supports", []) or []:
            segment = (getattr(getattr(support, "segment", None), "text", "") or "").lower()
            if segment and (text[:40] in segment or (len(segment) >= 15 and segment in text)):
                chunks.update(getattr(support, "grounding_chunk_indices", []) or [])
    return chunks


def _squash(text: str) -> str:
    return "".join(ch for ch in text.lower() if ch.isalnum())


def _find_source(entry: Dict, grounded: List[Dict[str, Any]], used: set, response: Any) -> Optional[Dict]:
    """Find the grounded result a citation refers to, trying the most exact match first."""
    available = [s for s in grounded if s["url"] not in used]
    cited_url = str(entry.get("url") or entry.get("domain") or "").strip()
    domain = _domain(cited_url) if "/" in cited_url else cited_url.lower()
    domain = domain[4:] if domain.startswith("www.") else domain
    site = _squash(str(entry.get("site") or ""))

    for source in available:  # 1. the exact URL Gemini was given
        if cited_url and cited_url in (source["_redirect"], source["url"]):
            return source
    if domain and "vertexaisearch" not in domain:
        for source in available:  # 2. publisher domain
            gd = source["domain"]
            if gd and (gd == domain or gd.endswith("." + domain) or domain.endswith("." + gd)):
                return source
    if len(site) >= 3:
        for source in available:  # 3. site name, e.g. "Khan Academy" -> khanacademy.org
            label = _squash(source["domain"].rsplit(".", 1)[0])
            if label and (site in label or label in site):
                return source
    chunks = _supporting_chunks(response, str(entry.get("point") or ""))
    for source in available:  # 4. Gemini's own grounding map for that sentence
        if source["_chunks"] & chunks:
            return source
    return None


def _match_cited_sources(cited: Any, grounded: List[Dict[str, Any]], used: set, response: Any = None) -> List[Dict[str, str]]:
    """
    Keep only the sources Gemini cited that actually came from the search results,
    attaching the real URL. This stops the model from inventing citations.
    """
    matched = []
    if not isinstance(cited, list):
        return matched

    for entry in cited:
        if not isinstance(entry, dict):
            continue
        source = _find_source(entry, grounded, used, response)
        if source is None:
            continue
        matched.append({
            "title": str(entry.get("title") or source["title"])[:140],
            "domain": source["domain"],
            "url": source["url"],
            "point": str(entry.get("point", ""))[:240],
        })
        used.add(source["url"])
    return matched


def _parse_json(text: str) -> Dict:
    """Pull the JSON object out of a model reply, tolerating code fences or stray prose."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in response")
    result = json.loads(text[start:end + 1])
    if not isinstance(result, dict):
        raise ValueError("response JSON is not an object")
    return result


def _clean_score(value: Any) -> Optional[int]:
    """Return an int score in 1..10, or None when missing or invalid."""
    if value is None or isinstance(value, bool):
        return None
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    return max(1, min(10, score))


def verdict_for_score(score: Optional[int]) -> str:
    """Map an accuracy score to its band: 1-3 false, 4-6 half-truth, 7-10 true."""
    if score is None:
        return "unverified"
    if score <= 3:
        return "false"
    if score <= 6:
        return "half_truth"
    return "true"


def _normalize_result(result: Dict, sources: List[Dict[str, Any]], response: Any = None) -> Dict:
    """Validate Gemini's fields and enforce the scoring rules that code can check."""
    score = _clean_score(result.get("accuracy_score"))
    score_reason = str(result.get("score_reason") or "").strip()
    used: set = set()
    sources_against = _match_cited_sources(result.get("sources_against"), sources, used, response)
    sources_for = _match_cited_sources(result.get("sources_for"), sources, used, response)
    logger.info(
        f"Matched {len(sources_for)} supporting / {len(sources_against)} contradicting sources "
        f"from {[s['domain'] for s in sources]}"
    )
    sources = [{"title": s["title"], "url": s["url"], "domain": s["domain"]} for s in sources]

    # Rule 4: no evidence means no score.
    if not sources:
        score = None
        score_reason = "No search evidence was found, so the video was not scored."

    # Rule 2: anything above 8 needs at least two independent reliable sources.
    if score is not None and score > 8 and len({s["domain"] for s in sources_for}) < 2:
        score = 8
        score_reason = "Capped at 8: fewer than two independent sources confirm it."

    verdict = verdict_for_score(score)

    one_line = str(result.get("one_line_summary") or "").strip()
    highlight = str(result.get("highlight") or "").strip()
    if highlight and highlight.lower() not in one_line.lower():
        highlight = ""

    tags = result.get("tags") if isinstance(result.get("tags"), list) else []
    conclusion = str(result.get("conclusion") or "").strip()

    best_link = (sources_against or sources_for or sources or [{}])[0].get("url", "")
    legacy_status = {"true": "Verified", "half_truth": "Questionable",
                     "false": "False", "unverified": "Unverified"}[verdict]

    return {
        "summary": str(result.get("summary") or "").strip(),
        "category": str(result.get("category") or "Other").strip(),
        "tags": [str(t) for t in tags][:5],
        "accuracy_score": score,
        "score_reason": score_reason,
        "verdict": verdict,
        "one_line_summary": one_line,
        "highlight": highlight,
        "main_false_claim": str(result.get("main_false_claim") or "").strip(),
        "conclusion": conclusion,
        "trust_note": str(result.get("trust_note") or "").strip(),
        "sources_for": sources_for,
        "sources_against": sources_against,
        "sources": sources,
        # Kept for older clients and the chat context.
        "fact_check": {
            "status": legacy_status,
            "reason": conclusion or score_reason,
            "source_link": best_link,
        },
    }


def _build_prompt(title: str, transcript: str, url: str) -> str:
    return f"""
You are Chestify's fact-checker for short-form videos (TikTok, YouTube Shorts, Reels).
Use Google Search to check the video's claims against current, reliable evidence.

**Video:**
Title: {title}
URL: {url}
Transcript: {transcript[:TRANSCRIPT_LIMIT]}

**Step 1: find the MAIN claim** (the takeaway a viewer would repeat). Search for it.

**Step 2: give an accuracy_score from 1 to 10** for how accurate the main claim is,
based on the evidence (NOT how confident you are):
| Score | Verdict | Means |
| 1-2 | False | Main claim fabricated or debunked; strong sources directly contradict it |
| 3 | False | Main claim wrong, maybe with a small true detail mixed in |
| 4 | Half-truth | Real facts twisted into a false conclusion |
| 5 | Half-truth | Partly right and partly wrong in equal measure, or two sides each with real evidence |
| 6 | Half-truth | Mostly right, but missing important context or exaggerated |
| 7-8 | True | Accurate, with small simplifications that don't change the takeaway |
| 9-10 | True | Accurate and confirmed by several reliable, independent sources |

Rules:
1. Score the main claim, not the average. Four true details and one false main point = false.
2. Caps: central claim false -> at most 3. Spin or missing key context -> at most 6.
   Above 8 needs at least 2 independent reliable sources.
3. Weigh sources by quality, not count. Official bodies, peer-reviewed research and major
   outlets beat blogs and social posts. Sources that just repeat the video don't count.
4. No relevant evidence -> accuracy_score null. Never default to 5.
5. Opinions and jokes aren't scored; only check the factual claims inside them.

**Step 3: write the verdict for a viewer who glances at it for 2 seconds.**
- one_line_summary: one short sentence (max 15 words) stating what is actually true, focused on
  the main lie or spin. Example: the video says a celebrity donated $3.5M to the army, but he
  donated it to his own charity named after the army ->
  "X actually donated $3.5M to his own charity, not the army".
  For true videos, state the confirmed fact.
- highlight: the exact phrase copied from one_line_summary that carries the correction or key
  fact (e.g. "his own charity"). Must appear verbatim in one_line_summary.
- main_false_claim: the most incorrect claim, quoted or closely paraphrased from the video
  ("" if nothing is false).
- conclusion: one short sentence of verification a viewer can trust.
- score_reason: short note naming the rule applied, e.g. "Capped at 4: real donation, false recipient".
- trust_note: if the video presents two opposing views, say which to trust and why; else "".
- sources_for / sources_against: up to 3 each of the strongest search results that support /
  contradict the main claim. Only cite pages you actually found in search. For each give the
  publisher's site name (e.g. "Reuters"), its domain if you know it (e.g. "reuters.com"),
  the search-result URL exactly as you received it, a short title, and the point it makes
  (max 12 words).

Also give a 2-3 sentence neutral summary, ONE category from: Physics, Chemistry, Biology,
Math, Computer Science, History, Psychology, Health, Science, Technology, Politics, News,
Finance, Entertainment, Sports, Lifestyle, Business, or Other; and 3-5 short topic tags.

Return ONLY valid JSON, no markdown:
{{
  "summary": "...",
  "category": "...",
  "tags": ["...", "..."],
  "accuracy_score": 4,
  "score_reason": "max 12 words",
  "verdict": "true|half_truth|false|unverified",
  "one_line_summary": "max 15 words",
  "highlight": "2-6 words copied from one_line_summary",
  "main_false_claim": "max 20 words",
  "conclusion": "max 25 words",
  "trust_note": "",
  "sources_for": [{{"site": "...", "domain": "...", "url": "...", "title": "...", "point": "..."}}],
  "sources_against": [{{"site": "...", "domain": "...", "url": "...", "title": "...", "point": "..."}}]
}}
"""


def _is_daily_quota(error: Exception) -> bool:
    text = str(error)
    return "RESOURCE_EXHAUSTED" in text and ("PerDay" in text or "per day" in text.lower())


def _is_retryable(error: Exception) -> bool:
    text = str(error)
    if _is_daily_quota(error):
        return False
    return any(code in text for code in ("429", "RESOURCE_EXHAUSTED", "503", "UNAVAILABLE", "overloaded"))


def analyze_content(title: str, transcript: str, url: str) -> Dict:
    """
    Analyze video content with ONE grounded Gemini call.

    Args:
        title: Video title
        transcript: Video transcript/description
        url: Original video URL

    Returns:
        Dictionary with summary, category, tags, accuracy score, verdict and sources

    Raises:
        AIAnalysisError: when Gemini fails or returns something unusable
    """
    client = initialize_gemini()

    # Ground every analysis against current web sources so verdicts are based
    # on external evidence rather than the model's training data.
    config = types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())]
    )
    prompt = _build_prompt(title, transcript or "", url)
    model = os.getenv("GEMINI_FACTCHECK_MODEL", "gemini-2.5-flash")

    # Retry only short-term rate limits and overloads; a daily quota won't recover.
    max_attempts = 3
    response = None
    for attempt in range(max_attempts):
        try:
            response = client.models.generate_content(model=model, contents=prompt, config=config)
            break
        except Exception as e:
            if _is_daily_quota(e):
                logger.error(f"❌ Gemini daily quota exhausted: {str(e)[:200]}")
                raise AIAnalysisError("Daily AI quota reached. Please retry later.") from e
            if _is_retryable(e) and attempt < max_attempts - 1:
                # 503 "high demand" spikes last longer than per-minute rate limits.
                overloaded = "503" in str(e) or "UNAVAILABLE" in str(e)
                wait_time = (10, 30)[attempt] if overloaded else (2, 4)[attempt]
                logger.warning(f"⏳ Gemini busy, retrying in {wait_time}s... (attempt {attempt + 1}/{max_attempts})")
                time.sleep(wait_time)
                continue
            logger.error(f"❌ Gemini call failed: {str(e)[:300]}")
            raise AIAnalysisError(UNAVAILABLE_MESSAGE) from e

    result_text = (getattr(response, "text", None) or "").strip()
    try:
        raw = _parse_json(result_text)
    except (ValueError, json.JSONDecodeError) as e:
        logger.error(f"Failed to parse AI response as JSON: {e}")
        logger.error(f"Raw response: {result_text[:500]}")
        raise AIAnalysisError(UNAVAILABLE_MESSAGE) from e

    sources = extract_grounding_sources(response)
    result = _normalize_result(raw, sources, response)

    logger.info(
        f"✅ AI analysis completed: {result['category']} - {result['verdict']} "
        f"({result['accuracy_score']}/10, {len(sources)} sources)"
    )
    return result
