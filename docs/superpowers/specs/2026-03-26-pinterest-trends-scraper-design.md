# Pinterest Trends Scraper — Design Spec

## Context

The Action Tools trend prediction pipeline currently uses TikTok, Reddit, Facebook, and RSS feeds as signal sources. Pinterest Trends (trends.pinterest.com) provides trending search terms per country and category — a strong demand signal for predicting which Action products will perform well on social media. Pinterest data is especially valuable because it captures **planning intent** (people pin what they want to do/buy), which is 2-4 weeks ahead of actual purchases.

Pinterest Trends has no public API, so we scrape it using Playwright. Note: the prediction pipeline moved from Playwright to Firecrawl for Vercel compatibility, but Firecrawl cannot handle Pinterest's SPA. This scraper runs **locally only** (not on Vercel) and uploads results to Supabase, which the pipeline then reads.

## Components

### 1. Playwright Script: `tools/scrape_pinterest_trends.py`

**Pattern:** Follows `tools/scrape_action_batch.py` conventions exactly.

**Input** (JSON via CLI argument):
```json
{
  "region": "NL",
  "categories": ["home-decor", "diy-and-crafts", "food-and-drink", "garden", "kids", "beauty", "holidays-and-events"]
}
```

**Defaults:** If `categories` is omitted, all 7 categories above are scraped. `region` defaults to `"NL"`.

**Output** (JSON via stdout):
```json
{
  "trends": [
    {
      "keyword": "japandi woonkamer",
      "category": "home-decor",
      "growth": "+150%",
      "region": "NL"
    }
  ],
  "scrapedAt": "2026-03-26T10:00:00Z",
  "count": 42,
  "debug": {
    "screenshotPath": ".tmp/pinterest-trends-debug.png",
    "pagesScraped": 7
  }
}
```

**Flow:**
1. Launch headless Chromium with Dutch locale (`nl-NL`) and realistic user agent
2. Navigate to `trends.pinterest.com`
3. Dismiss cookie banner (same selectors pattern as Action scraper + Pinterest-specific selectors)
4. Set region to NL (via UI dropdown or URL parameter — determined during first exploratory run)
5. For each category:
   - Navigate to category page
   - Wait for trend content to render
   - Extract trending keywords + growth indicators via `page.evaluate()`
   - Random delay between categories (2-5 seconds) to avoid bot detection
6. Return combined JSON result

**First run is exploratory:** The script saves a screenshot (`.tmp/pinterest-trends-debug.png`) and logs the page structure. This tells us exactly what selectors to use and what data is available. The script will be refined after this first run.

**Error handling:**
- Cookie banner not found: continue (non-fatal)
- Category page fails to load: skip category, log error, continue with remaining
- No trends found on a page: log warning, return empty array for that category
- All categories fail: return `{"trends": [], "count": 0, "error": "all_categories_failed"}`

### 2. Supabase Table: `pinterest_trends`

| Column | Type | Description |
|---|---|---|
| `id` | serial (PK) | Auto-increment |
| `created_at` | timestamptz | Row creation time |
| `keyword` | text | Trending search term |
| `category` | text | Pinterest category (e.g., "home-decor") |
| `growth_raw` | text | Growth indicator as displayed ("+150%", "trending", null) |
| `growth_pct` | numeric | Parsed numeric growth if available (150, null) — enables sorting/comparison |
| `region` | text | Country code ("NL") |
| `week` | text | ISO week ("2026-W13") |

**Unique constraint:** `(keyword, category, region, week)` — prevents duplicate rows on re-runs.

**Index:** Composite on `(week, region, category)` for fast queries by the prediction pipeline.

**Retention:** Keep all historical data — enables week-over-week comparison (is a trend new or sustained?).

### 3. Upload to Supabase

The Python script outputs JSON to stdout (matching existing `tools/` pattern). A separate Next.js API route handles the Supabase upload — this is consistent with the codebase where all Supabase writes go through TypeScript using credentials from `.env.local`.

