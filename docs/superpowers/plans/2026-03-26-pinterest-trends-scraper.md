# Pinterest Trends Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape trending search terms from Pinterest Trends (NL) and integrate them as a demand signal into the product prediction pipeline.

**Architecture:** A Playwright Python script (`tools/`) scrapes trends.pinterest.com per category, outputs JSON to stdout. A Next.js API route receives that JSON and upserts it into a Supabase `pinterest_trends` table. The prediction pipeline (`predict/route.ts`) reads the latest Pinterest data from Supabase and includes it in the Claude scoring prompt.

**Tech Stack:** Playwright (Python), Next.js API route, Supabase, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-26-pinterest-trends-scraper-design.md`

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| CREATE | `tools/scrape_pinterest_trends.py` | Playwright scraper — navigates trends.pinterest.com, extracts trending keywords per category for NL |
| CREATE | `app/api/trends/pinterest/route.ts` | POST endpoint — receives scraper JSON, upserts into Supabase `pinterest_trends` table |
| MODIFY | `app/api/trends/predict/route.ts` | Add Pinterest data fetch + format as prompt section + add `pinterestSummary` param to `scoreBatch` |
| CREATE | `workflows/scrape_pinterest_trends.md` | WAT workflow SOP for running the scraper |

**Supabase table `pinterest_trends`** must be created manually via Supabase dashboard before Task 2.

---

### Task 1: Create the Playwright scraper (exploratory first run)

This is the core scraper. Because we don't know the exact page structure yet, the first version focuses on navigation + screenshot capture so we can see what's available.

**Files:**
- Create: `tools/scrape_pinterest_trends.py`

- [ ] **Step 1: Create the scraper script with exploration mode**

```python
#!/usr/bin/env python3
"""
Pinterest Trends scraper — WAT Layer 3 Tool

Scrapes trending search terms from trends.pinterest.com for a given region and set of categories.
First run is exploratory: saves screenshots and page HTML for selector discovery.

Usage:
    python3 scrape_pinterest_trends.py '{"region": "NL"}'
    python3 scrape_pinterest_trends.py '{"region": "NL", "categories": ["home-decor"]}'

Output (stdout):
    {"trends": [...], "scrapedAt": "...", "count": N, "debug": {...}}
"""

import sys
import json
import os
import random
import time
import re
from datetime import datetime, timezone
from typing import Optional


DEFAULT_CATEGORIES = [
    "home-decor",
    "diy-and-crafts",
    "food-and-drink",
    "garden",
    "kids",
    "beauty",
    "holidays-and-events",
]


def get_iso_week() -> str:
    now = datetime.now(timezone.utc)
    year, week, _ = now.isocalendar()
    return f"{year}-W{week:02d}"


def parse_growth(growth_str: str) -> Optional[float]:
    """Parse growth strings like '+150%', '150%', '-20%' into numeric values."""
    if not growth_str:
        return None
    match = re.search(r'([+-]?\d+)', growth_str)
    if match:
        return float(match.group(1))
    return None


