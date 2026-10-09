"""
Video Extraction Service using yt-dlp
Extracts metadata and transcripts from YouTube Shorts, TikTok, etc.
Owner: Christain Malan
Review focus: Video metadata extraction, subtitle parsing, URL validation, and errors.
"""

import yt_dlp
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


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
            thumbnail = info.get('thumbnail', '')
            duration = info.get('duration', 0)
            uploader = info.get('uploader', 'Unknown')
            
            # Extract transcript from subtitles
            transcript = extract_transcript(info)
            
            # If no transcript, try description
            if not transcript:
                transcript = info.get('description', '')[:500]
            
            result = {
                'title': title,
                'thumbnail': thumbnail,
                'transcript': transcript,
                'duration': duration,
                'uploader': uploader,
                'url': url
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


def extract_transcript(info: Dict) -> str:
    """
    Extract transcript from subtitles/captions
    
    Args:
        info: Video info dictionary from yt-dlp
    
    Returns:
        Concatenated transcript text
    """
    transcript_parts = []
    
    # Prefer automatic captions because they are usually available for YouTube.
    subtitles = info.get('automatic_captions', {})
    
    if not subtitles:
        subtitles = info.get('subtitles', {})
    
    if 'en' in subtitles:
        for subtitle in subtitles['en']:
            if 'data' in subtitle:
                transcript_parts.append(subtitle['data'])
            elif subtitle.get('ext') == 'json3':
                # JSON3 captions require a parser that is not currently enabled.
                continue
    
    transcript = ' '.join(transcript_parts).strip()
    
    if transcript:
        import re
        transcript = re.sub(r'\[\d+:\d+\]', '', transcript)
        transcript = re.sub(r'\s+', ' ', transcript).strip()
    
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
