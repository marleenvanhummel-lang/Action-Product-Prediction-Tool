# Workflow: Image Content Scanner

## Objective
Scan up to 700 retail images for language correctness, price accuracy, and brand compliance
for Action's target markets across Europe.

## Required Inputs
- Images: JPEG, PNG, WEBP, AVIF, GIF (max 700 files, max 20MB each)
- Target countries (select from: NL, FR, DE, BE, ES, IT, PL, CZ, SK, HU, AT, CH)
- Which checks to enable: language / price / brand

## How to Run
1. Open terminal in project directory, run: `npm run dev`
2. Open http://localhost:3000 in browser (auto-redirects to /scanner)
3. Drag images onto the drop zone or click to select files
4. Select target countries in the config panel
5. Toggle desired checks (language / price / brand)
6. Click "Scan N images"
7. Monitor the real-time progress bar and live counters
8. Results populate the table as each image is processed
9. When complete, use filter buttons (Pass / Fail / Warning) to focus on issues
10. Click any row to expand details per check
11. Click "Export CSV" to save results

## AI Analysis (Claude claude-sonnet-4-6)
Each image is sent to Claude's vision API with a structured prompt requesting JSON output.
The analysis covers:
- **Language**: Detects text language, checks if it matches the target country's expected language
- **Price**: Extracts price from image, checks format, optionally compares with live Action website price
- **Brand**: Checks Action logo presence/correctness, brand colors, text readability, offensive content

## Price Scraper Dependency
The price check requires Python dependencies. To install:
```bash
cd tools
pip3 install -r requirements.txt
playwright install chromium
```
The scraper tries `requests` first (fast, no JS), then falls back to `playwright` (handles JS-rendered pages).
If action.com blocks the request or times out (8 seconds), the check continues without website price data
and only reports the price format correctness.

## Processing Architecture
- Images are uploaded in client-side batches of 10 to avoid HTTP timeouts
- Each batch is processed concurrently (10 parallel Claude API calls)
- Results stream back via Server-Sent Events (SSE) in real-time
- A session store (in-memory) tracks progress per scan

## Known Constraints
- **Rate limits**: Anthropic standard tier ~50 req/min. 700 images ≈ 3–5 minutes total
- **Action.com scraping**: The website uses JS rendering. If `requests` fails, `playwright` is used.
  If both fail, price check shows format only (no website comparison)
- **Session persistence**: Session data lives in server memory only. Export CSV before refreshing
- **Image encoding**: Large images (>5MB) may slow down the initial encoding step in the browser

## Output
- Live results table in the UI (filterable, sortable, expandable rows)
- CSV export: Filename, Status, Language detected, Language issues, Price found, Price format OK,
  Brand quality, Offensive content flag, Quality issues, Summary

## Troubleshooting
- **Scan doesn't start**: Ensure ANTHROPIC_API_KEY is set in `.env.local`
- **Price check fails silently**: Install Python deps (see above). Check if Python 3 is available (`python3 --version`)
- **Images not accepted**: Check file format (JPEG/PNG/WEBP/AVIF/GIF only) and size (<20MB each)
- **Slow processing**: Reduce batch if hitting rate limits; edit `BATCH_SIZE` in `lib/constants.ts`
