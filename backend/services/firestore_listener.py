"""
Firestore Listener Service
Watches for new items with status='processing' and triggers AI pipeline
"""

import logging
import threading
from google.cloud.firestore_v1 import FieldFilter
from config.firebase_config import get_firestore_client
from services.video_service import extract_video_info, VideoExtractionError
from services.ai_service import analyze_content

logger = logging.getLogger(__name__)

# Track processed items to avoid duplicates
processed_items = set()
listener_status = "inactive"


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
        demo_query = db.collection('demo_items').where(
            filter=FieldFilter('status', '==', 'processing')
        )
        items_query.on_snapshot(on_processing_snapshot)
        demo_query.on_snapshot(on_demo_snapshot)
        listener_status = "active"
        logger.info("Firestore processing listeners registered")

        # Keep this daemon thread alive while the Firestore SDK owns the listener.
        threading.Event().wait()
    except Exception:
        listener_status = "error"
        logger.exception("Firestore listener stopped unexpectedly")


def on_processing_snapshot(col_snapshot, changes, read_time):
    """Process newly added or changed documents requiring analysis."""
    for change in changes:
        item_doc = change.document
        item_data = item_doc.to_dict()
        if item_data.get('status') != 'processing':
            continue

        user_ref = item_doc.reference.parent.parent
        if user_ref is None:
            logger.error("Unable to determine user for item %s", item_doc.id)
            continue

        user_id = user_ref.id
        item_key = f"{user_id}_{item_doc.id}"
        if item_key in processed_items:
            continue

        processed_items.add(item_key)
        logger.info("Found processing item %s for user %s", item_doc.id, user_id)
        process_item(item_doc.reference, item_doc.id, item_data)


def on_demo_snapshot(col_snapshot, changes, read_time):
    """Process newly added or changed shared demo documents."""
    for change in changes:
        item_doc = change.document
        item_data = item_doc.to_dict()
        if item_data.get('status') != 'processing':
            continue

        item_key = f"demo_{item_doc.id}"
        if item_key in processed_items:
            continue

        processed_items.add(item_key)
        logger.info("Found demo processing item %s", item_doc.id)
        process_item(item_doc.reference, item_doc.id, item_data)


def process_item(item_ref, item_id: str, item_data: dict):
    """
    Process a single item through the AI pipeline
    
    Args:
        user_id: Firebase user ID
        item_id: Item document ID
        item_data: Current item data
    """
    try:
        url = item_data.get('url')
        
        if not url:
            raise ValueError("No URL provided")
        
        logger.info(f"📹 Extracting video info from: {url}")
        
        # Step 1: Extract video metadata
        video_info = extract_video_info(url)
        
        # Update with video info
        item_ref.update({
            'title': video_info['title'],
            'thumbnail': video_info['thumbnail'],
            'transcript': video_info['transcript']
        })
        
        logger.info(f"🤖 Analyzing content with AI: {video_info['title']}")
        
        # Step 2: AI Analysis with fact-checking
        ai_result = analyze_content(
            title=video_info['title'],
            transcript=video_info['transcript'],
            url=url
        )
        
        # Step 3: Update Firestore with complete results
        fact_check_status = ai_result.get('fact_check', {}).get('status', 'Unverified')
        
        # Map AI fact_check.status to UI status
        if fact_check_status == 'Verified':
            ui_status = 'verified'
        elif fact_check_status in ['False', 'Questionable']:
            ui_status = 'misleading'
        else:
            ui_status = 'unverified'
        
        update_data = {
            'summary': ai_result.get('summary', ''),
            'category': ai_result.get('category', 'Other'),
            'tags': ai_result.get('tags', []),
            'fact_check': ai_result.get('fact_check', {
                'status': 'Unverified',
                'reason': 'Analysis incomplete',
                'source_link': ''
            }),
            'sources': ai_result.get('sources', []),
            'urgency_score': ai_result.get('urgency_score', 5),
            'status': ui_status,
            'error_message': ''
        }
        
        item_ref.update(update_data)
        
        logger.info(f"✅ Item {item_id} processed successfully - Status: {ai_result.get('fact_check', {}).get('status')}")
        
    except VideoExtractionError as e:
        logger.error(f"❌ Video extraction failed for {item_id}: {str(e)}")
        item_ref.update({
            'status': 'error',
            'error_message': str(e)
        })
        
    except Exception as e:
        logger.error(f"❌ Processing failed for {item_id}: {str(e)}")
        item_ref.update({
            'status': 'error',
            'error_message': f"Processing error: {str(e)}"
        })


def on_snapshot(col_snapshot, changes, read_time):
    """
    Alternative: Real-time snapshot listener (if needed)
    Currently using polling for simplicity
    """
    for change in changes:
        if change.type.name == 'ADDED':
            doc = change.document
            logger.info(f"New document: {doc.id}")
            # Process document
