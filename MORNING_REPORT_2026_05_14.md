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
- Brand activation tracker (which trends competitors already executed)
- Webhook alerts (Slack / email when growth_score > 8.5)
- PDF magazine generation

See `PLAN_NIGHT_2026_05_13.md` for the full strategic roadmap.

## Roadmap follow-up (after you said "volg de roadmap ook al")

Five additional features shipped:

### 10. TikTok /discover structured parser
- `lib/tiktok-discover.ts` parses rendered HTML for video + creator + topic data without Gemini.
- `scrapeSource` detects `/discover/` URLs and uses the dedicated parser. The synthetic markdown payload still flows through the extract pipeline, but the video list itself is now deterministic (no hallucination risk).

### 11. Cross-platform velocity tracking
- `/api/culture/cross-platform-velocity` aggregates source-class distribution per trend.
- Insights panel: platform distribution, top platform pairs, 3+ platform trends (cross-confirmed), newsletter-only early signals (culture writers ahead of mainstream).

### 12. Reverse discovery
- `/api/culture/reverse-discover` takes an Action product category and returns matched trends ranked by fit + popularity + growth + urgency.
- Insights page has an interactive search input with quick-preset buttons (Home cleaning, Kids toys, Beauty essentials, Garden, Back to school, Halloween decor).

### 13. Creator matchmaker per trend
- `/api/culture/trend/[slug]/creators` scores creators from `culture_creators` by country overlap + subculture/vibe/category cues + hashtag tag overlap.
- Trend detail page shows a "Matched creators" grid with fit score + match reasons.
- Useful for "we want to lean into this trend — who could we collab with?"

### 14. Anomaly detection (sudden spikes)
- `/api/culture/anomalies` compares each trend's latest snapshot to its 3-day rolling baseline.
- Two kinds: "spike" (jumped 2+ points), "freshman" (brand new high-popularity).
- Top panel in Insights — early-warning system for "something popped overnight".

### 15. Recommendation engine
- `/api/culture/recommend` uses team feedback signal (feedback_useful / feedback_generic) to compute liked/disliked centroids in embedding space.
- Surfaces unrated trends closest to liked centroid (with dislike penalty).
- Empty state explains: mark trends as 👍 useful to seed the engine.
- "You liked X, you might want to lean into Y" — personalized to Action's editorial choices.

## Final structure of /culture-radar/insights

Top to bottom:
1. **Sudden spikes** (anomalies, "something popped")
2. **Recommendations** (personalized via feedback + embeddings)
3. **Reverse discovery** (interactive: query → matched trends)
4. **Cross-platform velocity** (which trends spanned the most channels)
5. **Emerging clusters** (k-means + AI-named themes)
6. **Subculture trajectory** (rising/fading per niche, week-over-week)
7. **Source health scorecard** (A-F grade per source by verify verdict)

## Where to look first when you wake up

1. **`/culture-radar/insights`** — the new dashboard tab. See the 12 clusters, subculture trajectory, source health scorecard.
2. **Any trend in the daily list** — click the title to see the new detail page with velocity sparkline + similar trends.
3. **`PLAN_NIGHT_2026_05_13.md`** — strategic roadmap for the next sessions.

## Things to verify

1. Tomorrow's 07:00 UTC cron should complete cleanly with the new external-step architecture. Watch the cron logs in Vercel.
2. Cluster labels will become more specific as embeddings improve.
3. Lifecycle predictions need 7+ days of snapshots before they're trustworthy. Currently 3 days — mostly classifying as "peak" or "dormant" because no clear direction yet.