**New API route: `app/api/trends/pinterest/route.ts`**
- POST endpoint that accepts the scraper JSON output and upserts into `pinterest_trends`
- Uses existing `lib/supabase-admin.ts` (service role client)
- Deduplicates on `(keyword, category, region, week)` — re-running the scraper in the same week overwrites, not duplicates

**Usage:** `python3 tools/scrape_pinterest_trends.py '{"region": "NL"}' | curl -X POST -d @- http://localhost:3000/api/trends/pinterest`

### 4. Prediction Pipeline Integration

**File:** `app/api/trends/predict/route.ts`

**Change:** Add a parallel Supabase fetch alongside existing TikTok/Reddit/Facebook fetches:

```typescript
// Fetch most recent week's Pinterest trends
const currentWeek = getCurrentISOWeek() // e.g., "2026-W13"
const pinterestRes = await supabase
  .from('pinterest_trends')
  .select('keyword, category, growth_raw')
  .eq('region', 'NL')
  .eq('week', currentWeek)
  .order('growth_pct', { ascending: false, nullsFirst: false })
  .limit(50)
```

Note: if no data exists for the current week (scraper hasn't run yet), fall back to the most recent week that has data.

**Prompt addition:** New section inserted between RSS trends and social data. Built dynamically from query results, grouped by category:

```
━━━ PINTEREST TRENDS NL (week 13) ━━━
HOME DECOR: japandi woonkamer (+150%), minimalistische opberging, aarde tinten
DIY & CRAFTS: macramé plantenhanger, budget kamer makeover (+80%)
GARDEN: balkon inrichten, verticale tuin, solar verlichting
SEASONAL: paas decoratie (+200%), lente tafel styling
```

**Scoring instruction addition:**
```
Weeg PINTEREST TRENDS mee: producten die aansluiten bij trending Pinterest zoektermen
scoren hoger op SEIZOEN RELEVANTIE en VIRALE POTENTIE, omdat Pinterest-gebruikers
actief plannen om deze producten te kopen of gebruiken.
```

### 5. Schedule

- **Frequency:** Weekly (manually triggered initially)
- **Command:** `python3 tools/scrape_pinterest_trends.py '{"region": "NL"}'`
- **Automation (later):** Local cron job once the scraper is stable (Playwright cannot run on Vercel)

## Files to Create/Modify

| Action | File | Description |
|---|---|---|
| CREATE | `tools/scrape_pinterest_trends.py` | Playwright scraper script (runs locally) |
| CREATE | `app/api/trends/pinterest/route.ts` | POST endpoint to upload scraped data to Supabase |
| MODIFY | `app/api/trends/predict/route.ts` | Add Pinterest data fetch + prompt section |
| CREATE | Supabase table `pinterest_trends` | Via Supabase dashboard (with unique constraint + index) |
| CREATE | `workflows/scrape_pinterest_trends.md` | WAT workflow SOP for running the scraper |

## Verification

1. **Scraper works:** Run `python3 tools/scrape_pinterest_trends.py '{"region": "NL"}'` — should output JSON with trends (or debug screenshot if page structure needs adjustment)
2. **Data stored:** Check Supabase `pinterest_trends` table has rows with correct week/region
3. **Pipeline integration:** Run prediction pipeline with `?refresh=1` — check that the scoring prompt includes Pinterest trends section
4. **Scoring impact:** Compare a prediction with and without Pinterest data — trends that match Pinterest should score higher on seasonal relevance and viral potential

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Pinterest blocks scraper | Realistic user agent, Dutch locale, random delays (2-5s), weekly only |
| Page structure changes | Debug screenshot on every run, script designed for easy selector updates |
| Trends data is too vague | Refine after first exploratory run — adjust categories or add search-based scraping (Approach B) |
| Rate limiting | Max 7 page loads per run (one per category), 2-5s delays between |
