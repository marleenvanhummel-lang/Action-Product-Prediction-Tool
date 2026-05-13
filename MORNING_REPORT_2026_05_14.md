# Morning Report · 2026-05-14

While you slept (roughly 6 hours), I built and shipped 8 new features
plus a critical infrastructure fix. All live on
action-culture-radar.vercel.app.

## What's new

### 1. Trend embeddings (`gemini-embedding-001`, 3072d)
- New `embedding` JSONB column on `culture_trends`
- 480+ trends already embedded
- New endpoint `/api/culture/embed`
- Wired into daily cron (80 trends/day)

### 2. K-means cluster detection + AI naming
- `/api/culture/clusters?k=12&freshOnly=1` returns 12 named clusters
- Each cluster: name (Gemini-generated), summary, dominant subculture/vibe, avg growth, top 5 members
- Examples currently surfacing: "Unhinged Digital Trends" (40), "Niche Internet Mainstream" (9), "Trending Sports News" (25), "Viral Audio Trends" (37)
- Labels cached per cluster signature so we don't re-pay Gemini cost

### 3. Lifecycle stage detection
- New `lifecycle_stage` + `lifecycle_data` columns
- `lib/trend-lifecycle.ts` classifies into emerging / climbing / peak / declining / dormant from snapshot timeseries
- Auto-runs in cron after snapshots
- Will become very precise once we have 7+ days of snapshot data (currently 3 days)

### 4. Per-trend detail page
- New route `/culture-radar/trends/[slug]` plus matching API endpoint
- Header: name, momentum, growth, vibe, subculture, country flags, lifecycle, verify verdict
- Sections: The signal, For Action brief (full), Velocity sparkline (from snapshots), Mindmap (full), Similar trends (via embedding cosine similarity), All example URLs, Sources
- Compact rows on dashboard now link the title to the detail page

### 5. Insights dashboard
- New route `/culture-radar/insights` with three panels:
  - Emerging clusters (k-means with AI-named clusters)
  - Subculture trajectory (rising / fading / stable / new / gone per subculture, this-week vs last-week)
  - Source health scorecard (A-F grade per source based on verify_verdict distribution)
- Link in main dashboard header (🧬 Insights →)

### 6. Subculture trajectory endpoint
- `/api/culture/subculture-trajectory`
- Compares this-week vs last-week trend count + avg growth per subculture
- Classifications: rising / fading / stable / new / gone
- Powers the Insights panel + ready to embed in newsletter

### 7. Source health scorecard
- `/api/culture/source-health`
- Per source: real / generic / fabricated / uncertain counts
- A-F grade based on real %
- Surfaces which sources to demote (high fabricated rate) or trust (high real rate)

### 8. Critical cron architecture fix
**The bug**: cron-refresh was calling 14+ enrich/derive steps via in-process handlers, all sharing the cron's 300s Vercel budget. Each Gemini-heavy step needs ~60-120s. The cron was running out of budget and silently skipping later steps — including ranking. This is what was causing "twee dagen dezelfde top".

**The fix**: every post-scrape step now runs via `externalStep()` — an HTTP fetch to the local origin, which spawns a separate Vercel function invocation with its own 300s budget. Three parallel waves now complete in ~30s wall-time instead of timing out.

### 9. AI-generated cluster names
- `/api/culture/clusters` now hits Gemini per cluster with the top 12 member names + descriptions
- Returns a punchy 2-4 word label + one-sentence summary
- Cached in `culture_cluster_labels` table by member-signature hash
- Idempotent re-call across runs

## Updated daily cron flow (07:00 UTC)

```
moments-fetch (monthly only)
  ↓
moments-status-refresh
  ↓
SCRAPE (external, own 300s) — all 143 active sources, concurrency 8
  ↓
EXTRACT (external, own 300s) — drain queue, parallel Gemini extract, recompute ranks
  ↓
PARALLEL WAVE 1: scan-creators · recompute-bundles · enrich-countries · enrich-vibes · verify-trends · enrich-subcultures
  ↓
PARALLEL WAVE 2: compute-growth · embed · snapshot-trends · snapshot-gt · compute-lifecycle
  ↓
PARALLEL WAVE 3: enrich-mindmaps · verify-urls
```

Each step is independent and fault-tolerant. If one fails the cron continues with whatever the rest produced.

## Sample cluster outputs (this morning)

| Label | Size | Theme |
|-------|------|-------|
| Unhinged Digital Trends | 40 | ironic_seriousness brainrot |
| Trending Sports News | 25 | sport vibe |
| Viral Audio Trends | 37 | music/sound |
| Modern Aesthetic Waves | 60 | stan_culture + aesthetic |
| Clever Life Solutions | 65 | beautytok + product |
| Niche Internet Mainstream | 9 | gorpcore-ish niche fashion |
| Digital Culture Under Scrutiny | 70 | that_girl + informational |

Some labels are too generic ("Today's Hot Topics", "Smart Daily Solutions") because those clusters were broad/heterogeneous. Tomorrow's cron will re-cluster with the new embeddings and refresh labels.

## What's still on the roadmap (not done tonight)

- AI-generated cinematic hero images per top trend (newsletter visual upgrade)
- Cross-platform velocity tracking (time from TikTok to Reddit)
- Brand activation tracker (which trends competitors already executed)
- Reverse-discovery: start from Action product categories, query matching trends
- Webhook alerts (Slack / email when growth_score > 8.5)
- TikTok Discover dedicated structured parser (right now /discover pages go through generic Firecrawl + Gemini)
- PDF magazine generation
- Per-trend creator collaboration matchmaker

See `PLAN_NIGHT_2026_05_13.md` for the full strategic roadmap.

## Where to look first when you wake up

1. **`/culture-radar/insights`** — the new dashboard tab. See the 12 clusters, subculture trajectory, source health scorecard.
2. **Any trend in the daily list** — click the title to see the new detail page with velocity sparkline + similar trends.
3. **`PLAN_NIGHT_2026_05_13.md`** — strategic roadmap for the next sessions.

## Things to verify

1. Tomorrow's 07:00 UTC cron should complete cleanly with the new external-step architecture. Watch the cron logs in Vercel.
2. Cluster labels will become more specific as embeddings improve.
3. Lifecycle predictions need 7+ days of snapshots before they're trustworthy. Currently 3 days — mostly classifying as "peak" or "dormant" because no clear direction yet.
