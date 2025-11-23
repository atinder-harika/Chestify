# 🏴‍☠️ Chestify (Hackathon Repo)

## Structure
* **/frontend**: Next.js App (Deployed on Vercel)
* **/backend**: FastAPI App (Deployed on Railway)

## 🚀 Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # (or venv\Scripts\activate on Windows)
pip install -r requirements.txt
uvicorn main:app --reload
```

## 🔑 Environment Variables
Create a `.env` file in BOTH folders.
**Backend .env:**
```
GEMINI_API_KEY=...
FIREBASE_CREDENTIALS=...
```
**Frontend .env:**
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
```
