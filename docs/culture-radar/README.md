# Culture Radar

Real-time cultural trend detection for Action. Lives alongside Trend Predictor, Promo Radar, Image Scanner, Copy Checker and Audio Checker in the same Next.js app.

## What it does

- Scrapes a curated catalogue of trend sources (TikTok Creative Center, Reddit subs, niche blogs, GenZ.ai, Picuki, etc).
- For each source, asks Gemini 2.5 Flash to identify cultural trends present in the scraped content.
- Merges trends across sources. A trend that shows up in multiple places gets a higher validation score and ranks higher.
- Ranks trends into a Daily Top 10 and a Weekly Top 50 using a blend of popularity, freshness, and validation.
- Auto-archives trends older than 7 days so the dashboard stays focused on what is current.

## How it differs from Trend Predictor

| | Trend Predictor | Culture Radar |
|---|---|---|
| **Question** | Which Action product will be a hit? | What is happening in culture right now? |
| **Output** | Product briefs + content concepts per new arrival | Daily / weekly cultural trends, with multi-source validation |
| **Sources** | Pinterest NL + scraped TikTok/Facebook tables | 30+ curated sources across food, beauty, fashion, home, lifestyle, tech, memes, culture |
| **Audience** | Marketing + buying team | Strategy + creative team |

## Setup

### 1. Provision a Postgres database

Culture Radar uses **Neon** (the Postgres provider Vercel partners with).
Two ways to create one:

- **Vercel dashboard** (recommended if you also deploy here): Storage → Create
  Database → Neon Postgres. After creation, click "Connect" and copy the
  "Pooled connection" string.
- **Neon directly**: https://neon.tech → New Project → free tier. Copy the
  pooled connection string from the dashboard.

Add it to `.env.local`:

```env
POSTGRES_URL=postgres://USER:PASSWORD@HOST/DB?sslmode=require
```

### 2. Apply the schema

```bash
psql "$POSTGRES_URL" -f docs/culture-radar/schema.sql
psql "$POSTGRES_URL" -f docs/culture-radar/sources.sql
```

Or paste each file into the Neon SQL Editor.

### 3. Environment variables

| Var | Used for |
|---|---|
| `POSTGRES_URL` | Neon / Vercel Postgres connection string (pooled) |
| `FIRECRAWL_API_KEY` | Scraping every Firecrawl-backed source |
| `GOOGLE_API_KEY` | Gemini analysis (default model: `gemini-2.5-pro`) |
| `CULTURE_GEMINI_MODEL` | Optional — override the default Gemini model |
| `API_SECRET` | Bearer-token check on all `/api/*` routes |
| `NEXT_PUBLIC_API_SECRET` | Browser-side copy of `API_SECRET` (used by `apiFetch`) |

Culture Radar deliberately does **not** use Supabase — it bypasses the
AuthGuard wrapper, runs admin-only, and is protected at the API layer by
`API_SECRET`. The legacy tools (scanner, copy-checker, trend-predictor,
audio-checker, promo-radar) still need Supabase; their env vars are
optional if you only want Culture Radar locally.

Google Trends is fetched directly from Google's public endpoints, so no
key is needed for it.

### 4. First run

```bash
npm run dev
```

Open http://localhost:3000/culture-radar (no login needed for this tool —
AuthGuard is bypassed here). For the initial fill, click **Backfill 7d**.
The first run takes 2-4 minutes (one Firecrawl scrape + one Gemini call
per active source) and writes ~50-100 trend rows.

For ongoing refreshes, use **Refresh from sources** — same flow, narrower
"current week" window.

## Architecture

