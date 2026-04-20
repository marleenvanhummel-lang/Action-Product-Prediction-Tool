#!/usr/bin/env python3
"""
Instagram account audio scanner — WAT Layer 3 Tool
Uses instaloader to list profile posts, then yt-dlp (per reel) for audio metadata.

yt-dlp's Instagram *profile* extractor is broken upstream; individual reel URLs work fine.
This script combines both: instaloader lists reels, yt-dlp extracts audio from each.

Usage:
    python3 scan_instagram_account.py '{"username": "action_nederland", "limit": 30}'

Output (stdout):
    {"username": "action_nederland", "count": 18, "results": [...]}
"""

import sys
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

import instaloader

USERNAME_RE = re.compile(r'^[a-zA-Z0-9._]{1,30}$')
MAX_WORKERS = 8


def extract_audio_ytdlp(url: str) -> dict:
    try:
        result = subprocess.run(
            [sys.executable, "-m", "yt_dlp", "--dump-json", "--no-download", "--quiet", url],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return {"url": url, "error": result.stderr.strip() or "yt-dlp returned no data"}

        data = json.loads(result.stdout.strip())
        track = data.get("track")
        artist = data.get("artist")
        is_original = not bool(track)
        uploader = data.get("uploader") or data.get("channel") or "unknown"
        audio_title = f"Original audio by @{uploader}" if is_original else track

        return {
            "url": url,
            "reelId": data.get("id"),
            "creator": uploader,
            "caption": (data.get("description") or data.get("title") or "")[:200],
            "track": track,
            "artist": artist,
            "album": data.get("album"),
            "audioTitle": audio_title,
            "isOriginalSound": is_original,
        }
    except subprocess.TimeoutExpired:
        return {"url": url, "error": "timeout extracting reel"}
    except json.JSONDecodeError:
        return {"url": url, "error": "yt-dlp returned invalid JSON"}
    except Exception as e:
        return {"url": url, "error": str(e)}


def scan_account(username: str, limit: int) -> dict:
    L = instaloader.Instaloader(
        quiet=True,
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        save_metadata=False,
        post_metadata_txt_pattern="",
    )

    try:
        profile = instaloader.Profile.from_username(L.context, username)
    except instaloader.exceptions.ProfileNotExistsException:
        return {"username": username, "count": 0, "results": [], "error": f"Account @{username} niet gevonden."}
    except instaloader.exceptions.PrivateProfileNotFollowedException:
        return {"username": username, "count": 0, "results": [], "error": f"Account @{username} is privé."}
    except Exception as e:
        return {"username": username, "count": 0, "results": [], "error": str(e)}

    reel_urls = []
    try:
        for post in profile.get_posts():
            if len(reel_urls) >= limit:
                break
            if post.is_video:
                reel_urls.append(f"https://www.instagram.com/reel/{post.shortcode}/")
    except Exception as e:
        return {"username": username, "count": 0, "results": [], "error": f"Kon posts niet ophalen: {e}"}

    if not reel_urls:
        return {"username": username, "count": 0, "results": [], "error": "Geen video posts gevonden op dit account."}

    results_map: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(extract_audio_ytdlp, url): url for url in reel_urls}
        for future in as_completed(futures):
            url = futures[future]
            try:
                results_map[url] = future.result()
            except Exception as e:
                results_map[url] = {"url": url, "error": str(e)}

    results = [results_map[url] for url in reel_urls if url in results_map]
    return {"username": username, "count": len(results), "results": results}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"username": "", "count": 0, "results": [], "error": "no payload provided"}))
        sys.exit(1)

    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        print(json.dumps({"username": "", "count": 0, "results": [], "error": "invalid JSON payload"}))
        sys.exit(1)

    username = payload.get("username", "").lstrip("@").strip()
    limit = min(int(payload.get("limit", 30)), 50)

    if not username or not USERNAME_RE.match(username):
        print(json.dumps({"username": "", "count": 0, "results": [], "error": "invalid username"}))
        sys.exit(1)

    print(json.dumps(scan_account(username, limit)))


if __name__ == "__main__":
    main()
