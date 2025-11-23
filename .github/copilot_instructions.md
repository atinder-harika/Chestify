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
Collection: `users/{userId}/items/{itemId}`
Fields: url, title, summary, transcript, category, tags[], fact_check (status, reason), status (processing/completed).

## 4. Coding Rules
* **Frontend:** Use `shadcn/ui`. Use Client Components for Firestore listeners. NEVER wait for AI HTTP response (Async flow).
* **Backend:** Use `pydantic`. Handle `yt_dlp` errors gracefully.
* **Grounding:** Use Google Search Tool in Gemini SDK.