def scrape_trends(region: str, categories: list[str]) -> dict:
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError
    except ImportError:
        return {"trends": [], "count": 0, "error": "playwright_not_installed"}

    trends = []
    pages_scraped = 0
    errors = []
    tmp_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".tmp")
    os.makedirs(tmp_dir, exist_ok=True)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/121.0.0.0 Safari/537.36"
                ),
                locale="nl-NL",
                extra_http_headers={"Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8"},
            )
            page = context.new_page()

            # Navigate to Pinterest Trends
            try:
                page.goto("https://trends.pinterest.com", wait_until="networkidle", timeout=30000)
            except PWTimeoutError:
                pass  # Page may still have content
            except Exception as e:
                browser.close()
                return {"trends": [], "count": 0, "error": f"navigation_failed: {e}"}

            # Dismiss cookie banner
            cookie_selectors = [
                "button[data-testid='cookie-accept']",
                "button:has-text('Accept')",
                "button:has-text('Accepteren')",
                "button:has-text('Alle accepteren')",
                "button:has-text('Accept all')",
                "[id*='onetrust-accept']",
                "[class*='cookie'] button",
            ]
            for selector in cookie_selectors:
                try:
                    btn = page.locator(selector).first
                    if btn.is_visible(timeout=2000):
                        btn.click(timeout=3000)
                        page.wait_for_timeout(1000)
                        break
                except Exception:
                    continue

            # Save debug screenshot of landing page
            screenshot_path = os.path.join(tmp_dir, "pinterest-trends-landing.png")
            page.screenshot(path=screenshot_path, full_page=True)

            # Save page HTML for selector discovery
            html_path = os.path.join(tmp_dir, "pinterest-trends-landing.html")
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(page.content())

            # Try to set region to NL if there's a region selector
            # (This will be refined after first exploratory run)
            region_selectors = [
                "button:has-text('Netherlands')",
                "button:has-text('Nederland')",
                f"[data-test-id='region-{region}']",
                f"a[href*='geo={region}']",
                f"a[href*='country={region}']",
            ]
            for selector in region_selectors:
                try:
                    btn = page.locator(selector).first
                    if btn.is_visible(timeout=2000):
                        btn.click(timeout=3000)
                        page.wait_for_timeout(2000)
                        break
                except Exception:
                    continue

            # Scrape each category
            for cat in categories:
                try:
                    # Try different URL patterns for category pages
                    cat_urls = [
                        f"https://trends.pinterest.com/trends/{cat}",
                        f"https://trends.pinterest.com/{cat}",
                        f"https://trends.pinterest.com/trends?category={cat}",
                    ]

                    page_loaded = False
                    for cat_url in cat_urls:
                        try:
                            page.goto(cat_url, wait_until="networkidle", timeout=20000)
                            page_loaded = True
                            break
                        except PWTimeoutError:
                            page_loaded = True  # May still have content
                            break
                        except Exception:
                            continue

                    if not page_loaded:
                        errors.append(f"{cat}: all URL patterns failed")
                        continue

                    # Wait for content to render
                    page.wait_for_timeout(3000)

                    # Save debug screenshot per category
                    cat_screenshot = os.path.join(tmp_dir, f"pinterest-trends-{cat}.png")
                    page.screenshot(path=cat_screenshot, full_page=True)

                    # Extract trending terms via page.evaluate
                    # These selectors will be refined after the exploratory run
                    extracted = page.evaluate("""() => {
                        const results = [];

                        // Strategy 1: Look for trend cards/items with common patterns
                        const trendSelectors = [
                            '[data-test-id*="trend"]',
                            '[class*="trend"]',
                            '[class*="Trend"]',
                            '.trendingTopic',
                            '[data-testid*="trend"]',
                            'a[href*="/trends/"]',
                        ];

                        for (const selector of trendSelectors) {
                            const elements = document.querySelectorAll(selector);
                            if (elements.length > 0) {
                                elements.forEach(el => {
                                    const text = (el.innerText || el.textContent || '').trim();
                                    if (text && text.length > 2 && text.length < 100) {
                                        results.push({
                                            keyword: text.split('\\n')[0].trim(),
                                            growth: null
                                        });
                                    }
                                });
                                if (results.length > 0) break;
                            }
                        }

                        // Strategy 2: If no trend-specific elements, look for list items or cards
                        if (results.length === 0) {
                            const cards = document.querySelectorAll('li, [role="listitem"], [class*="card"], [class*="Card"]');
                            cards.forEach(card => {
                                const text = (card.innerText || card.textContent || '').trim();
                                if (text && text.length > 3 && text.length < 80 && !text.includes('©')) {
                                    results.push({
                                        keyword: text.split('\\n')[0].trim(),
                                        growth: null
                                    });
                                }
                            });
                        }

                        // Look for growth indicators near trend items
                        const growthElements = document.querySelectorAll('[class*="growth"], [class*="percent"], [class*="change"]');
                        growthElements.forEach((el, i) => {
                            const text = (el.innerText || el.textContent || '').trim();
                            if (text && i < results.length) {
                                results[i].growth = text;
                            }
                        });

                        return results.slice(0, 20);
                    }""")

                    for item in extracted:
                        keyword = item.get("keyword", "").strip()
                        if keyword and len(keyword) > 2:
                            growth_raw = item.get("growth")
                            trends.append({
                                "keyword": keyword,
                                "category": cat,
                                "growth_raw": growth_raw,
                                "growth_pct": parse_growth(growth_raw) if growth_raw else None,
                                "region": region,
                            })

                    pages_scraped += 1

                    # Random delay between categories (2-5 seconds)
                    if cat != categories[-1]:
                        delay = random.uniform(2.0, 5.0)
                        time.sleep(delay)

                except Exception as e:
                    errors.append(f"{cat}: {str(e)}")
                    continue

            browser.close()

    except Exception as e:
        return {"trends": [], "count": 0, "error": str(e)}

    result = {
        "trends": trends,
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(trends),
        "week": get_iso_week(),
        "region": region,
        "debug": {
            "screenshotDir": tmp_dir,
            "pagesScraped": pages_scraped,
            "errors": errors,
        },
    }

    if len(trends) == 0 and len(errors) == len(categories):
        result["error"] = "all_categories_failed"

    return result


