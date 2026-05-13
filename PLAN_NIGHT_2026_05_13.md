# Culture Radar — Innovation Roadmap (autonomous night work 2026-05-13)

## Where we stand

- **Discovery**: 161 sources across Firecrawl + Perplexity + TikTok Creative Center + Google Trends API + Reddit + KnowYourMeme + 4 culture newsletters + 18 TikTok /discover pages
- **Pipeline**: scrape + extract split (each own 300s budget), batched Gemini extraction, hallucination filter (real/generic/fabricated/uncertain), bundle dedup
- **Classification**: country, vibe, subculture (33-taxonomy), growth score (0-10 predictive), validation score, momentum (rising/steady/cooling)
- **Storage**: Postgres on Neon, daily snapshots for timeseries (culture_trend_snapshots, culture_gt_snapshots)
- **UI**: dashboard with sticky filter bar, Live Google Trends tab with per-country spike interpretation, Country pulse, Likely-to-break, category-grouped compact rows, expand/collapse on every card
- **Newsletter**: magazine cover, multi-country GT, per-country spikes, breakout, subculture pulse, creators, moments

## What's missing for "truly innovative"

The pipeline observes well but doesn't yet **detect patterns** in its own data. Six high-impact moves:

### 1. Trend embeddings + cross-trend clustering
Every trend becomes a 768d vector via Gemini embeddings. Then:
- **Similar trend recommendations**: "This trend is similar to last month's X — see how that one played out"
- **Meta-cluster detection**: weekly k-means on fresh trends, surface clusters before they get a name. "8 trends this week share an underlying current of anti-clean-girl backlash"
- **De-dupe smarter**: bundling currently uses hashtag prefix matching. Embeddings catch semantic duplicates the bundle key misses.

Tonight: build lib/trend-embeddings.ts + culture_trend_embeddings table + /api/culture/embed + /api/culture/clusters endpoint + dashboard section "Emerging meta-clusters".

### 2. Lifecycle stage detection from snapshots
We've been writing nightly snapshots for 3 days. Once we have 7+ days per trend, fit a lifecycle curve:
- **Emerging** (popularity climbing fast)
- **Climbing** (sustained growth)
- **Peak** (plateau at top of curve)
- **Declining** (popularity dropping)
- **Dormant** (cold)

Output per trend: lifecycle stage + projected days-to-peak / days-since-peak. UI badges. Newsletter section "Trends past their peak, save your effort".

Tonight: build it on existing snapshot data even with only 3 days — projection improves daily.

### 3. TikTok Discover structured parser
Right now /discover pages are scraped as markdown and fed through Gemini extraction. Better: dedicated parser like lib/tiktok-cc.ts that pulls structured video list + creator handles directly. Bypass Gemini hallucination risk entirely for this source.

Tonight: build lib/tiktok-discover.ts with Playwright + parse, store videos + creators per topic, surface as pre-structured trend data.

### 4. Per-trend detail page
Slug-based URL `/culture-radar/trends/[slug]` showing:
- Header: name, momentum, growth, vibe, subculture, country flags
- Visual: thumbnail or SVG
- Velocity sparkline (from snapshots)
- Action brief in full
- Mindmap in full
- All example URLs (not just top 2)
- Source list
- Similar trends (from embeddings)
- Lifecycle stage with projection

Linkable from every dashboard row. Shareable URL for handoffs to the team.

### 5. Source health scorecard
Track per source: what % of trends extracted from it ended up `verify_verdict = real` vs `fabricated`. Auto-demote / promote sources weekly. Visible in /culture-radar/sources page.

Tonight: build the rollup query + small dashboard panel.

### 6. Subculture trajectory analysis
Per subculture per week: trend count, average growth_score, top representative trend. Surface "rising" (5+ trends this week, was 2 last week) vs "fading" subcultures.

Tonight: SQL aggregation endpoint + dashboard panel.

## Beyond tonight (next sessions)

- **Creator network graph**: who posts which trends, who collaborates, who incubates trends 2 weeks before mainstream
- **Cross-platform velocity tracking**: time-from-TikTok-to-Reddit measurement
- **Multimodal trend signatures**: visual + audio embeddings combined with text
- **AI-generated cinematic hero images** in newsletter via Higgsfield
- **Brand activation tracker**: scan top trends for existing brand executions, flag "already done by competitor X"
- **Reverse-discovery flow**: starting from Action's product categories, query "which trends benefit this product right now"
- **Webhook alerts**: when growth_score > 8.5 or multi-country count >= 6, push to Slack
- **PDF magazine generation**: print-quality version of the daily newsletter

## Tonight execution order

1. PLAN.md (this) — done
2. Trend embeddings + clustering (the biggest unlock)
3. Lifecycle stage detection
4. TikTok Discover structured parser
5. Per-trend detail page
6. Source health scorecard
7. Subculture trajectory

Status updates will be in commit messages. Final summary in MORNING_REPORT.md when finished.
