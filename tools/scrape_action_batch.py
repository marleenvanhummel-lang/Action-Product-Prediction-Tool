#!/usr/bin/env python3
"""
Action.com batch product scraper — WAT Layer 3 Tool

Playwright-only (Action.com is a JS-rendered SPA; requests returns empty HTML).

Usage:
    python3 scrape_action_batch.py '{"searchTerm": "woonkamer decoratie", "category": "Home Decor", "maxProducts": 15}'

Output (stdout):
    {"products": [...], "count": N}
"""

import sys
import json
import re
from typing import Optional


def parse_price(price_str: str) -> Optional[float]:
    if not price_str:
        return None
    cleaned = re.sub(r"[^\d.,]", "", price_str)
    if not cleaned:
        return None
    if "," in cleaned and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    elif "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None


def build_search_url(search_term: str) -> str:
    encoded = search_term.replace(" ", "+")
    return f"https://www.action.com/nl-nl/search/?q={encoded}"


def scrape_batch(search_term: str, category: str, max_products: int, page_url: str = "") -> dict:
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError
    except ImportError:
        return {"products": [], "count": 0, "error": "playwright_not_installed"}

    url = page_url if page_url else build_search_url(search_term)
    products = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/121.0.0.0 Safari/537.36"
                ),
                extra_http_headers={"Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8"},
            )
            page = context.new_page()

            try:
                page.goto(url, wait_until="networkidle", timeout=20000)
            except PWTimeoutError:
                # networkidle timed out — page may still have content
                pass
            except Exception:
                browser.close()
                return {"products": [], "count": 0, "error": "navigation_failed"}

            # Dismiss Cookiebot banner if present
            for selector in [
                "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
                "#CybotCookiebotDialogBodyButtonAccept",
                "button[id*='CybotCookiebot'][id*='Allow']",
                "button:has-text('Alles accepteren')",
                "button:has-text('Accepteer alle')",
                "button:has-text('Accept all')",
            ]:
                try:
                    btn = page.locator(selector).first
                    if btn.is_visible(timeout=1000):
                        btn.click(timeout=2000)
                        page.wait_for_timeout(500)
                        break
                except Exception:
                    continue

            # Wait for product cards (Action.com uses data-testid="product-card")
            product_selector = '[data-testid="product-card"]'
            try:
                page.wait_for_selector(product_selector, timeout=10000)
            except PWTimeoutError:
                browser.close()
                return {"products": [], "count": 0, "error": "no_products_found"}

            # Extract product data via JS using stable data-testid attributes
            raw_products = page.evaluate(
                """(args) => {
                const { maxProducts, baseUrl } = args;
                const cards = Array.from(
                    document.querySelectorAll('[data-testid="product-card"]')
                ).slice(0, maxProducts);

                return cards.map(card => {
                    // Image
                    const img = card.querySelector('[data-testid="product-card-image"]');
                    let imageUrl = null;
                    if (img) {
                        imageUrl = img.src || null;
                        if (imageUrl && (imageUrl.startsWith('data:') || imageUrl.includes('placeholder'))) {
                            imageUrl = null;
                        }
                    }

                    // Product name
                    const titleEl = card.querySelector('[data-testid="product-card-title"]');
                    const productName = titleEl
                        ? (titleEl.innerText || titleEl.textContent || '').trim() || null
                        : null;

                    // Price: combine whole + fractional parts (e.g. "4" + "99" → "4,99")
                    const priceWhole = card.querySelector('[data-testid="product-card-price-whole"]');
                    const priceFrac = card.querySelector('[data-testid="product-card-price-fractional"]');
                    let priceText = null;
                    if (priceWhole) {
                        const whole = (priceWhole.textContent || '').trim();
                        const frac = priceFrac ? (priceFrac.textContent || '').trim() : '00';
                        priceText = whole + ',' + frac;
                    }

                    // Product URL (links are relative like /nl-nl/p/...)
                    const link = card.querySelector('[data-testid="product-card-link"]');
                    let productUrl = null;
                    if (link) {
                        const href = link.getAttribute('href') || '';
                        productUrl = href.startsWith('http') ? href : (href.startsWith('/') ? baseUrl + href : href);
                    }

                    return { imageUrl, productName, priceText, productUrl };
                });
            }""",
                {
                    "maxProducts": max_products,
                    "baseUrl": "https://www.action.com",
                },
            )

            browser.close()

            for item in raw_products:
                if not item:
                    continue
                product_name = item.get("productName")
                image_url = item.get("imageUrl")
                product_url = item.get("productUrl") or url
                price = parse_price(item.get("priceText") or "")

                # Only include if we have at least a name or image
                if product_name or image_url:
                    products.append(
                        {
                            "productName": product_name,
                            "imageUrl": image_url,
                            "productUrl": product_url,
                            "price": price,
                            "category": category,
                            "searchTerm": search_term,
                        }
                    )

    except Exception as e:
        return {"products": [], "count": 0, "error": str(e)}

    return {"products": products, "count": len(products)}


def main():
    if len(sys.argv) < 2:
        print(
            json.dumps({"products": [], "count": 0, "error": "no_input"})
        )
        sys.exit(1)

    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        print(json.dumps({"products": [], "count": 0, "error": "invalid_json"}))
        sys.exit(1)

    search_term = payload.get("searchTerm", "")
    category = payload.get("category", "General")
    max_products = int(payload.get("maxProducts", 15))
    page_url = payload.get("pageUrl", "")

    if page_url and not page_url.startswith("https://www.action.com/"):
        print(json.dumps({"products": [], "count": 0, "error": "invalid_page_url"}))
        sys.exit(1)

    if not search_term and not page_url:
        print(json.dumps({"products": [], "count": 0, "error": "missing_search_term"}))
        sys.exit(1)

    result = scrape_batch(search_term, category, max_products, page_url)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
