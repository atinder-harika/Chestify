"""
Firebase Admin SDK Configuration
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

db = None


def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    global db
    
    try:
        # Get credentials path from environment
        creds_path = os.getenv("FIREBASE_CREDENTIALS", "keys/service-account.json")
        
        if not os.path.exists(creds_path):
            raise FileNotFoundError(
                f"Firebase credentials not found at {creds_path}. "
                "Please add your service-account.json file."
            )
        
        # Initialize Firebase Admin
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
