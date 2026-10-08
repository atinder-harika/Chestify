"""
AI Analysis Service using Google Gemini 2.5 Flash
Performs summarization, categorization, and fact-checking with Google Search grounding
"""

import os
import json
import time
from google import genai
from google.genai import types
from typing import Any, Dict, List
import logging

logger = logging.getLogger(__name__)

# Initialize Gemini client
_gemini_client = None

def initialize_gemini():
    """Initialize Gemini API client with key from environment"""
    global _gemini_client
    
    if _gemini_client:
        return _gemini_client  # Already initialized
    
    # Force reload from .env file
    from dotenv import load_dotenv
    load_dotenv(override=True)
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("❌ GEMINI_API_KEY not found in environment variables!")
        raise ValueError("GEMINI_API_KEY not configured")
    
    logger.info("Gemini API key loaded")
    _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


def extract_grounding_sources(response: Any) -> List[Dict[str, str]]:
    """Return unique web sources supplied by Gemini Search grounding."""
    sources: List[Dict[str, str]] = []
    seen_urls = set()

    for candidate in getattr(response, "candidates", []) or []:
        metadata = getattr(candidate, "grounding_metadata", None)
        for chunk in getattr(metadata, "grounding_chunks", []) or []:
            web = getattr(chunk, "web", None)
            url = getattr(web, "uri", None)
            if url and url not in seen_urls:
                sources.append({
                    "title": getattr(web, "title", None) or url,
                    "url": url,
                })
                seen_urls.add(url)

    return sources


def analyze_content(title: str, transcript: str, url: str) -> Dict:
    """
    Analyze video content using Gemini with grounding
    
    Args:
        title: Video title
        transcript: Video transcript/description
        url: Original video URL
    
    Returns:
        Dictionary with summary, category, tags, and fact_check
    """
    try:
        # Initialize Gemini client on first call
        client = initialize_gemini()
        
        # Grounding is deferred until a project with Search quota is configured.
        config = types.GenerateContentConfig()
        
        # Construct prompt
        prompt = f"""
You are analyzing educational short-form content for a learning platform called Chestify.

**Content:**
Title: {title}
Transcript: {transcript[:1000]}
URL: {url}

**Task:**
1. Generate a concise summary (2-3 sentences)
2. Categorize into ONE of: Physics, Chemistry, Biology, Math, Computer Science, History, Psychology, Health, Web Development, Business, or Other
3. Extract 3-5 relevant tags
4. Do not claim that the content was externally fact-checked. Without Search
   grounding, mark the fact check as "Unverified".
   - "Verified": Accurate and supported by reliable sources
   - "Questionable": Contains some inaccuracies or lacks sources
   - "False": Contains misinformation or pseudoscience
   - "Unverified": Cannot confirm accuracy

**IMPORTANT:** Do not invent source links or present uncertain claims as verified.

Return ONLY valid JSON with this structure:
{{
  "summary": "Brief explanation of the content...",
  "category": "Category Name",
  "tags": ["tag1", "tag2", "tag3"],
  "fact_check": {{
    "status": "Verified|Questionable|False|Unverified",
    "reason": "Explanation of the fact-check result...",
    "source_link": "https://reliable-source.com/article"
  }},
  "urgency_score": 7
}}

The urgency_score (1-10) indicates how useful/important this content is for learners.
"""
        
        # Generate response with retry logic.
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model="gemini-3.1-flash-lite",
                    contents=prompt,
                    config=config
                )
                break
            except Exception as e:
                if "429" in str(e) or "quota" in str(e).lower():
                    if attempt < max_retries - 1:
                        wait_time = (2 ** attempt) * 2  # Exponential backoff: 2s, 4s, 8s
                        logger.warning(f"⏳ Rate limit hit, retrying in {wait_time}s... (attempt {attempt + 1}/{max_retries})")
                        time.sleep(wait_time)
                    else:
                        logger.error(f"❌ Rate limit exceeded after {max_retries} attempts")
                        raise
                else:
                    raise
        
        # Parse JSON response
        result_text = response.text.strip()
        
        # Clean markdown code blocks if present
        if result_text.startswith('```'):
            result_text = result_text.split('```')[1]
            if result_text.startswith('json'):
                result_text = result_text[4:]
            result_text = result_text.strip()
        
        result = json.loads(result_text)
        sources = extract_grounding_sources(response)
        fact_check = result.setdefault("fact_check", {})
        if sources and not fact_check.get("source_link"):
            fact_check["source_link"] = sources[0]["url"]
        result["sources"] = sources
        
        logger.info(f"✅ AI analysis completed: {result.get('category')} - {result.get('fact_check', {}).get('status')}")
        return result
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response as JSON: {str(e)}")
        logger.error(f"Raw response: {result_text if 'result_text' in locals() else 'N/A'}")
        # Return fallback result
        return get_fallback_analysis(title, transcript)
        
    except Exception as e:
        logger.error(f"AI analysis failed: {str(e)}")
        return get_fallback_analysis(title, transcript)


def get_fallback_analysis(title: str, transcript: str) -> Dict:
    """
    Fallback analysis when AI fails
    
    Args:
        title: Video title
        transcript: Video transcript
    
    Returns:
        Basic analysis dictionary
    """
    return {
        "summary": f"Analysis of: {title}. {transcript[:100]}...",
        "category": "Other",
        "tags": ["Educational", "Video Content"],
        "fact_check": {
            "status": "Unverified",
            "reason": "Unable to verify content at this time. Please review manually.",
            "source_link": ""
        },
        "sources": [],
        "urgency_score": 5
    }


def generate_category_from_text(text: str) -> str:
    """
    Simple category extraction from text (fallback method)
    
    Args:
        text: Combined title and transcript
    
    Returns:
        Category string
    """
    text_lower = text.lower()
    
    category_keywords = {
        "Physics": ["physics", "quantum", "mechanics", "energy", "force"],
        "Chemistry": ["chemistry", "molecule", "reaction", "chemical", "element"],
        "Biology": ["biology", "cell", "organism", "evolution", "genetics"],
        "Math": ["math", "algebra", "calculus", "equation", "theorem"],
        "Computer Science": ["code", "programming", "algorithm", "software", "python", "javascript"],
        "Web Development": ["html", "css", "frontend", "backend", "react", "div"],
        "Health": ["health", "diet", "fitness", "nutrition", "medical"],
        "Psychology": ["psychology", "behavior", "mental", "cognitive"],
        "Business": ["business", "marketing", "entrepreneur", "startup"],
        "History": ["history", "historical", "ancient", "war", "civilization"]
    }
    
    for category, keywords in category_keywords.items():
        if any(keyword in text_lower for keyword in keywords):
            return category
    
    return "Other"


def extract_tags_from_text(text: str, max_tags: int = 5) -> List[str]:
    """
    Extract relevant tags from text
    
    Args:
        text: Combined title and transcript
        max_tags: Maximum number of tags to return
    
    Returns:
        List of tags
    """
    # Common educational keywords
    common_tags = [
        "Science", "Education", "Tutorial", "Learning", "Explained",
        "Quick Tips", "Study", "Knowledge", "Facts", "Guide"
    ]
    
    text_lower = text.lower()
    found_tags = [tag for tag in common_tags if tag.lower() in text_lower]
    
    # Add default if none found
    if not found_tags:
        found_tags = ["Educational", "Video Content"]
    
    return found_tags[:max_tags]
