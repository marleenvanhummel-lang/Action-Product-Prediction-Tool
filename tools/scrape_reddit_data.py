#!/usr/bin/env python3
"""
Reddit Data Scraper
Placeholder script that generates sample Reddit data for testing.
Replace with actual Reddit API (PRAW) or scraping logic.
"""

import json
import sys
from datetime import datetime, timedelta
import random

def generate_sample_reddit_data():
    """Generate sample Reddit data matching the Supabase table structure"""

    # Sample data for posts
    post_titles = [
        "This product changed my life! You need to try it",
        "Amazing deal on this item - don't miss out!",
        "Just got this and it's incredible",
        "Thoughts on this trending product?"
    ]

    subreddits = ["r/shopping", "r/deals", "r/products", "r/reviews", "r/buyitforlife"]
    authors = ["ProductLover", "DealSeeker", "ReviewMaster", "ShoppingExpert"]
    media_types = ["image", "video", "text", "link"]

    data = []

    # Generate 10-20 sample posts
    for i in range(random.randint(10, 20)):
        post = {
            "Post ID": f"t3_{random.randint(10000000, 99999999)}",
            "Post Title": random.choice(post_titles),
            "Post Text": f"This is a detailed post about the product. It's really amazing and I highly recommend it! {random.choice(['Check it out!', 'Worth every penny!', 'Game changer!'])}",
            "Post Date": (datetime.now() - timedelta(hours=random.randint(0, 72))).isoformat(),
            "Upvotes": random.randint(10, 5000),
            "Downvotes": random.randint(0, 100),
            "Comments Count": random.randint(5, 500),
            "Post URL": f"https://reddit.com/r/{random.choice(subreddits).replace('r/', '')}/comments/{random.randint(10000000, 99999999)}",
            "Subreddit": random.choice(subreddits),
            "Author": random.choice(authors),
            "Author Karma": random.randint(1000, 50000),
            "Media Type": random.choice(media_types),
            "Media URL": f"https://i.redd.it/{random.randint(100000, 999999)}.jpg" if random.choice([True, False]) else None,
            "Hashtags": "#reddit, #products, #reviews",
            "Mentions": f"u/{random.choice(authors)}",
            "created_at": (datetime.now() - timedelta(hours=random.randint(0, 24))).isoformat()
        }
        data.append(post)

    return data

def main():
    """Main function to generate and output Reddit data"""
    try:
        data = generate_sample_reddit_data()

        # Output as JSON for API consumption
        output = {"data": data}
        print(json.dumps(output, indent=2))

    except Exception as e:
        print(f"Error generating Reddit data: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()