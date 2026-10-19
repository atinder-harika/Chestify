"""Local check: which Gemini models allow grounded search for this key,
then run the real extraction + fact-check pipeline on one URL.
Usage (from backend/, venv active):  python tests/model_testing.py [video_url]
"""
import os, sys, json

# Allow `from services...` imports when run from anywhere
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_DIR, ".env"), override=True)
from google import genai
from google.genai import types

key = os.environ["GEMINI_API_KEY"]
print(f"Key in use ends with: ...{key[-4:]}  (compare with Railway's GEMINI_API_KEY)\n")
client = genai.Client(api_key=key)
grounded = types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())])

working = None
for model in ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.5-flash"]:
    try:
        r = client.models.generate_content(model=model, contents="Who won the most recent FIFA World Cup? One line.", config=grounded)
        print(f"[OK]   {model:24} grounded -> {r.text.strip()[:70]}")
        working = working or model
    except Exception as e:
        print(f"[FAIL] {model:24} grounded -> {str(e)[:120]}")

url = sys.argv[1] if len(sys.argv) > 1 else "https://www.tiktok.com/@theengineeringmindset/video/7470919475173395734"
if not working:
    sys.exit("\nNo model allowed grounded search with this key.")
print(f"\nRunning full pipeline with {working} on {url}\n")
os.environ["GEMINI_FACTCHECK_MODEL"] = working
from services.video_service import extract_video_info
from services.ai_service import analyze_content
info = extract_video_info(url)
print("Title:", info["title"]); print("Transcript:", (info["transcript"] or "")[:200], "\n")
print(json.dumps(analyze_content(info["title"], info["transcript"], url), indent=2)[:1500])
