#!/usr/bin/env python3
"""
Instagram Reel audio metadata extractor — WAT Layer 3 Tool
Uses yt-dlp to extract audio metadata from public Instagram Reels.

Usage:
    python3 check_instagram_audio.py '{"urls": ["https://www.instagram.com/reel/..."]}'

Output (stdout):
    {"results": [{...}, ...]}
"""

import sys
import json
import re
import subprocess

INSTAGRAM_URL_RE = re.compile(r'^https://(www\.)?instagram\.com/')


def extract_reel_metadata(url: str) -> dict:
    if not INSTAGRAM_URL_RE.match(url):
        return {"url": url, "error": "invalid URL — must be an Instagram link"}
    try:
        result = subprocess.run(
            [sys.executable, "-m", "yt_dlp", "--dump-json", "--no-download", "--quiet", url],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            err = result.stderr.strip() or "yt-dlp failed"
            return {"url": url, "error": err}

        data = json.loads(result.stdout.strip())

        track = data.get("track")
        artist = data.get("artist")
        is_original = not bool(track)

        if is_original:
            uploader = data.get("uploader") or data.get("channel") or "unknown"
            audio_title = f"Original audio by @{uploader}"
        else:
            audio_title = track

        return {
            "url": url,
            "reelId": data.get("id"),
            "creator": data.get("uploader") or data.get("channel"),
            "caption": (data.get("description") or data.get("title") or "")[:200],
            "track": track,
            "artist": artist,
            "album": data.get("album"),
            "audioTitle": audio_title,
            "isOriginalSound": is_original,
        }
    except subprocess.TimeoutExpired:
        return {"url": url, "error": "timeout — reel took too long to process"}
    except json.JSONDecodeError:
        return {"url": url, "error": "yt-dlp returned invalid JSON"}
    except Exception as e:
        return {"url": url, "error": str(e)}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"results": [], "error": "no payload provided"}))
        sys.exit(1)

    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        print(json.dumps({"results": [], "error": "invalid JSON payload"}))
        sys.exit(1)

    urls = payload.get("urls", [])
    results = [extract_reel_metadata(url) for url in urls]
    print(json.dumps({"results": results}))


if __name__ == "__main__":
    main()
