"""
Chestify Backend - FastAPI Server
Listens to Firestore and processes educational content with AI fact-checking
Review focus: FastAPI lifecycle, CORS, health checks, and chat API routing.
"""

from dotenv import load_dotenv
load_dotenv()  # Load .env FIRST before any other imports

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel
import logging
import os
from datetime import datetime, timezone
from firebase_admin import auth as firebase_auth
from firebase_admin import firestore as admin_firestore
from google.genai import types
from config.firebase_config import get_firestore_client, initialize_firebase
from services import firestore_listener
from services.ai_service import _is_daily_quota, extract_grounding_sources, initialize_gemini
from services.insights_service import InsightsError, get_insights
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


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    context: str | None = None
    # Recent earlier turns of this saved chat, oldest first.
    history: list[ChatTurn] = []
    # Ground this answer in Google Search. Spends the scarce grounded quota,
    # so it's opt-in per message and capped per user per day.
    web_search: bool = False


# Applied to every chat answer: short by default, more only when asked.
CHAT_STYLE = """Answer style:
- Lead with the direct answer. No preamble, and don't repeat the question.
- Keep it to 2-4 short sentences, or at most 4 short bullet points for lists.
- Only go into more detail if the user explicitly asks for it."""

WEB_SEARCH_DAILY_LIMIT = int(os.getenv("WEB_SEARCH_DAILY_LIMIT", "5"))
CHAT_MODEL = "gemini-3.1-flash-lite"
WEB_SEARCH_MODEL = os.getenv("GEMINI_FACTCHECK_MODEL", "gemini-2.5-flash")


def use_web_search_quota(uid: str) -> bool:
    """Count one web search for today; False once the user's daily limit is reached."""
    db = get_firestore_client()
    today = datetime.now(timezone.utc).date().isoformat()
    ref = db.collection("users").document(uid).collection("usage").document(today)

    @admin_firestore.transactional
    def take(transaction):
        snap = ref.get(transaction=transaction)
        used = (snap.to_dict() or {}).get("web_search", 0) if snap.exists else 0
        if used >= WEB_SEARCH_DAILY_LIMIT:
            return False
        transaction.set(ref, {"web_search": used + 1}, merge=True)
        return True

    return take(db.transaction())


def format_history(history: list[ChatTurn]) -> str:
    """Render up to the last 10 turns as a transcript for the prompt."""
    lines = []
    for turn in history[-10:]:
        speaker = "User" if turn.role == "user" else "Assistant"
        lines.append(f"{speaker}: {turn.content[:1500]}")
    return "\n".join(lines)


def require_user(authorization: str | None = Header(default=None)) -> str:
    """Verify the Firebase ID token in 'Authorization: Bearer <token>' and return the uid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
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
        transcript = format_history(request.history)
        earlier = f"\nConversation so far:\n{transcript}\n" if transcript else ""

        search_note = (
            "\nUse Google Search to check current facts before answering. Don't list links; "
            "the sources are shown separately."
            if request.web_search else ""
        )

        if request.context:
            prompt = f"""You are Chestify's assistant, helping people learn safely from short-form videos.

Context about the video being discussed:
{request.context}
{earlier}
User question: {request.message}

Answer accurately from the video context and your knowledge. If the video contains misinformation, say what's wrong and what's true.
{CHAT_STYLE}{search_note}"""
        else:
            prompt = f"""You are Chestify's assistant, helping people learn safely from short-form videos.
{earlier}
User question: {request.message}

Answer accurately.
{CHAT_STYLE}{search_note}"""

        if request.web_search:
            if not use_web_search_quota(uid):
                raise HTTPException(
                    status_code=429,
                    detail=f"You've used today's {WEB_SEARCH_DAILY_LIMIT} web searches. Turn off web search, or try again tomorrow.",
                )
            response = client.models.generate_content(
                model=WEB_SEARCH_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())]),
            )
            sources = [
                {"title": s["title"], "url": s["url"], "domain": s["domain"]}
                for s in extract_grounding_sources(response)[:5]
            ]
            return {"response": response.text, "sources": sources, "web_search": True}

        response = client.models.generate_content(model=CHAT_MODEL, contents=prompt)
        return {"response": response.text}

    except HTTPException:
        raise
    except Exception as e:
        if request.web_search and _is_daily_quota(e):
            logger.error(f"Web search quota exhausted for {uid}: {str(e)[:200]}")
            raise HTTPException(status_code=503, detail="Web search is unavailable for today. Turn it off to keep chatting.")
        logger.error(f"Chat error for {uid}: {str(e)}")
        raise HTTPException(status_code=500, detail="Chat is temporarily unavailable. Please try again.")


@app.post("/insights")
def insights(uid: str = Depends(require_user)):
    """'Explore next' suggestions for the Progress tab, cached per user per day."""
    try:
        return get_insights(get_firestore_client(), uid)
    except InsightsError as e:
        raise HTTPException(status_code=503, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
