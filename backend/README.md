# Chestify Backend

FastAPI backend service that processes educational content with AI fact-checking.

## Setup

### 1. Install Dependencies

```bash
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### 2. Configure Environment

Create a `.env` file:

```env
FIREBASE_CREDENTIALS=keys/service-account.json
GEMINI_API_KEY=your_gemini_api_key_here
ENVIRONMENT=development
```

### 3. Add Firebase Service Account

1. Go to Firebase Console > Project Settings > Service Accounts
2. Click "Generate New Private Key"
3. Save as `keys/service-account.json`

### 4. Run the Server

```bash
uvicorn main:app --reload
```

Server will run at: `http://localhost:8000`

## How It Works

1. **Firestore Listener**: Polls for items with `status='processing'`
2. **Video Extraction**: Uses yt-dlp to extract metadata and transcripts
3. **AI Analysis**: Gemini 1.5 Flash analyzes content with Google Search grounding
4. **Fact-Checking**: Automatically detects misinformation
5. **Update Firestore**: Sets `status='completed'` with results

## API Endpoints

- `GET /` - Health check
- `GET /health` - Detailed status

## Project Structure

```
backend/
├── main.py                 # FastAPI app
├── config/
│   └── firebase_config.py  # Firebase initialization
├── services/
│   ├── video_service.py    # yt-dlp extraction
│   ├── ai_service.py       # Gemini analysis
│   └── firestore_listener.py  # Background processor
└── keys/
    └── service-account.json   # Firebase credentials
```

## Deployment (Railway)

1. Connect GitHub repository to Railway
2. Add environment variables:
   - `GEMINI_API_KEY`
   - `FIREBASE_CREDENTIALS_JSON` (complete service-account JSON)
   - `ENVIRONMENT=production`
3. Railway will auto-deploy on push
