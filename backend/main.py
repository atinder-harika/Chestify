"""
Chestify Backend - FastAPI Server
Listens to Firestore and processes educational content with AI fact-checking
"""

from dotenv import load_dotenv
load_dotenv()  # Load .env FIRST before any other imports

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from config.firebase_config import initialize_firebase
from services.firestore_listener import start_firestore_listener
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    logger.info("🚀 Starting Chestify Backend...")
    
    # Initialize Firebase
    initialize_firebase()
    logger.info("✅ Firebase initialized")
    
    # Start Firestore listener
    start_firestore_listener()
    logger.info("✅ Firestore listener started")
    
    yield
    
    logger.info("🛑 Shutting down Chestify Backend...")


app = FastAPI(
    title="Chestify API",
    description="AI-powered educational content verification system",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update with your Vercel domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "Chestify Backend",
        "message": "Treasure chest for verified educational content"
    }


@app.get("/health")
def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "firebase": "connected",
        "listener": "active"
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
