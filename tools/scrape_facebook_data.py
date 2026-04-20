#!/usr/bin/env python3
"""
Facebook Data Scraper
Placeholder script that generates sample Facebook data for testing.
Replace with actual Facebook Graph API or scraping logic.
"""

import json
import sys
from datetime import datetime, timedelta
import random

def generate_sample_facebook_data():
    """Generate sample Facebook data matching the Supabase table structure"""

    # Sample data for posts
    post_texts = [
        "Check out this amazing product! #shopping #deals",
        "Just discovered something incredible! What do you think?",
        "Can't believe how good this is! 🔥",
        "Everyone needs to see this! #viral #trending"
    ]

    account_names = ["ShopSmart", "DealHunter", "TrendSetter", "ProductReviews"]
    media_types = ["photo", "video", "link", "status"]

    data = []

    # Generate 10-20 sample posts
    for i in range(random.randint(10, 20)):
        post = {
            "Post ID": f"fb_post_{random.randint(1000000000000000, 9999999999999999)}",
            "Post Text": random.choice(post_texts),
            "Post Date": (datetime.now() - timedelta(hours=random.randint(0, 48))).isoformat(),
            "Likes Count": random.randint(10, 10000),
            "Comments Count": random.randint(0, 1000),
            "Shares Count": random.randint(0, 500),
            "Post URL": f"https://facebook.com/{random.choice(account_names)}/posts/{random.randint(1000000000000000, 9999999999999999)}",
            "Account Name": random.choice(account_names),
            "Account URL": f"https://facebook.com/{random.choice(account_names)}",
            "Media Type": random.choice(media_types),
            "Media URL": f"https://example.com/media/{random.randint(1000, 9999)}.jpg" if random.choice([True, False]) else None,
            "Hashtags": "#viral, #trending, #facebook",
            "Mentions": f"@{random.choice(account_names)}",
            "created_at": (datetime.now() - timedelta(hours=random.randint(0, 24))).isoformat()
        }
        data.append(post)

    return data

def main():
    """Main function to generate and output Facebook data"""
    try:
        data = generate_sample_facebook_data()

        # Output as JSON for API consumption
        output = {"data": data}
        print(json.dumps(output, indent=2))

    except Exception as e:
        print(f"Error generating Facebook data: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()