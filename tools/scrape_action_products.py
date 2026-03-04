#!/usr/bin/env python3
"""
Action.com product scraper — WAT Layer 3 Tool

Usage:
    python3 scrape_action_products.py '{"searchTerm": "bamboe snijplank"}'

Output (stdout):
    JSON with first product result from Action.com search
"""

import sys
import json
import re


def build_search_url(search_term: str) -> str:
    encoded = search_term.replace(" ", "+")
    return f"https://www.action.com/nl-nl/zoeken/?query={encoded}"


def parse_price(price_str: str) -> float | None:
    cleaned = re.sub(r"[^\d.,]", "", price_str)
    if "," in cleaned and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    elif "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def scrape_with_requests(search_term: str) -> dict | None:
    try:
        import requests
        from bs4 import BeautifulSoup

        url = build_search_url(search_term)
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }

        resp = requests.get(url, headers=headers, timeout=8)
        if resp.status_code != 200:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        # Try to find first product card
        product_card = None
        card_selectors = [
            "[class*='product-card']",
            "[class*='product_card']",
            "[class*='ProductCard']",
            ".product-item",
            "[class*='product-tile']",
            "article",
        ]
        for selector in card_selectors:
            cards = soup.select(selector)
            if cards:
                product_card = cards[0]
                break

        if not product_card:
            return None

        # Extract image
        image_url = None
        img = product_card.find("img")
        if img:
            image_url = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
            # Make absolute if relative
            if image_url and image_url.startswith("/"):
                image_url = "https://www.action.com" + image_url

        # Extract product name
        product_name = None
        name_selectors = [
            "[class*='product-name']",
            "[class*='product_name']",
            "[class*='ProductName']",
            "[class*='product-title']",
            "h3", "h2",
        ]
        for sel in name_selectors:
            el = product_card.select_one(sel)
            if el:
                text = el.get_text(strip=True)
                if text:
                    product_name = text
                    break

        # Extract price
        price = None
        price_selectors = [
            "[class*='price']",
            "[data-price]",
        ]
        for sel in price_selectors:
            el = product_card.select_one(sel)
            if el:
                text = el.get_text(strip=True)
                p = parse_price(text)
                if p is not None and p > 0:
                    price = p
                    break

        # Extract product URL
        product_url = None
        link = product_card.find("a", href=True)
        if link:
            href = link["href"]
            if href.startswith("/"):
                product_url = "https://www.action.com" + href
            elif href.startswith("http"):
                product_url = href

        if product_name or image_url:
            return {
                "found": True,
                "productName": product_name,
                "imageUrl": image_url,
                "productUrl": product_url or url,
                "price": price,
            }

        return None

    except Exception:
        return None


def scrape_with_playwright(search_term: str) -> dict | None:
    try:
        from playwright.sync_api import sync_playwright

        url = build_search_url(search_term)

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_extra_http_headers({
                "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8"
            })

            page.goto(url, wait_until="domcontentloaded", timeout=10000)

            # Wait for product cards
            try:
                page.wait_for_selector("[class*='product']", timeout=5000)
            except Exception:
                pass

            # Try to get first product card data
            result = page.evaluate("""() => {
                const selectors = [
                    "[class*='product-card']",
                    "[class*='product_card']",
                    "[class*='ProductCard']",
                    ".product-item",
                    "article"
                ];

                let card = null;
                for (const sel of selectors) {
                    card = document.querySelector(sel);
                    if (card) break;
                }

                if (!card) return null;

                const img = card.querySelector('img');
                const imageUrl = img ? (img.src || img.dataset.src || img.dataset.lazySrc || null) : null;

                const nameSelectors = ["[class*='product-name']", "[class*='product-title']", "h3", "h2"];
                let productName = null;
                for (const sel of nameSelectors) {
                    const el = card.querySelector(sel);
                    if (el && el.innerText.trim()) {
                        productName = el.innerText.trim();
                        break;
                    }
                }

                const priceEl = card.querySelector("[class*='price']");
                const priceText = priceEl ? priceEl.innerText.trim() : null;

                const link = card.querySelector('a[href]');
                let productUrl = link ? link.href : null;

                return { imageUrl, productName, priceText, productUrl };
            }""")

            browser.close()

            if not result:
                return {"found": False, "productName": None, "imageUrl": None, "productUrl": url, "price": None}

            price = parse_price(result.get("priceText") or "") if result.get("priceText") else None

            return {
                "found": bool(result.get("productName") or result.get("imageUrl")),
                "productName": result.get("productName"),
                "imageUrl": result.get("imageUrl"),
                "productUrl": result.get("productUrl") or url,
                "price": price,
            }

    except ImportError:
        return None
    except Exception:
        return None


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"found": False, "productName": None, "imageUrl": None, "productUrl": None, "price": None, "error": "no_input"}))
        sys.exit(1)

    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        print(json.dumps({"found": False, "productName": None, "imageUrl": None, "productUrl": None, "price": None, "error": "invalid_json"}))
        sys.exit(1)

    search_term = payload.get("searchTerm", "")
    if not search_term:
        print(json.dumps({"found": False, "productName": None, "imageUrl": None, "productUrl": None, "price": None, "error": "missing_search_term"}))
        sys.exit(1)

    result = scrape_with_requests(search_term)
    if result is None:
        result = scrape_with_playwright(search_term)

    if result is None:
        result = {
            "found": False,
            "productName": None,
            "imageUrl": None,
            "productUrl": build_search_url(search_term),
            "price": None,
        }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
