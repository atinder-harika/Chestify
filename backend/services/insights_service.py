"""
Learning Insights Service
Builds "explore next" suggestions for the Progress tab from a user's saved videos.
Review focus: one cheap non-grounded Gemini call per user per day, cached in Firestore.
"""

import json
import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Dict, List

from services.ai_service import initialize_gemini, _parse_json

logger = logging.getLogger(__name__)

# Plain (non-grounded) calls on this model don't touch the scarce grounded
# fact-check quota used by gemini-2.5-flash.
INSIGHTS_MODEL = "gemini-3.1-flash-lite"
MIN_ITEMS = 3
MAX_SUGGESTIONS = 3


class InsightsError(Exception):
    """Raised when suggestions can't be produced. The message is user-facing."""


def _verdict(item: Dict) -> str:
    """Display verdict, matching the frontend: failed checks count as unverified."""
    if item.get("status") == "error":
        return "unverified"
    return item.get("verdict") or {
        "verified": "true", "misleading": "half_truth", "false": "false"
    }.get(item.get("status"), "unverified")


def finished_items(db, uid: str) -> List[Dict]:
    items = [d.to_dict() or {} for d in db.collection("users").document(uid).collection("items").stream()]
    return [i for i in items if i.get("status") and i.get("status") != "processing"]


def build_profile(items: List[Dict]) -> Dict:
    """Compact, prompt-sized summary of what the user has explored."""
    by_category: Dict[str, Counter] = {}
    tags = Counter()
    for item in items:
        category = (item.get("category") or "Other").strip() or "Other"
        by_category.setdefault(category, Counter())[_verdict(item)] += 1
        tags.update(str(t).lower() for t in (item.get("tags") or [])[:5])

    def _ts(item):
        created = item.get("created_at")
        return created.timestamp() if hasattr(created, "timestamp") else 0

    recent = sorted(items, key=_ts, reverse=True)[:10]
    return {
        "topics": {
            cat: {"videos": sum(c.values()), **dict(c)}
            for cat, c in sorted(by_category.items(), key=lambda kv: -sum(kv[1].values()))
        },
        "top_tags": [t for t, _ in tags.most_common(12)],
        "recent_videos": [
            {"title": (i.get("title") or "")[:90], "category": i.get("category"), "verdict": _verdict(i)}
            for i in recent
        ],
    }


def _build_prompt(profile: Dict) -> str:
    return f"""
You help users of Chestify learn safely from short-form videos (TikTok, Shorts, Reels).
Chestify fact-checks each video; here is what this user has explored and how true it was
(verdict counts per topic: true, half_truth, false, unverified):

{json.dumps(profile, ensure_ascii=False)}

Suggest up to {MAX_SUGGESTIONS} things to explore next. Each should build on topics they already watch:
a related subtopic to go deeper, or a neighbouring field. Where a topic has many false or
half_truth videos, add a short caution telling them what kind of source to trust for it
(e.g. medical bodies for health claims). Be specific and encouraging; no generic advice.

Return ONLY JSON:
{{"suggestions": [{{"topic": "max 4 words", "why": "max 20 words, refers to what they watched",
"explore": ["2-3 short subtopics"], "caution": "max 20 words, or empty string"}}]}}
"""


def _clean_suggestions(raw: Dict) -> List[Dict]:
    suggestions = raw.get("suggestions") if isinstance(raw, dict) else None
    if not isinstance(suggestions, list):
        raise ValueError("no suggestions list")
    cleaned = []
    for s in suggestions[:MAX_SUGGESTIONS]:
        if not isinstance(s, dict) or not str(s.get("topic") or "").strip():
            continue
        explore = s.get("explore") if isinstance(s.get("explore"), list) else []
        cleaned.append({
            "topic": str(s["topic"]).strip()[:60],
            "why": str(s.get("why") or "").strip()[:200],
            "explore": [str(e).strip()[:50] for e in explore if str(e).strip()][:3],
            "caution": str(s.get("caution") or "").strip()[:200],
        })
    if not cleaned:
        raise ValueError("suggestions list was empty")
    return cleaned


def get_insights(db, uid: str, client=None) -> Dict:
    """
    Return suggestions for the user, calling Gemini at most once per UTC day,
    and only when the user's finished videos changed since the last call.
    """
    items = finished_items(db, uid)
    if len(items) < MIN_ITEMS:
        return {"status": "not_enough", "suggestions": [], "needed": MIN_ITEMS - len(items)}

    ref = db.collection("users").document(uid).collection("insights").document("daily")
    snap = ref.get()
    cached = (snap.to_dict() or {}) if snap.exists else {}
    today = datetime.now(timezone.utc).date().isoformat()

    if cached.get("suggestions") and (cached.get("date") == today or cached.get("item_count") == len(items)):
        return {"status": "ok", "suggestions": cached["suggestions"], "cached": True}

    try:
        client = client or initialize_gemini()
        response = client.models.generate_content(model=INSIGHTS_MODEL, contents=_build_prompt(build_profile(items)))
        suggestions = _clean_suggestions(_parse_json((getattr(response, "text", None) or "").strip()))
    except Exception as e:
        logger.error(f"Insights failed for {uid}: {str(e)[:300]}")
        if cached.get("suggestions"):
            return {"status": "ok", "suggestions": cached["suggestions"], "cached": True, "stale": True}
        raise InsightsError("Suggestions are temporarily unavailable. Please try again later.") from e

    ref.set({
        "date": today,
        "item_count": len(items),
        "suggestions": suggestions,
        "created_at": datetime.now(timezone.utc),
    })
    logger.info(f"Insights generated for {uid}: {len(suggestions)} suggestions from {len(items)} videos")
    return {"status": "ok", "suggestions": suggestions, "cached": False}
