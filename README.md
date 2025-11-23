# 🏴‍☠️ Chestify

AI-powered educational content verification platform that fact-checks short-form videos using Google Gemini and Firebase.

## 📁 Structure
* **/frontend**: Next.js 14 App with TypeScript, Tailwind CSS, Radix UI
* **/backend**: FastAPI Python server with Gemini AI integration

## 🚀 Local Deployment Guide

### Prerequisites
- Node.js 18+ and npm
- Python 3.9+
- Firebase project with Firestore enabled
- Google Gemini API key

### 1. Clone Repository
```bash
git clone https://github.com/atinder-harika/Chestify.git
cd Chestify
```

### 2. Backend Setup

#### Install Dependencies
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

#### Configure Environment Variables
Create `backend/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

#### Setup Firebase Service Account
1. Go to Firebase Console → Project Settings → Service Accounts
2. Generate new private key (downloads JSON file)
3. Save as `backend/keys/service-account.json`

#### Start Backend Server
```bash
# Make sure you're in backend/ directory with venv activated
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
Backend runs at `http://localhost:8000`

### 3. Frontend Setup

#### Install Dependencies
```bash
cd frontend
npm install
```

#### Configure Environment Variables
Create `frontend/.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Get these from Firebase Console → Project Settings → General → Your apps → Web app

#### Start Development Server
```bash
npm run dev
```
Frontend runs at `http://localhost:3000`

### 4. Verify Setup
1. Open `http://localhost:3000`
2. Sign in with Google
3. Add a YouTube Shorts or TikTok URL
4. Backend should process it and display fact-check results

## 🔑 API Keys Required

### Google Gemini API
- Get free API key: https://ai.google.dev/
- Used for: AI analysis, fact-checking, chatbot

### Firebase
- Create project: https://console.firebase.google.com/
- Enable: Authentication (Google Sign-In), Firestore Database
- Used for: User auth, real-time data storage

## 📦 Tech Stack
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Radix UI, Framer Motion
- **Backend**: FastAPI, Python, Google Gemini AI
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication (Google OAuth)
- **Deployment**: Vercel (Frontend), Railway (Backend)