def main():
    if len(sys.argv) < 2:
        payload = {}
    else:
        try:
            payload = json.loads(sys.argv[1])
        except json.JSONDecodeError:
            print(json.dumps({"trends": [], "count": 0, "error": "invalid_json"}))
            sys.exit(1)

    region = payload.get("region", "NL")
    categories = payload.get("categories", DEFAULT_CATEGORIES)

    result = scrape_trends(region, categories)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the exploratory scrape**

Run: `cd "/Users/marleenvanhummel/Downloads/Action Tools REMAKE" && python3 tools/scrape_pinterest_trends.py '{"region": "NL", "categories": ["home-decor"]}'`

Expected: JSON output with `debug.screenshotDir` pointing to `.tmp/`. Check screenshots to see what Pinterest actually renders. The `trends` array may be empty on first run — that's expected.

- [ ] **Step 3: Review screenshots and refine selectors**

Open `.tmp/pinterest-trends-landing.png` and `.tmp/pinterest-trends-home-decor.png`. Based on the actual page structure:
- Update the category URL patterns (whichever worked)
- Update the `page.evaluate()` selectors to match the real DOM elements
- Update the region selection logic

- [ ] **Step 4: Run full scrape with refined selectors**

Run: `python3 tools/scrape_pinterest_trends.py '{"region": "NL"}'`
Expected: JSON with `count > 0` and `trends` array populated with keywords per category.

- [ ] **Step 5: Commit**

```bash
git add tools/scrape_pinterest_trends.py
git commit -m "feat: add Pinterest Trends scraper (Playwright)"
```

---

### Task 2: Create Supabase table

**Manual step** — done in Supabase dashboard.

- [ ] **Step 1: Create the `pinterest_trends` table**

Go to Supabase dashboard → SQL Editor and run:

```sql
CREATE TABLE pinterest_trends (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  keyword TEXT NOT NULL,
  category TEXT NOT NULL,
  growth_raw TEXT,
  growth_pct NUMERIC,
  region TEXT NOT NULL DEFAULT 'NL',
  week TEXT NOT NULL,
  UNIQUE (keyword, category, region, week)
);

CREATE INDEX idx_pinterest_trends_week_region_cat ON pinterest_trends (week, region, category);
```

- [ ] **Step 2: Verify table exists**

Run a test query in Supabase dashboard: `SELECT * FROM pinterest_trends LIMIT 1;`
Expected: Empty result set, no errors.

---

### Task 3: Create the upload API route

**Files:**
- Create: `app/api/trends/pinterest/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  // Simple API key check to prevent unauthorized writes
  const apiKey = req.headers.get('x-api-key')
  const expectedKey = process.env.PINTEREST_UPLOAD_KEY
  if (expectedKey && apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const trends = body.trends

    if (!Array.isArray(trends) || trends.length === 0) {
      return NextResponse.json({ error: 'No trends provided', inserted: 0 }, { status: 400 })
    }

    const week = body.week
    if (!week) {
      return NextResponse.json({ error: 'Missing week field', inserted: 0 }, { status: 400 })
    }

    const rows = trends.map((t: { keyword: string; category: string; growth_raw?: string; growth_pct?: number; region?: string }) => ({
      keyword: t.keyword,
      category: t.category,
      growth_raw: t.growth_raw ?? null,
      growth_pct: t.growth_pct ?? null,
      region: t.region ?? 'NL',
      week,
    }))

    const { data, error } = await supabaseAdmin
      .from('pinterest_trends')
      .upsert(rows, { onConflict: 'keyword,category,region,week' })
      .select()

    if (error) {
      console.error('[Pinterest Upload] Supabase error:', error.message)
      return NextResponse.json({ error: error.message, inserted: 0 }, { status: 500 })
    }

    return NextResponse.json({ inserted: data?.length ?? 0, week })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg, inserted: 0 }, { status: 500 })
  }
}

// GET: return latest Pinterest trends for display
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('pinterest_trends')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message, trends: [] }, { status: 500 })
  }

  return NextResponse.json({ trends: data ?? [], count: data?.length ?? 0 })
}
```

