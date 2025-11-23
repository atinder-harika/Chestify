#!/bin/bash

echo "🚀 Initializing Chestify Hackathon Monorepo..."

# 1. Create Directories
mkdir -p frontend
mkdir -p backend
mkdir -p .github

# 2. Create the Unified .gitignore (CRITICAL for Monorepos)
echo "Creating .gitignore..."
cat <<EOT > .gitignore
# --- General ---
.DS_Store
*.log

# --- Frontend (Node/Next.js) ---
frontend/node_modules
frontend/.next
frontend/out
frontend/.env
frontend/.env.local
frontend/.vercel

# --- Backend (Python/FastAPI) ---
backend/__pycache__
backend/venv
backend/.venv
backend/env
backend/.env
backend/*.pyc
backend/.pytest_cache

# --- IDEs ---
.vscode
.idea
EOT

# 3. Create the Copilot Instructions (PRD)
echo "Creating Copilot Instructions..."
cat <<EOT > .github/copilot_instructions.md
# Product Requirements Document & Copilot Instructions: Chestify

**Theme:** AI & Data Science for Social Good (SDG 4: Quality Education)
**Tagline:** Turn short-form noise into a treasure chest of knowledge.

## 1. Executive Summary
Chestify is a web application that helps users curate educational short-form content. The app uses AI to extract transcripts, fact-check claims against Google Search, and organize content.

## 2. Technical Architecture
* **Frontend:** Next.js 14 (App Router), Tailwind CSS, Lucide React.
* **Backend:** Python FastAPI.
* **Database:** Firebase Firestore & Auth.
* **AI:** Google Gemini 1.5 Flash + Grounding.

## 3. Data Structure (Firestore)
Collection: \`users/{userId}/items/{itemId}\`
Fields: url, title, summary, transcript, category, tags[], fact_check (status, reason), status (processing/completed).

## 4. Coding Rules
* **Frontend:** Use \`shadcn/ui\`. Use Client Components for Firestore listeners. NEVER wait for AI HTTP response (Async flow).
* **Backend:** Use \`pydantic\`. Handle \`yt_dlp\` errors gracefully.
* **Grounding:** Use Google Search Tool in Gemini SDK.
EOT

# 4. Create a README for your teammate
echo "Creating README.md..."
cat <<EOT > README.md
# 🏴‍☠️ Chestify (Hackathon Repo)

## Structure
* **/frontend**: Next.js App (Deployed on Vercel)
* **/backend**: FastAPI App (Deployed on Railway)

## 🚀 Quick Start

### Frontend
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`

### Backend
\`\`\`bash
cd backend
python -m venv venv
source venv/bin/activate  # (or venv\Scripts\activate on Windows)
pip install -r requirements.txt
uvicorn main:app --reload
\`\`\`

## 🔑 Environment Variables
Create a \`.env\` file in BOTH folders.
**Backend .env:**
\`\`\`
GEMINI_API_KEY=...
FIREBASE_CREDENTIALS=...
\`\`\`
**Frontend .env:**
\`\`\`
NEXT_PUBLIC_FIREBASE_API_KEY=...
\`\`\`
EOT

# 5. Initialize Git
git init
git add .
git commit -m "Initial commit: Monorepo structure setup"

echo "✅ Done! structure created."
echo "👉 Now: Copy your v0 code into /frontend and your Python code into /backend"