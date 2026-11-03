"""
Video Extraction Service using yt-dlp
Extracts metadata and transcripts from YouTube Shorts, TikTok, etc.
Review focus: Video metadata extraction, subtitle parsing, URL validation, and errors.
"""

import base64
import html
import io
import json
import logging
import re
from typing import Any, Dict, Optional

import requests
import yt_dlp
from PIL import Image

logger = logging.getLogger(__name__)

# Social-media thumbnail links are signed and expire within days, so a small
# copy is stored on the item instead. It's cropped to the cards' 9:16 shape
# first, so landscape (e.g. YouTube) images keep enough height to stay sharp.
THUMBNAIL_SIZE = (450, 800)
THUMBNAIL_QUALITY = 75


def _crop_to_card(image: Image.Image) -> Image.Image:
    """Center-crop to 9:16, the same part the card shows with object-cover."""
    width, height = image.size
    target = THUMBNAIL_SIZE[0] / THUMBNAIL_SIZE[1]
    if width / height > target:
        new_width = round(height * target)
        left = (width - new_width) // 2
        return image.crop((left, 0, left + new_width, height))
    new_height = round(width / target)
    top = (height - new_height) // 2
    return image.crop((0, top, width, top + new_height))


def thumbnail_data_url(thumbnail_url: str) -> Optional[str]:
    """Download a thumbnail and return it as a small JPEG data URL, or None."""
    if not thumbnail_url:
        return None
    try:
        resp = requests.get(thumbnail_url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        image = _crop_to_card(Image.open(io.BytesIO(resp.content)).convert("RGB"))
        # Shrink only; small sources stay at their own resolution.
        image.thumbnail(THUMBNAIL_SIZE, Image.LANCZOS)
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=THUMBNAIL_QUALITY, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode("ascii")
    except Exception as e:
        logger.warning(f"Couldn't store thumbnail copy: {str(e)[:150]}")
        return None


class VideoExtractionError(Exception):
    """Custom exception for video extraction errors"""
    pass


def extract_video_info(url: str) -> Dict[str, Any]:
    """
    Extract video metadata and transcript from URL
    
    Args:
        url: Video URL (YouTube Shorts, TikTok, Instagram, etc.)
    
    Returns:
        Dictionary with title, thumbnail, transcript, duration
    
    Raises:
        VideoExtractionError: If extraction fails
    """
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'skip_download': True,
        'subtitleslangs': ['en'],
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Extract basic metadata
            title = info.get('title', 'Untitled')
            # Prefer a stored copy; keep the (expiring) link only if the download fails.
            thumbnail = info.get('thumbnail', '') or ''
            thumbnail = thumbnail_data_url(thumbnail) or thumbnail
            duration = info.get('duration', 0)
            uploader = info.get('uploader', 'Unknown')
            
            # Download and parse the best English caption track
            transcript = extract_transcript(ydl, info)
            
            # If no transcript, try description
            if not transcript:
                transcript = info.get('description', '')[:500]
            
            # Stable identity across share links and tracking params,
            # e.g. "TikTok:7470919475173395734". Used as the analysis cache key.
            video_key = f"{info.get('extractor_key') or info.get('extractor') or 'video'}:{info.get('id') or url}"

            result = {
                'title': title,
                'thumbnail': thumbnail,
                'transcript': transcript,
                'duration': duration,
                'uploader': uploader,
                'url': url,
                'video_key': video_key
            }
            
            logger.info(f"Successfully extracted info from: {title}")
            return result
            
    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        
        if "Private video" in error_msg:
            raise VideoExtractionError("Video is private or unavailable")
        elif "Video unavailable" in error_msg:
            raise VideoExtractionError("Video not found or removed")
        elif "Sign in" in error_msg:
            raise VideoExtractionError("Video requires authentication")
        else:
            raise VideoExtractionError(f"Failed to extract video: {error_msg}")
            
    except Exception as e:
        logger.error(f"Unexpected error extracting video: {str(e)}")
        raise VideoExtractionError(f"Extraction failed: {str(e)}")


# Caption formats we know how to parse, in order of preference
_CAPTION_FORMATS = ['json3', 'vtt', 'srv3', 'srv1', 'ttml']


def _pick_caption_track(info: Dict) -> Optional[Dict]:
    """
    Choose the best English caption track.

    Manual subtitles beat auto-generated ones. Language keys vary by platform
    (YouTube uses 'en' / 'en-US', TikTok uses 'eng-US'), so match any key
    starting with 'en'.
    """
    for source in ('subtitles', 'automatic_captions'):
        tracks_by_lang = info.get(source) or {}
        langs = [lang for lang in tracks_by_lang if lang.lower().startswith('en')]
        # Prefer exact/original English over translated variants like 'en-de'
        langs.sort(key=lambda l: (l.lower() not in ('en', 'en-us', 'eng-us', 'en-orig'), len(l)))
        for lang in langs:
            tracks = tracks_by_lang[lang] or []
            for fmt in _CAPTION_FORMATS:
                for track in tracks:
                    if track.get('ext') == fmt and track.get('url'):
                        return track
    return None


def _parse_json3(text: str) -> str:
    data = json.loads(text)
    parts = []
    for event in data.get('events', []):
        for seg in event.get('segs') or []:
            parts.append(seg.get('utf8', ''))
    return ' '.join(parts)


def _parse_vtt(text: str) -> str:
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if (not line or line == 'WEBVTT' or '-->' in line or line.isdigit()
                or line.startswith(('NOTE', 'STYLE', 'Kind:', 'Language:'))):
            continue
        line = re.sub(r'<[^>]+>', '', line)  # inline timing/styling tags
        # Auto captions repeat the previous line as they scroll; skip repeats
        if line and (not lines or lines[-1] != line):
            lines.append(line)
    return ' '.join(lines)


def _parse_xml_captions(text: str) -> str:
    text = re.sub(r'<[^>]+>', ' ', text)
    return html.unescape(text)


def extract_transcript(ydl: yt_dlp.YoutubeDL, info: Dict) -> str:
    """
    Download and parse the best English caption track for a video.

    yt-dlp's extract_info only returns caption URLs, so the caption file is
    fetched here through the same YoutubeDL instance (reusing its cookies,
    proxy, and impersonation settings).

    Returns:
        Transcript text, or an empty string when no usable captions exist
    """
    track = _pick_caption_track(info)
    if not track:
        logger.info("No English captions available")
        return ''

    try:
        raw = ydl.urlopen(track['url']).read().decode('utf-8', errors='replace')
        ext = track.get('ext')
        if ext == 'json3':
            transcript = _parse_json3(raw)
        elif ext == 'vtt':
            transcript = _parse_vtt(raw)
        else:
            transcript = _parse_xml_captions(raw)
    except Exception as e:
        logger.warning(f"Could not download captions ({track.get('ext')}): {e}")
        return ''

    transcript = re.sub(r'\s+', ' ', transcript).strip()
    logger.info(f"Transcript extracted ({len(transcript)} chars, {track.get('ext')})")
    return transcript


def validate_video_url(url: str) -> bool:
    """
    Validate if URL is from a supported platform
    
    Args:
        url: Video URL
    
    Returns:
        True if URL appears valid
    """
    supported_domains = [
        'youtube.com',
        'youtu.be',
        'tiktok.com',
        'instagram.com',
        'twitter.com',
        'x.com'
    ]
    
    return any(domain in url.lower() for domain in supported_domains)