- [ ] **Step 2: Test the upload endpoint**

Start the dev server if not running: `npm run dev`

Test with curl using sample data:
```bash
curl -X POST http://localhost:3000/api/trends/pinterest \
  -H "Content-Type: application/json" \
  -d '{"week":"2026-W13","trends":[{"keyword":"test trend","category":"home-decor","growth_raw":"+50%","growth_pct":50,"region":"NL"}]}'
```

Expected: `{"inserted":1,"week":"2026-W13"}`

- [ ] **Step 3: Verify in Supabase**

Check in Supabase dashboard that the test row appears in `pinterest_trends`.

- [ ] **Step 4: Test deduplication**

Run the same curl command again.
Expected: `{"inserted":1,"week":"2026-W13"}` — upsert overwrites, no duplicate rows.

- [ ] **Step 5: Clean up test data**

Delete the test row in Supabase dashboard: `DELETE FROM pinterest_trends WHERE keyword = 'test trend';`

- [ ] **Step 6: Commit**

```bash
git add app/api/trends/pinterest/route.ts
git commit -m "feat: add Pinterest trends upload API route"
```

---

### Task 4: Integrate Pinterest data into prediction pipeline

**Files:**
- Modify: `app/api/trends/predict/route.ts` (lines 341-349 for `scoreBatch` signature, lines 354-411 for prompt, lines 467-473 for data fetching)

- [ ] **Step 1: Add `getCurrentISOWeek` helper function**

Add after the `getSeasonHint()` function (after line 113):

```typescript
function getCurrentISOWeek(): string {
  const now = new Date()
  const jan4 = new Date(now.getFullYear(), 0, 4)
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const diffMs = now.getTime() - startOfWeek1.getTime()
  const weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}
```

- [ ] **Step 2: Add Pinterest data fetch helper**

Add after the `getCurrentISOWeek` function:

```typescript
async function fetchPinterestTrends(): Promise<string> {
  const currentWeek = getCurrentISOWeek()

  // Try current week first (use supabaseAdmin to bypass RLS)
  let { data } = await supabaseAdmin
    .from('pinterest_trends')
    .select('keyword, category, growth_raw')
    .eq('region', 'NL')
    .eq('week', currentWeek)
    .order('growth_pct', { ascending: false, nullsFirst: false })
    .limit(50)

  // Fall back to most recent week if no data for current week
  if (!data || data.length === 0) {
    const fallback = await supabaseAdmin
      .from('pinterest_trends')
      .select('keyword, category, growth_raw, week')
      .eq('region', 'NL')
      .order('created_at', { ascending: false })
      .limit(50)
    data = fallback.data
    if (data && data.length > 0) {
      const week = data[0].week
      console.log(`[Pinterest] No data for ${currentWeek}, falling back to ${week}`)
    }
  }

  if (!data || data.length === 0) {
    console.log('[Pinterest] No Pinterest trend data available')
    return ''
  }

  // Group by category
  const grouped: Record<string, string[]> = {}
  for (const row of data) {
    const cat = (row.category ?? 'other').toUpperCase().replace(/-/g, ' ')
    if (!grouped[cat]) grouped[cat] = []
    const entry = row.growth_raw ? `${row.keyword} (${row.growth_raw})` : row.keyword
    grouped[cat].push(entry)
  }

  const lines = Object.entries(grouped)
    .map(([cat, keywords]) => `${cat}: ${keywords.join(', ')}`)
    .join('\n')

  return lines
}
```

- [ ] **Step 3: Add Pinterest fetch to the parallel data fetching**

Modify the `Promise.all` block in `runPrediction()` (line 467-473):

Change from:
```typescript
const [allProducts, redditResult, tiktokResult, fbResult, liveTrendSummary] = await Promise.all([
```

To:
```typescript
const [allProducts, redditResult, tiktokResult, fbResult, liveTrendSummary, pinterestSummary] = await Promise.all([
```

And add `fetchPinterestTrends(),` as the last item in the `Promise.all` array (after `fetchLiveTrends(),`).

- [ ] **Step 4: Update `scoreBatch` signature to accept Pinterest data**

Change the `scoreBatch` function signature (line 341-349) to add `pinterestSummary: string` as the last parameter:

