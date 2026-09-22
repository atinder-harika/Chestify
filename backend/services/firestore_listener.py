"""
Firestore Listener Service
Watches for new items with status='processing' and triggers AI pipeline
"""

import logging
import threading
import time
from datetime import datetime
from google.cloud.firestore_v1 import FieldFilter
from config.firebase_config import get_firestore_client
from services.video_service import extract_video_info, VideoExtractionError
from services.ai_service import analyze_content

logger = logging.getLogger(__name__)

# Track processed items to avoid duplicates
processed_items = set()


def start_firestore_listener():
    """Start background thread to listen for new items"""
    thread = threading.Thread(target=listen_to_firestore, daemon=True)
    thread.start()
    logger.info("Firestore listener thread started")


def listen_to_firestore():
    """
    Main listener loop - polls Firestore for items with status='processing'
    Note: Using polling instead of snapshot listeners for simplicity with Railway
    """
    db = get_firestore_client()
    
    while True:
        try:
            # Process the shared demo collection first.
            demo_items_ref = db.collection('demo_items')
            demo_query = demo_items_ref.where(
                filter=FieldFilter('status', '==', 'processing')
            )
            for item_doc in demo_query.stream():
                item_id = item_doc.id
                item_key = f"demo_{item_id}"
                if item_key in processed_items:
                    continue
                item_data = item_doc.to_dict()
                logger.info(f"Found demo item: {item_id}")
                process_item(demo_items_ref.document(item_id), item_id, item_data)
                processed_items.add(item_key)

            # Query existing user collections for backward compatibility.
            users_ref = db.collection('users')
            users = users_ref.stream()
            
            user_count = 0
            for user_doc in users:
                user_id = user_doc.id
                user_count += 1
                
                # Query items with status='processing'
                items_ref = db.collection('users').document(user_id).collection('items')
                query = items_ref.where(filter=FieldFilter('status', '==', 'processing'))
                
                items_found = 0
                for item_doc in query.stream():
                    items_found += 1
                    item_id = item_doc.id
                    item_data = item_doc.to_dict()
                    
                    # Skip if already processed in this session
                    item_key = f"{user_id}_{item_id}"
                    if item_key in processed_items:
                        logger.info(f"⏭️ Skipping already processed item: {item_id}")
                        continue
                    
                    logger.info(f"🔍 Found new item: {item_id} for user {user_id}")
                    logger.info(f"📋 Item data: {item_data.get('url', 'no url')}")
                    
                    # Process the item
                    process_item(items_ref.document(item_id), item_id, item_data)
                    
                    # Mark as processed
                    processed_items.add(item_key)
                
                if items_found > 0:
                    logger.info(f"✅ Checked user {user_id}: found {items_found} processing items")
            
            if user_count == 0:
                logger.info("⚠️ No users found in Firestore")
            
            # Poll every 5 seconds
            time.sleep(5)
            
        except Exception as e:
            logger.error(f"Error in Firestore listener: {str(e)}")
            time.sleep(10)  # Wait longer on error


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
