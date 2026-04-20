#!/usr/bin/env python3
"""
Action.com price scraper — WAT Layer 3 Tool

Usage:
    python3 scrape_action_price.py '{"productName": "bamboe snijplank", "priceInImage": "2.99", "countries": ["nl", "fr"]}'

Output (stdout):
    JSON with price data from Action's website per requested country
"""

import sys
import json
import time
import re

# Country → locale URL prefix mapping
COUNTRY_LOCALES = {
    "nl": "nl-nl",
    "fr": "fr-fr",
    "de": "de-de",
    "be": "nl-be",
    "es": "es-es",
    "it": "it-it",
    "pl": "pl-pl",
    "cz": "cs-cz",
    "sk": "sk-sk",
    "hu": "hu-hu",
    "at": "de-at",
    "ch": "de-ch",
}

def build_search_url(locale: str, query: str) -> str:
    encoded = query.replace(" ", "+")
    return f"https://www.action.com/{locale}/zoeken/?query={encoded}"

def parse_price(price_str: str) -> float | None:
    """Convert a price string like '€2,99' or '2.99' to float."""
    cleaned = re.sub(r"[^\d.,]", "", price_str)
    # Handle European comma decimal
    if "," in cleaned and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    elif "," in cleaned and "." in cleaned:
        # e.g. "1.299,99" → "1299.99"
        cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None

def prices_match(price_in_image: str, website_price: float, tolerance: float = 0.01) -> bool:
    img_price = parse_price(price_in_image)
    if img_price is None:
        return False
    return abs(img_price - website_price) <= tolerance

def scrape_with_requests(locale: str, query: str) -> dict | None:
    """Attempt scraping with requests + BeautifulSoup (fast, no JS)."""
    try:
        import requests
        from bs4 import BeautifulSoup

        url = build_search_url(locale, query)
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": f"{locale.replace('-', '_')},en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }

        resp = requests.get(url, headers=headers, timeout=6)
        if resp.status_code != 200:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        # Try to find product price — Action uses various class names
        # Look for common price patterns
        price_selectors = [
            ".product-price",
            "[class*='price']",
            "[data-price]",
            ".price__value",
        ]

        for selector in price_selectors:
            elements = soup.select(selector)
            for el in elements:
                text = el.get_text(strip=True)
                price = parse_price(text)
                if price is not None and price > 0:
                    return {
                        "found": True,
                        "price": price,
                        "url": url,
                        "raw_text": text,
                    }

        # Page loaded but no price found (likely JS-rendered)
        return None

    except Exception:
        return None

def scrape_with_playwright(locale: str, query: str) -> dict | None:
    """Fallback: use playwright for JS-rendered pages."""
    try:
        from playwright.sync_api import sync_playwright

        url = build_search_url(locale, query)

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_extra_http_headers({
                "Accept-Language": f"{locale.replace('-', '_')},en;q=0.9"
            })

            page.goto(url, wait_until="domcontentloaded", timeout=8000)

            # Wait briefly for JS to render prices
            try:
                page.wait_for_selector("[class*='price']", timeout=3000)
            except Exception:
                pass

            # Extract price text
            price_els = page.query_selector_all("[class*='price']")
            for el in price_els:
                text = el.inner_text().strip()
                price = parse_price(text)
                if price is not None and price > 0:
                    browser.close()
                    return {
                        "found": True,
                        "price": price,
                        "url": url,
                        "raw_text": text,
                    }

            browser.close()
            return {"found": False, "price": 0, "url": url, "raw_text": ""}

    except ImportError:
        return None
    except Exception:
        return None

def lookup_price(product_name: str, price_in_image: str, countries: list[str]) -> dict:
    results = []

    for country in countries:
        locale = COUNTRY_LOCALES.get(country)
        if not locale:
            results.append({
                "country": country,
                "found": False,
                "price": 0,
                "url": "",
                "match": False,
                "error": "unsupported_country",
            })
            continue

        # Try requests first, then playwright
        data = scrape_with_requests(locale, product_name)
        if data is None:
            data = scrape_with_playwright(locale, product_name)

        if data and data.get("found") and data.get("price", 0) > 0:
            match = prices_match(price_in_image, data["price"]) if price_in_image else False
            results.append({
                "country": country,
                "found": True,
                "price": data["price"],
                "url": data["url"],
                "match": match,
            })
        else:
            results.append({
                "country": country,
                "found": False,
                "price": 0,
                "url": build_search_url(locale, product_name),
                "match": False,
            })

        # Small delay to avoid rate limiting
        time.sleep(0.5)

    return {"success": True, "results": results, "error": None}

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "results": [], "error": "no_input"}))
        sys.exit(1)

    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        print(json.dumps({"success": False, "results": [], "error": "invalid_json"}))
        sys.exit(1)

    product_name = payload.get("productName", "")
    price_in_image = payload.get("priceInImage", "")
    countries = payload.get("countries", [])

    if not product_name or not countries:
        print(json.dumps({"success": False, "results": [], "error": "missing_fields"}))
        sys.exit(1)

    result = lookup_price(product_name, price_in_image, countries)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
