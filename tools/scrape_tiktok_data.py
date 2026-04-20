#!/usr/bin/env python3
"""
TikTok Data Scraper
Placeholder script that generates sample TikTok data for testing.
Replace with actual TikTok API or scraping logic.
"""

import json
import sys
from datetime import datetime, timedelta
import random

def generate_sample_tiktok_data():
    """Generate sample TikTok data matching the Supabase table structure"""

    # Sample hashtags and search terms
    hashtags = ["#fyp", "#viral", "#trending", "#tiktok", "#dance", "#music", "#funny"]
    search_terms = ["viral dance", "music trends", "funny videos", "tiktok challenges"]

    data = []

    # Generate 10-20 sample posts
    for i in range(random.randint(10, 20)):
        post = {
            "Caption": f"Amazing viral content #{random.choice(hashtags)} {random.choice(hashtags)}",
            "Video URL": f"https://tiktok.com/@user{i}/video/{random.randint(1000000000000000000, 9999999999999999999)}",
            "Views": random.randint(1000, 1000000),
            "Likes": random.randint(100, 500000),
            "Shares": random.randint(10, 50000),
            "Comments": random.randint(5, 10000),
            "Zoekterm": random.choice(search_terms),
            "Tags": ", ".join(random.sample(hashtags, random.randint(1, 3))),
            "Is ad?": random.choice([True, False]),
            "created_at": (datetime.now() - timedelta(hours=random.randint(0, 24))).isoformat()
        }
        data.append(post)

    return data

def main():
    """Main function to generate and output TikTok data"""
    try:
        data = generate_sample_tiktok_data()

        # Output as JSON for API consumption
        output = {"data": data}
        print(json.dumps(output, indent=2))

    except Exception as e:
        print(f"Error generating TikTok data: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()