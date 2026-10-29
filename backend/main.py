"""
Chestify Backend - FastAPI Server
Listens to Firestore and processes educational content with AI fact-checking
Owner: Atinder Singh Hari
Review focus: FastAPI lifecycle, CORS, health checks, and chat API routing.
"""

from dotenv import load_dotenv
load_dotenv()  # Load .env FIRST before any other imports

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel
import logging
from firebase_admin import auth as firebase_auth
from config.firebase_config import initialize_firebase
from services import firestore_listener
from services.ai_service import initialize_gemini
import uvicorn

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    logger.info("🚀 Starting Chestify Backend...")
    
    initialize_firebase()
    logger.info("✅ Firebase initialized")
    
    firestore_listener.start_firestore_listener()
    logger.info("✅ Firestore listener started")
    
    yield
    
    logger.info("🛑 Shutting down Chestify Backend...")


app = FastAPI(
    title="Chestify API",
    description="AI-powered educational content verification system",
    version="1.0.0",
    lifespan=lifespan
)

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
    listener = firestore_listener.listener_status
    return {
        "status": "healthy" if listener == "active" else "degraded",
        "firebase": "connected",
        "listener": listener
    }


class ChatRequest(BaseModel):
    message: str
    context: str | None = None


def require_user(authorization: str | None = Header(default=None)) -> str:
    """Verify the Firebase ID token in 'Authorization: Bearer <token>' and return the uid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in to use chat.")
    try:
        decoded = firebase_auth.verify_id_token(authorization.removeprefix("Bearer ").strip())
    except Exception:
        raise HTTPException(status_code=401, detail="Your session expired. Please sign in again.")
    return decoded["uid"]


# Sync def so FastAPI runs it in a worker thread; the Gemini call blocks.
@app.post("/chat")
def chat(request: ChatRequest, uid: str = Depends(require_user)):
    """Chat endpoint with optional video context (signed-in users only)"""
    try:
        client = initialize_gemini()
        
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
        
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=prompt
        )
        
        return {
            "response": response.text
        }
        
    except Exception as e:
        logger.error(f"Chat error for {uid}: {str(e)}")
        raise HTTPException(status_code=500, detail="Chat is temporarily unavailable. Please try again.")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
