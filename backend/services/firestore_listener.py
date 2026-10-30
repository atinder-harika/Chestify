"""
Firestore Listener Service
Watches for new items with status='processing' and triggers AI pipeline
Owner: Atinder Singh Hari
Review focus: Real-time Firestore listeners, duplicate protection, and processing status updates.
"""

import hashlib
import logging
import threading
from datetime import datetime, timedelta, timezone
from google.cloud.firestore_v1 import FieldFilter
from config.firebase_config import get_firestore_client
from services.video_service import extract_video_info, VideoExtractionError
from services.ai_service import analyze_content, AIAnalysisError

logger = logging.getLogger(__name__)

# Keys of items currently being processed. A key is removed when its item
# finishes, so an item set back to 'processing' (retry) runs again.
processed_items = set()
listener_status = "inactive"

# Firestore status shown by the UI for each verdict band.
VERDICT_STATUS = {
    "true": "verified",
    "half_truth": "misleading",
    "false": "false",
    "unverified": "unverified",
}

# Analyses are shared across users by video, so the same video never costs a
# second Gemini call. Bump CACHE_VERSION when the analysis format changes.
CACHE_COLLECTION = "video_cache"
CACHE_VERSION = 1
CACHE_MAX_AGE = timedelta(days=7)


def _cache_ref(db, video_key: str):
    return db.collection(CACHE_COLLECTION).document(hashlib.sha256(video_key.encode()).hexdigest())


def get_cached_analysis(db, video_key: str):
    """Return (result, created_at) for a fresh cached analysis of this video, or None."""
    snap = _cache_ref(db, video_key).get()
    if not snap.exists:
        return None
    cached = snap.to_dict() or {}
    created = cached.get("created_at")
    if cached.get("version") != CACHE_VERSION or not created or not cached.get("result"):
        return None
    if datetime.now(timezone.utc) - created > CACHE_MAX_AGE:
        return None
    return cached["result"], created


def cache_is_usable(item_data: dict, cache_created) -> bool:
    """
    New items always reuse the cache. "Check again" reuses it only when it's
    newer than the card's own analysis (or the card never had one, e.g. after
    an error); otherwise the user gets a genuinely fresh Gemini check.
    """
    check_again = item_data.get('check_again') or item_data.get('force_refresh')
    if not check_again:
        return True
    analyzed_at = item_data.get('analyzed_at')
    return analyzed_at is None or cache_created > analyzed_at


def store_cached_analysis(db, video_key: str, url: str, result: dict):
    """Cache an analysis and return its timestamp (also stored as the item's analyzed_at)."""
    created = datetime.now(timezone.utc)
    _cache_ref(db, video_key).set({
        "video_key": video_key,
        "url": url,
        "version": CACHE_VERSION,
        "created_at": created,
        "result": result,
    })
    return created


def start_firestore_listener():
    """Start background thread to listen for new items"""
    global listener_status
    listener_status = "starting"
    thread = threading.Thread(target=listen_to_firestore, daemon=True)
    thread.start()
    logger.info("Firestore listener thread started")


def listen_to_firestore():
    """
    Listen for processing items across all users.

    A collection-group listener avoids repeatedly reading every user and every
    item on a fixed polling interval.
    """
    global listener_status

    try:
        db = get_firestore_client()
        items_query = db.collection_group('items').where(
            filter=FieldFilter('status', '==', 'processing')
        )
        items_query.on_snapshot(on_processing_snapshot)
        listener_status = "active"
        logger.info("Firestore processing listener registered")

        threading.Event().wait()
    except Exception:
        listener_status = "error"
        logger.exception("Firestore listener stopped unexpectedly")


def on_processing_snapshot(col_snapshot, changes, read_time):
    """Filter processing changes, deduplicate them, and start the pipeline."""
    for change in changes:
        item_doc = change.document
        item_data = item_doc.to_dict() or {}
        if item_data.get('status') != 'processing':
            continue

        user_ref = item_doc.reference.parent.parent
        if user_ref is None:
            logger.error(f"Unable to determine user for item {item_doc.id}")
            continue
        user_id = user_ref.id
        item_key = f"{user_id}_{item_doc.id}"

        if item_key in processed_items:
            continue

        # Snapshots can arrive late (e.g. our own mid-pipeline update). Re-read
        # so a finished item is never analyzed twice.
        fresh = item_doc.reference.get()
        if not fresh.exists or (fresh.to_dict() or {}).get('status') != 'processing':
            continue

        processed_items.add(item_key)
        logger.info(f"Found processing item {item_doc.id} for user {user_id}")
        try:
            process_item(item_doc.reference, item_doc.id, fresh.to_dict())
        finally:
            processed_items.discard(item_key)


def process_item(item_ref, item_id: str, item_data: dict):
    """
    Process a single item through the AI pipeline

    Args:
        item_ref: Firestore document reference
        item_id: Item document ID
        item_data: Current item data
    """
    try:
        url = item_data.get('url')

        if not url:
            raise ValueError("No URL provided")

        logger.info(f"Extracting video info from: {url}")

        video_info = extract_video_info(url)

        # Update with video info
        item_ref.update({
            'title': video_info['title'],
            'thumbnail': video_info['thumbnail'],
            'transcript': video_info['transcript']
        })

        db = get_firestore_client()
        video_key = video_info['video_key']

        ai_result = analyzed_at = None
        try:
            cached = get_cached_analysis(db, video_key)
            if cached and cache_is_usable(item_data, cached[1]):
                ai_result, analyzed_at = cached
        except Exception:
            logger.exception("Cache lookup failed; analyzing instead")

        if ai_result:
            logger.info(f"Cache hit for {video_key}; skipping Gemini")
        else:
            logger.info(f"Analyzing content with AI: {video_info['title']}")
            ai_result = analyze_content(
                title=video_info['title'],
                transcript=video_info['transcript'],
                url=url
            )
            analyzed_at = datetime.now(timezone.utc)
            try:
                analyzed_at = store_cached_analysis(db, video_key, url, ai_result)
            except Exception:
                logger.exception("Cache write failed")

        update_data = {
            **ai_result,
            'status': VERDICT_STATUS[ai_result['verdict']],
            'error_message': '',
            'analyzed_at': analyzed_at,
            'placeholder': False,
            'check_again': False,
            'force_refresh': False
        }

        item_ref.update(update_data)

        logger.info(
            f"Item {item_id} processed successfully - "
            f"{ai_result['verdict']} ({ai_result['accuracy_score']}/10)"
        )

    except VideoExtractionError as e:
        logger.error(f"Video extraction failed for {item_id}: {str(e)}")
        item_ref.update({
            'status': 'error',
            'error_message': str(e)
        })

    except AIAnalysisError as e:
        logger.error(f"AI analysis failed for {item_id}: {str(e)}")
        item_ref.update({
            'status': 'error',
            'error_message': str(e)
        })

    except Exception as e:
        logger.error(f"Processing failed for {item_id}: {str(e)}")
        item_ref.update({
            'status': 'error',
            'error_message': f"Processing error: {str(e)}"
        })