```typescript
async function scoreBatch(
  batch: RawProduct[],
  globalOffset: number,
  redditSummary: string,
  tiktokSummary: string,
  fbSummary: string,
  liveTrendSummary: string,
  seasonHint: string,
  pinterestSummary: string
): Promise<ScoredItem[]> {
```

- [ ] **Step 5: Add Pinterest section to the scoring prompt**

In the `scoreBatch` function, add after the Facebook section in the prompt (after line 370 `${fbSummary || 'No data'}`):

```typescript
PINTEREST TRENDS (planning intent — wat NL consumenten zoeken/pinnen):
${pinterestSummary || 'No data'}
```

And add to the scoring instructions (after the CRITERIA list, after line 385 — after criterion 6 VIRALE POTENTIE):

```
Weeg PINTEREST TRENDS mee: producten die aansluiten bij trending Pinterest zoektermen scoren hoger op SEIZOEN RELEVANTIE en VIRALE POTENTIE, omdat Pinterest-gebruikers actief plannen om deze producten te kopen of gebruiken.
```

- [ ] **Step 6: Update `scoreBatch` calls to pass Pinterest data**

Update the call on line 510 to add `pinterestSummary`:

```typescript
return scoreBatch(batch, bi * SCORING_BATCH_SIZE, redditSummary, tiktokSummary, fbSummary, liveTrendSummary, seasonHint, pinterestSummary)
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd "/Users/marleenvanhummel/Downloads/Action Tools REMAKE" && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add app/api/trends/predict/route.ts
git commit -m "feat: integrate Pinterest trends into prediction pipeline"
```

---

### Task 5: Create WAT workflow file

**Files:**
- Create: `workflows/scrape_pinterest_trends.md`

- [ ] **Step 1: Write the workflow**

```markdown
# Scrape Pinterest Trends

## Objective
Scrape trending search terms from Pinterest Trends (NL) and upload to Supabase for use in the product prediction pipeline.

## Frequency
Weekly (every Monday recommended — trends update weekly).

## Prerequisites
- Playwright installed: `pip install playwright && playwright install chromium`
- Next.js dev server running: `npm run dev` (for upload endpoint)

## Steps

### 1. Run the scraper
```bash
python3 tools/scrape_pinterest_trends.py '{"region": "NL"}'
```

This outputs JSON to stdout and saves debug screenshots to `.tmp/`.

### 2. Upload to Supabase
Pipe the output to the upload endpoint:
```bash
python3 tools/scrape_pinterest_trends.py '{"region": "NL"}' | curl -X POST http://localhost:3000/api/trends/pinterest -H "Content-Type: application/json" -d @-
```

### 3. Verify
Check Supabase `pinterest_trends` table for new rows with the current week.

## Troubleshooting

| Problem | Solution |
|---|---|
| Playwright not installed | `pip install playwright && playwright install chromium` |
| 0 trends found | Check `.tmp/pinterest-trends-*.png` screenshots — page structure may have changed. Update selectors in `scrape_pinterest_trends.py` |
| Upload fails | Ensure dev server is running and Supabase credentials are set in `.env.local` |
| Pinterest blocks scraper | Wait a few hours and retry. Don't run more than once per week. |

## Notes
- The scraper runs locally only (Playwright can't run on Vercel)
- Debug screenshots are saved to `.tmp/` on every run
- The prediction pipeline automatically picks up Pinterest data from Supabase
- Re-running in the same week upserts (overwrites existing data, no duplicates)
```

- [ ] **Step 2: Commit**

```bash
git add workflows/scrape_pinterest_trends.md
git commit -m "docs: add Pinterest Trends scraper workflow"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Run scraper and upload**

```bash
python3 tools/scrape_pinterest_trends.py '{"region": "NL"}' | curl -X POST http://localhost:3000/api/trends/pinterest -H "Content-Type: application/json" -d @-
```

Expected: `{"inserted": N, "week": "2026-W13"}` with N > 0.

- [ ] **Step 2: Check Pinterest data appears in prediction pipeline**

Open: `http://localhost:3000/api/trends/predict?refresh=1`

Check server logs for `[Pinterest]` log lines confirming data was fetched and included.

- [ ] **Step 3: Verify scoring prompt includes Pinterest section**

Add a temporary `console.log(prompt)` in `scoreBatch` to verify the Pinterest section appears between the social data sections.

Remove the temporary log after verification.

- [ ] **Step 4: Final commit with any fixes**

```bash
git add -A
git commit -m "fix: refine Pinterest scraper selectors after exploratory run"
```
