# Architecture

```text
Browser (Next.js static site, GitHub Pages)
   │  writes a "processing" item          ▲ live updates
   ▼                                       │
Firestore ──────────────▶ Backend (FastAPI on Railway)
                            ├─ yt-dlp: title, thumbnail, captions
                            ├─ Gemini + Google Search: verdict and sources
                            └─ writes the result back to the item
```

The browser never waits on a long request. It saves the link to Firestore, the
backend picks it up, and the result appears on the card as soon as it's written.

## Pieces

| Part | Where | Does |
|---|---|---|
| Frontend | `frontend/` | Library, Add Video, Chat, Progress. Firebase Auth (Google, email). |
| Backend | `backend/` | Listens for new items, runs the check, serves chat and suggestions. |
| Data | Firestore | Per-user videos, chats and settings. Rules in `firestore.rules`. |

## Backend

- `services/firestore_listener.py`: picks up new items and runs the pipeline.
- `services/video_service.py`: yt-dlp extraction and a stored thumbnail copy.
- `services/ai_service.py`: the fact-check and source matching.
- `services/insights_service.py`: "Explore next" suggestions.
- `main.py`: HTTP API.

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | none | Liveness |
| `POST /chat` | Firebase ID token | Chat about a video or topic |
| `POST /insights` | Firebase ID token | Suggestions for the Progress tab |

Analyses are cached per video, so the same video is only checked once.

## Data

Each user's data lives under `users/{uid}`: their videos (`items`) and saved
chats (`chats`). Rules only let a signed-in user read and write their own data.
Shared and backend-only collections are closed to the browser.

## Configuration

| Where | Variables |
|---|---|
| Backend (Railway) | `GEMINI_API_KEY`, `FIREBASE_CREDENTIALS_JSON`, `ENVIRONMENT` |
| Frontend (repo variables) | `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_API_URL` |

Secrets never go in git.