```
┌─ Sidebar nav: /culture-radar ─────────────────────────────────────────┐
│                                                                       │
│  app/culture-radar/page.tsx   (client dashboard)                      │
│    │                                                                  │
│    ├─ GET  /api/culture/trends   (daily | weekly | all, filters)      │
│    ├─ GET  /api/culture/sources  (catalogue + last-run status)        │
│    └─ POST /api/culture/fetch    (scrape + AI + rank, ~3 min)         │
│                                                                       │
│  lib/culture-radar.ts   (pure helpers: slug, freshness, ranking)      │
│  lib/culture-ai.ts      (Gemini prompt + parsing)                     │
│  lib/google-trends.ts   (direct API access — no Firecrawl)            │
│  lib/culture-db.ts      (Neon Postgres wrapper)                       │
│  types/culture.ts       (shared TS types)                             │
│                                                                       │
│  Neon Postgres tables:                                                │
│    culture_sources       — 36 seeded URLs to scrape                   │
│    culture_trends        — one row per slug per ISO week              │
│    culture_predictions   — reserved for forward-looking predictions   │
│    culture_moderation    — reserved for team feedback loop            │
│    culture_fetch_runs    — audit log of every refresh run             │
└───────────────────────────────────────────────────────────────────────┘
```

## API reference

All endpoints require `Authorization: Bearer ${API_SECRET}` (handled by `apiFetch` in the browser).

### GET `/api/culture/trends`
| Param | Default | Notes |
|---|---|---|
| `view` | `all` | `daily` (Top 10 today), `weekly` (Top 50 this week), `all` |
| `category` | — | One of food, beauty, fashion, home, lifestyle, tech, meme, culture |
| `week` | current ISO week | Override, e.g. `2026-W19` |
| `limit` | 100 | Max 200 |
| `includeArchived` | off | `1` to include archived trends |

### GET `/api/culture/sources`
| Param | Default |
|---|---|
| `active` | all (use `1` for active only) |
| `category` | — |

### POST `/api/culture/fetch`
Body (all optional):
```json
{
  "sourceIds": [1, 2, 3],
  "categories": ["food", "beauty"],
  "maxSources": 5,
  "skipAi": false,
  "triggeredBy": "manual"
}
```

Returns `{ runId, status, summary, failures }`.

## Scoring

```
rankingScore =
    0.5 × popularity (0-10, AI-assigned per source, max wins across sources)
  + 0.3 × freshness  (10 when first seen this week, decays to 0 over 7 days)
  + 0.2 × validation × 2  (distinct sources confirming, capped at 5)
```

Daily rank = top 10 of `rankingScore` snapshot per day.
Weekly rank = top 50 of `rankingScore` snapshot per ISO week.

To tweak the formula, edit `rankingScore()` in [`lib/culture-radar.ts`](../../lib/culture-radar.ts). No migration needed — the next refresh recomputes ranks.

## Source types

Each row in `culture_sources` has a `source_type` that picks how it gets
scraped:

| `source_type` | Path | Notes |
|---|---|---|
| `google_trends_api` | `lib/google-trends.ts` | Hits `trends.google.com` JSON + RSS endpoints. No API key needed. |
| everything else | Firecrawl markdown scrape | Generic — works for blogs, Reddit JSON, public hashtag pages, etc. |

To add a new dedicated integration (e.g. TikTok Creative Center, RapidAPI),
add a branch in `scrapeSource()` in [`app/api/culture/fetch/route.ts`](../../app/api/culture/fetch/route.ts).

## Scope — what this tool does NOT do

Culture Radar is purely about cultural signals (what is trending in food,
beauty, fashion, home, lifestyle, tech, memes, sound, broader culture). It
does not scrape Action products, match trends to specific SKUs, or generate
product-level content briefs. That is the job of Trend Predictor.

## Next steps (not yet built)

- `culture_predictions` table is in place but no UI / generator yet. Plan: nightly cron that asks Gemini "given last 14 days of trends, what is emerging next?" and writes rows with `prediction_type=emerging`.
- `culture_moderation` table is in place but no UI. Plan: thumbs up/down buttons on each trend, feed approved/rejected examples back into the AI prompt as one-shot context.
- TikTok Creative Center has anti-bot; the Firecrawl scrape may need a Playwright fallback like the existing Pinterest scraper.
- RapidAPI integrations for richer TikTok / Instagram hashtag data.
