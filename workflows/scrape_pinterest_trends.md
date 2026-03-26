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
Pipe the output to the upload endpoint (requires `API_SECRET` from `.env.local`):
```bash
API_SECRET=$(grep "^API_SECRET=" .env.local | cut -d= -f2)
python3 tools/scrape_pinterest_trends.py '{"region": "NL"}' | curl -X POST http://localhost:3000/api/trends/pinterest -H "Content-Type: application/json" -H "Authorization: Bearer $API_SECRET" -d @-
```

### 3. Verify
Check Supabase `pinterest_trends` table for new rows with the current week.

## Troubleshooting

| Problem | Solution |
|---|---|
| Playwright not installed | `pip install playwright && playwright install chromium` |
| 0 trends found | Check `.tmp/pinterest-trends-*.png` screenshots — page structure may have changed. Update selectors in `scrape_pinterest_trends.py` |
| Upload fails (401) | Include `Authorization: Bearer $API_SECRET` header — all API routes require auth |
| Upload fails (500) | Ensure dev server is running and Supabase credentials are set in `.env.local` |
| Pinterest blocks scraper | Wait a few hours and retry. Don't run more than once per week. |

## Notes
- The scraper runs locally only (Playwright can't run on Vercel)
- Debug screenshots are saved to `.tmp/` on every run
- The prediction pipeline automatically picks up Pinterest data from Supabase
- Re-running in the same week upserts (overwrites existing data, no duplicates)
- Pinterest Trends renders all data on a single page — no per-category navigation needed
