"""
Firebase Admin SDK Configuration
Owner: Atinder Singh Hari
Review focus: Firebase Admin credentials, singleton initialization, and Firestore access.
"""

import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)

load_dotenv()

db = None


def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    global db
    
    try:
        credentials_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
        if credentials_json:
            try:
                cred = credentials.Certificate(json.loads(credentials_json))
            except json.JSONDecodeError as exc:
                raise ValueError("FIREBASE_CREDENTIALS_JSON is not valid JSON") from exc
        else:
            creds_path = os.getenv("FIREBASE_CREDENTIALS", "keys/service-account.json")
            if creds_path.lstrip().startswith("{"):
                raise ValueError(
                    "FIREBASE_CREDENTIALS contains JSON. Move the complete service-account "
                    "JSON to FIREBASE_CREDENTIALS_JSON."
                )
            if not os.path.exists(creds_path):
                raise FileNotFoundError(
                    f"Firebase credentials not found at {creds_path}. "
                    "Set FIREBASE_CREDENTIALS_JSON or add service-account.json."
                )
            cred = credentials.Certificate(creds_path)

        firebase_admin.initialize_app(cred)
        
        # Get Firestore client
        db = firestore.client()
        
        logger.info("Firebase Admin SDK initialized successfully")
        return db
        
    except Exception as e:
        logger.error(f"Failed to initialize Firebase: {str(e)}")
        raise


def get_firestore_client():
    """Get Firestore client instance"""
    global db
    if db is None:
        db = initialize_firebase()
    return db
