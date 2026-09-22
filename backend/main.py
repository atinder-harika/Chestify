"""
Chestify Backend - FastAPI Server
Listens to Firestore and processes educational content with AI fact-checking
"""

from dotenv import load_dotenv
load_dotenv()  # Load .env FIRST before any other imports

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel
import logging
from config.firebase_config import initialize_firebase
from services.firestore_listener import start_firestore_listener
from services.ai_service import initialize_gemini
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
    allow_origins=[
        "https://chestify.atinder.dev",
        "http://localhost:3000",
    ],
    allow_credentials=False,
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


class ChatRequest(BaseModel):
    message: str
    context: str | None = None


@app.post("/chat")
async def chat(request: ChatRequest):
    """Chat endpoint with optional video context"""
    try:
        client = initialize_gemini()
        
        # Build prompt with context if provided
        if request.context:
            prompt = f"""You are a helpful AI assistant for Chestify, an educational content platform.

Context about the video being discussed:
{request.context}

User question: {request.message}

Provide a helpful, accurate response based on the video context and your knowledge. If the video contains misinformation, explain why and provide correct information."""
        else:
            prompt = f"""You are a helpful AI assistant for Chestify, an educational content platform. 

User question: {request.message}

Provide a helpful, accurate response."""
        
        # Generate response using Gemini
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=prompt
        )
        
        return {
            "response": response.text
        }
        
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
