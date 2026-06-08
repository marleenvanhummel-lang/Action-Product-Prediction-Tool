# Culture Radar vNext — Product Requirements Document

**Author:** Synthesised by Claude from a 5-agent parallel codebase analysis (2026-06-08)
**Status:** Draft v1.0 — ready for product / design / engineering review
**Companion doc:** `docs/culture-radar-vnext-implementation-plan.md`

---

## 0 · Reading guide

This is the PRD. It states what we're building and why. The implementation plan is a separate document with the file-by-file changes, type definitions, SQL migrations, and rollout order.

Every claim about the current system is grounded in the actual codebase (referenced files are quoted). Where we make a forward-looking assumption that needs validation, it is labelled `[ASSUMPTION]` in line.

---

## 1 · Executive summary

Culture Radar today is a high-quality **signal discovery** tool: it scrapes ~123 sources daily, runs Gemini extraction with a strong recency cap and specificity prompt, and renders a daily editorial magazine. The system already has impressive primitives: validation count, growth score, lifecycle stages, vibe / subculture / country tagging, AI brand briefs, a live progress panel that survives page refresh, and a 14-phase cron pipeline with phase-level budgeting.

What it is **not yet** is a **decision-support system**. A user opening the dashboard or magazine cannot answer the three questions that matter for an Action marketing team:

1. *Is this real?* — there is no explicit confidence score or trust panel; verdicts are buried.
2. *Is this relevant to us?* — there is no Action Fit dimension; brand briefs exist but are not scored, comparable, or filterable.
3. *What do we do with it?* — there are content angles inside `brand_brief` but no decision states, no owner, no rationale log, no "act / monitor / ignore" framing.

vNext is the pivot from etalage to operating system. We sharpen the **quality bar**, expose **trust explicitly**, introduce a **decision layer** with named states, add a lightweight **workflow** for trend operations, and reshape the magazine into an executive briefing that leads with three decisions, not eighty signals.

We preserve everything that already works: the scrape → extract split, the per-phase cron, the live progress panel, the freshness filter, the AI-image hero generation, and the editorial typography. We replace what doesn't: opaque scoring, free-text taxonomy, decision-blind reports, weak loading / stale / degraded states.

The MVP is roughly six weeks of focused engineering. It ships three things: (1) the decision layer with state machine and Action Fit score, (2) the trust panel and explainable confidence score on every trend card, and (3) a rewritten magazine executive summary block. Everything else — Phase 2 taxonomy governance, Phase 3 creator and moment entities — builds on those three.

---

## 2 · Current state — what we have today

This section is grounded in actual file reads, not memory. The full inventory is in the implementation plan; this is the part you need to understand the gap analysis.

### 2.1 · Pages and routes

The product surface is four pages and ~80 API routes:

| Surface | File | Role |
|---|---|---|
| Main dashboard | `app/culture-radar/page.tsx` (~2272 lines) | List, filter, search, refresh, submit |
| Insights | `app/culture-radar/insights/page.tsx` (~514 lines) | Clusters, anomalies, recommendations, subculture trajectory, source health |
| Magazine | `app/culture-radar/report/page.tsx` + `lib/report-renderer.ts` (~2066 lines) | Server-rendered daily briefing, public |
| Trend detail | `app/culture-radar/trends/[slug]/page.tsx` | Single trend deep dive with mindmap + creators + velocity |

Filters are six dimensions: view (daily / weekly / gtrends / inspiration / emerging / all), category (10 values), country (14 EU codes), vibe (8 values), subculture (~30 grouped options), growth (0 / 5+ / 6.5+ / 8+). The free-text search runs client-side across name / description / hashtags / source names / brief content angle.

Filtering is **client-side after fetch**. Only view changes re-query the API. This is why the dashboard search used to return "no matches" on `Horror Movies` despite the trend existing — the API returned the top 100 by popularity, and the search filtered that subset. We bumped the cap to 1000 on 2026-05-15, but the architecture is still "fetch everything, filter in browser."

### 2.2 · Data model

The core table is `culture_trends`. It has 38 columns. The schema is roughly:

```
Identity:        id (uuid), slug, name, description, category, content_type
Time:            first_seen_at, created_at, updated_at, verified_at
Source linkage:  source_ids (int[]), source_names (text[]), example_urls (text[])
Display:         thumbnail_url, thumbnail_meta (jsonb), hashtags (text[]), estimated_views (text)
Scoring:         popularity_score, freshness_score, validation_score, growth_score
Ranking:         daily_rank, weekly_rank, rank_date, rank_week
Tagging:         country_relevance (text[]), vibe, subculture, bundle_key
AI enrichment:   brand_brief (jsonb ActionBrief), mindmap (jsonb), embedding (jsonb 3072d)
Lifecycle:       lifecycle_stage, lifecycle_data (jsonb)
Validation:      verify_verdict (real|generic|fabricated|uncertain), reasoning
Curation:        status (active|archived|flagged), feedback_useful, feedback_generic
```

Supporting tables: `culture_sources` (~123 active), `culture_scrape_results` (raw fetch queue), `culture_scrape_jobs` (live UI tracking), `culture_moments` (calendar events), `culture_predictions` (forward-looking), `culture_moderation` (feedback log), `culture_fetch_runs` (audit), `culture_trend_snapshots` (daily popularity time series), `culture_article_dates` (publication-date cache), `culture_trend_images` (Gemini hero cache).

Three things matter for vNext:

1. **TEXT columns where ENUMs belong.** `category`, `vibe`, `content_type`, `verify_verdict`, `subculture`, `lifecycle_stage` are all plain TEXT with no CHECK constraint. Anything is allowed. Typos slip through, capitalisation drifts.
2. **JSONB hides schema evolution.** `brand_brief`, `mindmap`, `thumbnail_meta`, `lifecycle_data`, `country_dates` are JSONB. Old rows have different shapes than new ones; code is not consistently defensive.
3. **No foreign keys on `source_ids` or `related_trend_ids`.** Orphaned IDs accumulate when sources are renamed or removed.

### 2.3 · Extraction, scoring, validation

The Gemini extraction prompt lives in `lib/culture-ai.ts`. It is strong. It enforces:

- **A 30-day recency hard cap** — content older than 30 days is skipped, with explicit examples ("Last summer", "two months ago", archive URLs).
- **Specificity rules** — generic names like "Viral TikTok Sounds" are rejected; specific names like "Glazed donut nails" are required.
- **Rule against holiday surges** — "Mother's Day Celebrations" gets routed to the moments planner, not trends.
- **Rule against mature movements** — sourdough, kombucha, ASMR, cottagecore get demoted unless they have a fresh hook this month.
- **Specificity anchor check** — every trend must have at least one of: hashtag, @handle, quoted string, quantified claim, or proper noun.

Scoring lives in `lib/culture-radar.ts` and `lib/trend-growth.ts`:

| Score | Source | Formula |
|---|---|---|
| `popularity_score` (1-10) | **AI-guessed** by Gemini | "signal strength in THIS source" — unaccountable |
| `freshness_score` (0-10) | Computed | Linear decay: `10 - (10 × days_old / 7)`, zero at day 7 |
| `validation_score` (0-5) | Computed | `min(5, unique(source_ids).length)` |
| `ranking_score` | Computed | `0.35 × pop + 0.40 × fresh + 0.20 × val + recency_boost + trust_bonus` |
| `growth_score` (0-10) | Computed heuristic | 7-factor: freshness, validation, pre-peak window, age window, cross-platform, subculture, vibe |
| `verify_verdict` | AI (Gemini second pass) | `real / generic / fabricated / uncertain` |
| `lifecycle_stage` | Derived from snapshots | `emerging / climbing / peak / declining / dormant` |

Three observations carry forward:

1. **`popularity_score` is a black box.** A newsletter with 50 readers and TikTok with 2.3M posts both feed into Gemini's 1–10 estimate. Users cannot see the input.
2. **`validation_score` measures count, not diversity.** Three identical Reddit posts score the same as TikTok + Reddit + newsletter. Source `reliability` (1–5) exists in `culture_sources` but is **never used** in any score.
3. **`growth_score` is computed but only used in the `emerging` view filter.** It does not influence the daily / weekly top.

### 2.4 · Magazine

The renderer is `lib/report-renderer.ts` (2066 lines). It produces 19 sections in a fixed order: cover masthead, by-the-numbers, editor's letter (drop cap), table of contents, daily top 10 (3 feature spreads + 7 cards), velocity leaders, breakout, country pulse, multi-country GT, GT country spikes, subculture pulse, inspiration, emerging, creators, calendar moments, pulse videos, editor picks, content ideas, pull quote, skip list.

Strong primitives: art-directed SVG poster fallback when no image, AI hero image generation (Gemini 2.5 Flash Image), TikTok oEmbed validation, dynamic TOC, sparkline charts, brand typography (Archivo Black / Newsreader / Inter), 760px email-safe table layout, color palette (#FF1300 / #000000 / #FFFDF3).

The freshness filter is universal: every section query applies `FRESH_URL_FILTER` (regex on `example_urls` rejecting old-year archive paths) and `first_seen_at >= NOW() - INTERVAL '7 days'`. This is the work we did on 2026-05-14 hunting old roundup blogs.

What the magazine lacks:

- No executive summary at the top.
- No "3 to act / 2 to monitor / 1 false positive" frame.
- "Predicted to break" has no visible confidence or reasoning — just a `growth_score >= 7` filter.
- Skip List exists but only catches verdicts `generic` or `uncertain` — borderline trends slip past silently.
- Country pulse is flat — no distinction between "global trend hitting NL" vs "NL-only signal".
- Creator section has no narrative — 25 random creators with no thread of why.
- Calendar moments show date and category but no inline action angle.
- Sparklines show 7-day trajectory but no climbing / peaking / declining colour cue.

### 2.5 · Pipeline

Daily refresh runs through `.github/workflows/cron-refresh.yml` (14 phases, each its own 300s budget):

```
scrape → extract pass 1 → extract pass 2 → verify + growth
      → enrich-countries / vibes / subcultures (parallel) → recompute-bundles
      → backfill-briefs × 3 batches → snapshots + lifecycle
      → embed + mindmaps + url verify → article-date verification
```

Each phase is a curl POST to its own endpoint. Phase budgets are quoted in the workflow file. The 2026-05-14 night we found the Vercel cron had silently stopped firing 7 days earlier; we built this GHA fallback. GHA Actions schedules sometimes miss runs under load (we hit this 2026-06-08), so there is a known gap in the cron-of-the-cron department.

Source dispatch in `scrapeSource()` is by `source_type`:

| Type | Handler | Cost / call |
|---|---|---|
| `google_trends_api` | Direct API | $0 |
| `perplexity_query` | Perplexity API | ~$0.005 |
| `tiktok_cc_hashtag` | Apify Creative Center | ~$0.02 |
| `reddit` | Reddit JSON API | $0 |
| `/discover/` URL | Firecrawl + parser | ~$0.08 |
| `blog`, `aggregator` | Native HTML → Firecrawl fallback | $0 unless fallback |
| default | Firecrawl markdown | ~$0.08 |

The native HTML scraper (added 2026-05-18) saves ~30 Firecrawl credits per refresh. Firecrawl credits ran out once on 2026-05-18 and silently broke 40 scrapes; we have no credit monitor yet.

### 2.6 · UI states and components

The dashboard renders trend cards via `HeroTrend`, `FeaturedTrend`, `CompactTrend`, and `TrendRow` (parallel layouts in `app/culture-radar/trend-cards.tsx`). Confidence signals shown today:

- `validationScore` as `3×` badge — opaque count, no source list shown.
- `freshness_score` (0–10) in detail view only.
- `growth_score` as `BREAKOUT / CLIMBING / GROWING` badge, hidden below 5.
- `verify_verdict` as a subtle pill.

Loading and empty states are minimal: a sentence on the main list, a sentence on the GT panel. There is **no stale data indicator**. There is **no degradation banner** when partial scrape failures land. There is **no virtualisation** — 500+ cards render at once. There is **no aria-labelling** on most interactive pills.

The live scrape progress panel (`components/culture/ScrapeProgressPanel.tsx`, ~340 lines, added 2026-05-15) is the model for how new system-state surfaces should work: DB-backed, refresh-safe, autohide-when-idle. Reuse this pattern.

---

## 3 · Gap analysis

The current system is signal-rich but decision-poor. Here are the gaps grouped by the five product pillars vNext will address.

### 3.1 · Trendkwaliteit — quality of what enters the system

| Gap | Evidence |
|---|---|
| `popularity_score` is opaque — Gemini guesses 1–10 from a single source's signal strength | `lib/culture-ai.ts` prompt, no calibration |
| `validation_score` rewards count, not diversity — 3 Reddit posts beat TikTok + Reddit + newsletter | `lib/culture-radar.ts:70` |
| Source `reliability` is stored but unused in any scoring | grep returns zero hits outside source-health |
| Taxonomy drift — `vibe`, `subculture`, `category`, `content_type`, `verify_verdict` are TEXT with no CHECK | schema |
| Entity confusion — trend, format (`content_type`), creator, moment, sound all blur | `content_type='sound'` + `category='sound'` + standalone moments table |
| Bundle key is free-form text — same concept can land as "mothers-day-haul" and "Mother's Day Haul" | `recompute-bundles` |
| Manual feedback (`feedback_useful`, `feedback_generic`) is collected but does not feed back into ranking | grep |
| Cross-week deduplication doesn't exist — a trend re-emerging next week becomes a separate row by (slug, rank_week) | `culture_trends` unique constraint |

### 3.2 · Validation — trust layer

| Gap | Evidence |
|---|---|
| No trust panel — users cannot see _which_ sources confirmed a trend, just a count | `TrendRow` shows `3×`, not the list |
| `verify_verdict` is a single AI label — Gemini grading Gemini | `app/api/culture/verify-trends/route.ts` |
| No confidence percentage — `growth_score >= 7` is a hard gate, not a confidence signal | `lib/report-renderer.ts` Breakout section |
| Perplexity mindmaps are unvalidated — known hallucination risk | `lib/trend-mindmap.ts` |
| Article-date verifier exists but its verdict (fresh / stale / inconclusive) is invisible to the magazine reader | `app/api/culture/verify-article-dates/route.ts` |
| `verify_verdict='uncertain'` and `'generic'` end up in the Skip List, but borderline-real trends with weak validation slip through silently | `lib/report-renderer.ts` |

### 3.3 · Besluitvorming — decision layer

| Gap | Evidence |
|---|---|
| No Action Fit score — `ActionBrief.actionRelevance` is free-form text, not scored, not filterable | `types/culture.ts` |
| No commercial / creative split — one brief, undifferentiated | same |
| No Speed-to-Activation field — users can't see "can we ship this in 48h?" vs "campaign in Q3" | absent |
| No Recommended Action enum — `contentAngle` is a sentence, not a decision | `ActionBrief.contentAngle` |
| No Recommended Market — country_relevance is "where it's seen" not "where Action should act" | `country_relevance` |
| Lifecycle stage exists but does not gate decisions | `lifecycle_stage` computed but unused in UI flow |
| No "ignore / monitor / validate / test / activate" workflow states | `status` is just `active / archived / flagged` |

### 3.4 · Workflow — trend operations

| Gap | Evidence |
|---|---|
| No owner field — who is looking at this trend right now? | absent |
| No reviewer / approver model — `culture_moderation` is one-shot feedback log, not a workflow | schema |
| No rationale log per state transition — when a trend gets archived we lose the why | `status` is overwritten in place |
| No audit trail for AI-generated fields — if `brand_brief` is regenerated we lose the prior version | no history table |
| Manual submissions land directly as active trends — no review queue | `app/api/culture/submit/route.ts` |
| Feedback (👍 / 👎 / 🚫) is fire-and-forget; archived trends greyed out client-side only | `app/api/culture/feedback/route.ts` |

### 3.5 · Executive layer — magazine and reports

| Gap | Evidence |
|---|---|
| No executive summary at top of magazine — cover goes straight to "By the numbers" sidebar | `lib/report-renderer.ts` |
| No "3 to act / 2 to monitor / 1 false positive" framing | absent |
| Breakout section is filter-on-score, not story | growth_score >= 7 SQL |
| Skip List catches AI-confirmed-bad but misses borderline | verdict filter |
| Country pulse is flat per market — no global-vs-local context | per-country LIMIT 4 |
| Calendar moments lack inline action angles | rendered with date + category only |
| Sparklines lack climbing / peaking / declining colour cue | `renderSparklineSvg` is monochrome |
| Creator section has no narrative thread | `getTodaysCohort()` is black-box |

### 3.6 · System trust — loading, stale, degraded states

| Gap | Evidence |
|---|---|
| No stale data indicator — dashboard never says "data is 24h old" | page.tsx |
| No degradation banner — 30/123 sources failing today is silent | sourcesOk/total KPI exists but no warning |
| No system health dashboard surface — `/api/culture/source-health` exists but is buried in Insights | route reads, dashboard does not |
| Scrape progress panel is excellent — reuse this pattern for system health | `components/culture/ScrapeProgressPanel.tsx` |
| GHA cron miss has no second-line alerting beyond email | workflow file |
| No virtualisation — 500+ trends render at once | page.tsx grid |

---

## 4 · Product vision

> **Culture Radar vNext is a decision-support system for trend operations.**
> Every trend it surfaces comes with explicit trust, an explicit Action Fit, and an explicit next action.
> The magazine reads like a chief-of-staff briefing, not a catalogue.
> The dashboard reads like an air-traffic-control panel: you can see at a glance what is fresh, what is stale, what is degraded.

The pivot is from **"look at all this cool stuff"** to **"here are three things to do this week and why"**.

Three concrete framing changes:

1. **A trend now has a state, not a flag.** `Monitor → Validate → Test → Activate → Measure → Archive` replaces the binary `active / archived / flagged`.
2. **Every surface explains its trust.** "Why we think this is real" and "How confident we are" become first-class UI, not buried fields.
3. **The magazine leads with decisions.** The first thing a reader sees is "Act on these 3. Monitor these 2. Skip this 1. Here's why."

We preserve the editorial polish, the brand typography, the 14-phase cron, the AI hero generation, the live progress panel pattern, and the native HTML scraper economics. We replace what doesn't serve the decision: opaque scoring, free-text taxonomy, magazine-as-catalogue, missing system trust signals.

---

## 5 · Product pillars

Five pillars. Each has a defined scope. Order is delivery order: pillar 1 unblocks 2, 2 unblocks 3, etc.

### Pillar 1 · Trendkwaliteit (Quality)

**Goal:** Only well-formed, taxonomy-clean trends enter the system. Ruis daalt zichtbaar.

**What changes:**

- **Required fields enforced at write time.** A trend must have `name`, `summary` (rewritten `description`), `category` (enum), `vibe` (enum), `subculture` (controlled vocabulary, see Pillar 1.3), `region` (validated country codes), `firstSeen`, `lastUpdated`, `sourceEvidence` (min 1), `whyNow`. Optional but tracked: `behaviorShift`, `contentOpportunity`, `productOpportunity`, `promoOpportunity`, `creatorOpportunity`.
- **Postgres ENUM types replace TEXT columns** for `category`, `vibe`, `content_type`, `verify_verdict`, `lifecycle_state`, `decision_state`. `subculture` becomes a foreign key to a new `culture_subcultures` table (Phase 2). Migration is non-destructive: existing values are mapped or quarantined.
- **Validation at scrape ingestion.** The Gemini extraction prompt currently does most of this. We make `normalizeTrend` reject more aggressively and log rejections to a new `culture_trend_rejections` table so we can audit what we filter out. This replaces the current silent demote-to-popularity-5 behaviour.
- **Source diversity replaces source count.** `validation_score` becomes "number of distinct source _categories_ that confirmed", capped at 5. A second field `validation_diversity_score` carries the new metric while we transition.
- **Source reliability is finally used.** `culture_sources.reliability` (1–5) becomes a weight in both `validation_score` and `confidence_score`. Sources we know to be noisy contribute less.
- **Cross-week trend continuity.** New table `culture_trend_threads` keeps a stable identity across rank_weeks so a returning trend is "resurgence" not "new". Slug-Jaccard match across the last 6 weeks identifies threads.

**[ASSUMPTION] Subculture taxonomy can be bootstrapped from the ~30 grouped options already in the UI dropdown.** That dropdown is the de-facto vocabulary; we promote it to a managed list. Out-of-vocabulary subcultures get queued for editorial review.

### Pillar 2 · Validation (Trust Layer)

**Goal:** Every trend exposes a confidence score and a trust panel that explains _why_ we believe it.

**What changes:**

- **A new `confidence_score` field** (0–100, integer). Explainable, not a black box. Formula in section 7.
- **A trust panel as a first-class component.** Appears on every trend card (collapsible) and as a drawer on the trend detail page. Shows:
  - Confidence score with breakdown (source quality, source diversity, manual validation, cross-country spread, article-date freshness).
  - The list of sources with their reliability rating and recency.
  - The `verify_verdict` with the verifier's reasoning quote.
  - The article-date verification status (fresh / inconclusive / stale).
  - Manual validation status (pending / approved / rejected) with reviewer name and timestamp.
- **Verifier diversity.** Today `verify_verdict` is one Gemini call. vNext runs a second pass with a different prompt approach (claim-by-claim refute) and stores both. Disagreement triggers manual review.
- **Article-date verdict exposed in magazine and dashboard.** Currently we archive stale trends silently; vNext shows "based on a 2-week-old roundup" inline so the reader can judge.
- **Source quality dashboard.** Promote `/api/culture/source-health` from the Insights page to a top-level surface. Add weighting by trend volume, accuracy over time, and breakout-prediction success rate.

### Pillar 3 · Besluitvorming (Decision Layer)

**Goal:** Every trend has three explicit scores and one recommended action.

**What changes:**

- **`action_fit_score` (0–100).** "Should Action care?" Inputs: category match against Action's product range, country relevance against Action's 14 markets, brand-safety check (against Action's brand-voice rules), audience match.
- **`commercial_relevance_score` (0–100).** "Could this drive sales?" Inputs: product opportunity strength, price-point match, seasonal alignment, basket-impact estimate. [ASSUMPTION] We approximate basket-impact via category mapping until we have point-of-sale integration.
- **`creative_relevance_score` (0–100).** "Could this make great content?" Inputs: visual distinctness, format clarity, creator availability, brand fit.
- **`speed_to_activation` (enum).** `now` (24–72h), `this_week`, `this_month`, `quarter`, `not_actionable`. Derived from lifecycle stage + format type + creative complexity.
- **`recommended_action` (enum).** `act_content` / `act_product` / `act_promo` / `monitor` / `validate` / `ignore`. Always populated.
- **`recommended_market` (text[])** — distinct from `country_relevance`. Country_relevance is "where it's seen". Recommended_market is "where Action should ship it."
- **`decision_state` (enum).** `monitor / validate / test / activate / measure / archive`. The new state machine. Replaces the use of `status` as a decision field.

### Pillar 4 · Workflow

**Goal:** Trend operations have owners, history, and a rationale log.

**What changes:**

- **`owner` and `reviewer` fields** on every trend with an active decision state.
- **`decision_history` table** with `(trend_id, from_state, to_state, actor, rationale, timestamp)`. Every state transition appends a row. The trend page renders this as a timeline.
- **A review queue surface.** Manual submissions and trends in `validate` state land here. Reviewers can approve, reject, or request more info.
- **Bulk actions.** The dashboard gets multi-select with bulk state transitions (e.g., "archive these 12 generic verdicts as a batch with reason 'AI false-positive sweep'").
- **Slack / WhatsApp notifications on state changes** for trends with high `action_fit_score` (configurable threshold). Reuses the existing WhatsApp bridge.

### Pillar 5 · Executive report layer

**Goal:** The magazine and reports lead with decisions and confidence.

**What changes:**

- **Executive summary block above the cover masthead.** Two sentences, hand-pickable or auto-generated. Then a three-line "3 to act / 2 to monitor / 1 false positive" with click-through.
- **Confidence badge on every trend card in the magazine.** A small disc with the confidence number; expandable into the trust panel.
- **"Why we predict this will break" reasoning on Breakout section.** Quote the top two contributing inputs from the confidence and growth formulas.
- **Skip List expanded.** Beyond AI verdicts, include: single-source-only trends with popularity ≥7 (suspicious), mature trends with no fresh hook, trends with stale article-date verdicts.
- **Country pulse with global / local split.** "Trends Action sees in NL: 12 (4 global, 8 NL-local)." Each list has its own subsection.
- **Calendar moments with inline action angle.** "Father's Day NL — 13 Jun — Suggested: BBQ-utensil bundle promo (creative_relevance 78, speed_to_activation: this_week)."
- **Sparklines with climbing / peaking / declining colour.** Green up, amber peak, red down. Matches the lifecycle stage.
- **Creators with intent line.** "Creators of the day: 6 NL micro-creators covering #PinkPilates, all matched to fashion + lifestyle category."
- **A new "Stale & Degraded" footer surface** showing data age, scrape success rate, last cron run.

---

## 6 · UX recommendations per screen

Priority labels: **must** = MVP, **should** = Phase 2, **could** = Phase 3.

### 6.1 · Home / dashboard (`app/culture-radar/page.tsx`)

**Goal:** an air-traffic-control panel. At a glance: what's fresh, what's degraded, what needs my attention.

**Hero block (replaces current KPI strip):** must
- Data freshness banner: "Live • Last refresh 12 min ago" or amber "Stale • Last refresh 26h ago — [Trigger refresh]".
- Three top KPIs with confidence: Active trends, High-confidence trends (confidence ≥70), Trends in `validate` state needing review.

**Action shortcuts:** must
- "3 to act now" link → filtered view: `decision_state=test OR activate`.
- "2 to monitor" link → `decision_state=monitor` with high `action_fit_score`.
- "Review queue (N)" badge → trends in `validate` state.

**Filter bar:** must
- Keep all existing filters.
- Add: `confidence_min`, `action_fit_min`, `decision_state`, `entity_type` (trend / format / sound / creator / moment).
- Filters become server-side query params, not client-side post-fetch. URL state syncs.

**Trend cards:** must
- Confidence disc top-right with click-to-expand trust panel.
- Decision state pill with click-to-change (state machine drop-down).
- Action Fit ⊕ Commercial ⊕ Creative as compact three-dot indicator (filled / half / empty).
- Owner avatar if assigned.
- Velocity arrow (climbing / peaking / declining) replaces the current `BREAKOUT / CLIMBING / GROWING` static badge.

**System health footer:** must
- Source health summary (e.g., "118 of 123 sources OK • 2 degraded • 3 stale").
- Last cron run timestamp.
- "View full health →" link to Insights.

**Bulk actions:** should
- Multi-select checkboxes on cards.
- Bulk decision-state change with rationale prompt.

**Virtualisation:** should
- Replace the grid render with a windowed list (react-window or similar) once >300 trends render.

### 6.2 · Trend list view

The list view is largely the same component as the dashboard. The key add:

**Group-by mode:** should
- Group by `decision_state`, `subculture`, `category`, or `confidence_band`.
- Collapsible group headers with counts.

**Sort options:** must
- Add: confidence DESC, action_fit DESC, speed_to_activation (now first), velocity_delta DESC.

### 6.3 · Trend detail view (`app/culture-radar/trends/[slug]/page.tsx`)

**Header block:** must
- Name + summary + decision state pill (editable).
- Confidence disc with breakdown.
- Three relevance scores (Action Fit / Commercial / Creative) as a compact triptych.
- Speed-to-activation pill.
- Recommended action and recommended market.
- Owner + assign button.

**Trust panel (drawer):** must
- Already in scope from Pillar 2. Opens from the header confidence disc.

**Why now / behaviour shift / opportunities:** must
- Replace the current free-form `brand_brief` blob with structured fields rendered as separate sub-sections.

**Decision history timeline:** must
- Rendered from new `decision_history` table.
- Shows: timestamp, actor, from_state, to_state, rationale.

**Source evidence list:** must
- Replaces the current list of links. Shows per source: reliability rating, last-seen date, snippet, verdict.

**Mindmap:** keep but mark unvalidated content
- Add a small "Perplexity-generated, unverified" footnote.
- [ASSUMPTION] Citations panel can be added later.

**Creators block:** keep and adapt
- Show why each creator was matched (existing field `whyRelevant`).

**Calendar adjacency:** could
- "Upcoming moments this trend connects to: Father's Day (NL, 13 Jun)."

### 6.4 · Report / magazine view (`lib/report-renderer.ts`)

**Executive summary block at top:** must
- Below masthead, above by-the-numbers.
- Two-sentence editorial summary (manual or auto from highest-confidence trends).
- "Three to act / two to monitor / one to skip" with click-through if web, anchor links if email.

**Confidence badge on every card:** must
- Small disc with the number. Renders inline.

**Breakout section reasoning:** must
- Each card carries one line: "Why: cross-platform (3 categories) + climbing 14 days + creator velocity."

**Velocity sparkline colour:** must
- Green for climbing, amber for peak, red for declining. Derived from `lifecycle_stage`.

**Country pulse — global vs local split:** must
- For each country: two sub-sections.

**Calendar with inline angle:** must
- Date + name + suggested action + creative relevance score.

**Stale / degraded footer:** must
- Below pull quote. "Data as of [time]. Sources OK: 118/123. Scrape duration: 2m13s."

**Creator narrative thread:** should
- Group by the trend or subculture that ties them.

**Skip List expanded:** must
- Plus algorithmic flags beyond `verify_verdict`.

### 6.5 · Validation / sources drawer

**A single component reused from dashboard, list, detail, and magazine card click:** must

Sections:

1. **Confidence breakdown.** The five inputs with each contributing %.
2. **Source list.** Each source row: name, reliability, last seen, snippet excerpt, jump-out link.
3. **Verifier reasoning.** Both verification passes side by side with the verdict.
4. **Article-date verdict.** Fresh / inconclusive / stale + which URL was checked.
5. **Manual validation log.** Who, when, decision, rationale.
6. **Cross-country signal.** Which markets, which platforms.

### 6.6 · Empty / loading / stale / degraded states

**Stale state:** must
- Banner at the top of dashboard when data age > 18h. Yellow. CTA: refresh.
- Banner red when > 30h.

**Degraded state:** must
- Banner when current cron run reports `sources_failed / sources_total > 0.10`.
- Lists the failed sources.

**Loading state:** must
- Replace single sentence with skeleton cards + per-section staggered loading.
- Insights page individual panels already do this — extend to dashboard.

**Empty state per filter combination:** must
- Distinguish: no data ever (cold start) vs. no data for current filters vs. all filters cleared but no data.

---

## 7 · Scoring model

Three principles:

1. **Explainable.** Every score has at most six inputs, each weighted, each visible to the user.
2. **Bounded.** Every score is on a fixed scale, no surprises.
3. **Stable.** Recomputable from data without AI calls, so re-runs are cheap.

### 7.1 · Confidence score (0–100)

> "Is this trend real?"

| Input | Weight | Calculation |
|---|---|---|
| Source diversity | 30% | `min(5, distinct(source.category)) × 6` (each category = 6 points, capped at 30) |
| Source reliability | 25% | `mean(source.reliability) × 5` (sources are 1–5, scale to 25) |
| Cross-country spread | 15% | `min(5, country_relevance.length) × 3` |
| Article-date freshness | 15% | `fresh = 15, inconclusive = 8, stale = 0` |
| Manual validation | 10% | `approved = 10, pending = 5, rejected = 0` |
| AI verifier agreement | 5% | `both_real = 5, one_real = 2, neither = 0` |

Total: 0–100.

**Why this shape:** source-quality and diversity dominate because they're the strongest signal of "not a hallucination". Article-date is a hard signal that knocked out 170 stale trends on 2026-05-14 — we keep it explicit. Manual validation is a strong override but only worth 10 because most trends won't have it.

**[ASSUMPTION] Manual validation defaults to `pending` for the first 24h after first_seen.** A trend that has not been manually validated should not be punished — it just isn't bonused. This requires `pending` to be the default, not "rejected".

### 7.2 · Growth score (revised) (0–10)

The current `lib/trend-growth.ts` formula stays mostly intact but with two changes:

- **Source-reliability weighting** replaces raw source count in the validation factor.
- **Confidence floor.** Growth score is computed only when confidence ≥ 30. Below that, growth_score = null (trend is too weak to predict).

| Input | Weight |
|---|---|
| Freshness | 0.20 |
| Source diversity × reliability | 0.20 |
| Pre-peak window (popularity 4–7) | 0.20 |
| Age window (3–21 days) | 0.15 |
| Cross-platform spread | 0.10 |
| Subculture origin bonus | 0.10 |
| Vibe bonus | 0.05 |

### 7.3 · Action Fit score (0–100)

> "Should Action care?"

| Input | Weight | Source |
|---|---|---|
| Category match against Action's product range | 35% | Map `category` to Action's top categories; full match = 35, adjacent = 20, none = 0 |
| Market overlap with Action's 14 markets | 25% | `intersect(country_relevance, ACTION_MARKETS).length × 4`, capped at 25 |
| Brand-voice fit | 20% | Gemini classifier vs. JackandAI brand voice rules (already in CLAUDE.md scope) |
| Audience match (Gen Z / Millennial / parents) | 10% | Inferred from `vibe`, `subculture`, content_type |
| Lifecycle stage | 10% | `emerging = 10, climbing = 8, peak = 5, declining = 2` (peak is too late) |

### 7.4 · Commercial relevance score (0–100)

> "Could this drive sales?"

| Input | Weight | Notes |
|---|---|---|
| Product opportunity strength | 35% | Extracted from new field `productOpportunity` (Gemini classifier scores 0–35) |
| Price-point match | 20% | `productOpportunity` mentions sub-€10 / sub-€20 items = 20; premium = 5 |
| Basket adjacency | 15% | Connected to other trending products = 15; isolated = 5 |
| Seasonal lift | 15% | Calendar moment overlap within 4 weeks = 15; none = 0 |
| Speed | 10% | `now / this_week = 10, this_month = 5, quarter = 2` |
| Confidence floor | 5% | `confidence ≥70 = 5, ≥50 = 3, <50 = 0` |

### 7.5 · Creative relevance score (0–100)

> "Could this make great content?"

| Input | Weight |
|---|---|
| Visual distinctness | 30% |
| Format clarity (is it a clear "do X" template?) | 25% |
| Creator availability | 20% |
| Brand-voice fit | 15% |
| Speed | 10% |

Both Commercial and Creative use a Gemini classifier; we cache results in the `brand_brief` JSONB but as structured sub-fields (see implementation plan).

### 7.6 · Breakout probability (0–100)

> "Will this break this week?"

Lifted from `growth_score` with a confidence multiplier:

```
breakout_probability = round(growth_score × 10 × (confidence_score / 100))
```

So a trend with growth_score 9 and confidence 70 has breakout probability 63. A trend with growth_score 9 and confidence 30 has 27.

### 7.7 · Saturation risk (0–100)

> "Is this past peak?"

Reuses `lifecycle_stage` and snapshot trajectory:

```
saturation_risk = {
  emerging: 5,
  climbing: 20,
  peak: 70,
  declining: 90,
  dormant: 100,
} + (days_since_peak × 2, capped at 30)
```

### 7.8 · How scoring is exposed in UI

Every score appears in three places:

1. **Card** — compact disc / pill.
2. **Trust panel** — full breakdown with input contributions.
3. **JSON API** — `confidence`, `actionFit`, `commercial`, `creative`, `breakoutProbability`, `saturationRisk` as top-level fields. `confidenceBreakdown` as a sub-object.

### 7.9 · Anti-hype penalties

Built into confidence score's inputs but worth stating explicitly:

- Single-source trends max out at confidence 35 (only one of five diversity points possible).
- Single-source-low-reliability trends max out at confidence 25.
- Stale article-date pushes confidence down 15 points immediately.
- Verifier disagreement (one says real, one says generic) caps confidence at 50.

These rules become unit-test cases in `lib/scoring.test.ts` (Phase 2).

---

## 8 · Backlog and roadmap

### 8.1 · Epics

| Epic | Pillar | MVP / P2 / P3 | One-line goal |
|---|---|---|---|
| **E1 · Taxonomy & data model** | 1 | MVP | Postgres ENUMs, controlled subculture vocab, required-field enforcement |
| **E2 · Validation layer** | 2 | MVP | Confidence score + trust panel + dual verifier |
| **E3 · Decision layer** | 3 | MVP | Action Fit / Commercial / Creative scores + decision state machine |
| **E4 · Trend workflow** | 4 | P2 | Owner / reviewer / history / review queue |
| **E5 · Report vNext** | 5 | MVP | Executive summary + confidence badges + reasoning |
| **E6 · System trust states** | 5 (cross-cut) | MVP | Stale / degraded / loading / health surfaces |
| **E7 · Creator entity** | 1 (extension) | P2 | `culture_creators` table + dedupe + linkage |
| **E8 · Moment / trend linkage** | 1 (extension) | P3 | Connect `culture_moments` to trends and product opportunities |
| **E9 · Source reliability in scoring** | 1 | MVP | Use `culture_sources.reliability` everywhere |
| **E10 · Observability + alerting** | 5 | MVP | Firecrawl credit monitor, cron miss alert, queue depth dashboard |

### 8.2 · MVP user stories (P0)

The MVP ships epics E1, E2, E3, E5, E6, E9, E10.

#### E1 — Taxonomy & data model

**Story:** As an editor, I want trend fields to be validated at the database level so typos cannot create drift.
**Acceptance:**
- `culture_trends.category`, `vibe`, `content_type`, `verify_verdict`, `lifecycle_stage`, `decision_state` are Postgres ENUM types.
- An attempt to insert an out-of-vocabulary value fails with a clear error.
- Existing rows with edge values (e.g., `vibe='Unhinged'` capitalised) are normalised by migration.

**Story:** As a developer, I want subculture to be a managed list so I can add / rename / merge without code redeploys.
**Acceptance:**
- New `culture_subcultures` table with `id`, `slug`, `label`, `parent_slug`, `emoji`, `description`, `active`.
- `culture_trends.subculture_id` becomes FK.
- Dashboard subculture dropdown loads from this table.
- An admin endpoint exists to add / rename / deactivate.

#### E2 — Validation layer

**Story:** As a magazine reader, I want to see why we believe a trend is real so I can trust the recommendation.
**Acceptance:**
- Every trend card on the magazine renders a confidence disc with the number.
- Clicking opens the trust panel inline (or jumps to a section in the print version).
- Trust panel shows: confidence breakdown by input, source list with reliability, both verifier verdicts with reasoning.

**Story:** As a dashboard user, I want to filter by confidence so I can hide low-trust noise.
**Acceptance:**
- A confidence slider in the filter bar (default 30+).
- The query is server-side and updates the URL.

**Story:** As the system, I want a dual verifier pass so single-AI failure modes are caught.
**Acceptance:**
- The verify-trends endpoint runs two prompts (current "is this real" + new "refute this claim").
- Both verdicts are stored in `culture_trends.verify_verdict_a`, `verify_verdict_b`, `verify_reasoning_a`, `verify_reasoning_b`.
- Disagreement (a≠b) is flagged for manual review.

#### E3 — Decision layer

**Story:** As a marketing lead, I want each trend to carry an Action Fit score so I can ignore irrelevant ones quickly.
**Acceptance:**
- Every active trend has `action_fit_score` (0–100), computed by the formula in section 7.3.
- Recomputed on every brief generation pass.
- Visible on every card as a small triptych (Action Fit / Commercial / Creative).
- Filterable from the dashboard.

**Story:** As a marketing lead, I want a recommended action on every trend so I don't have to interpret.
**Acceptance:**
- `recommended_action` is populated for every trend with confidence ≥40.
- Values: `act_content / act_product / act_promo / monitor / validate / ignore`.
- Displayed prominently on card and detail view.

**Story:** As a user, I want to move a trend through decision states so my team and I are aligned.
**Acceptance:**
- A trend's state can change between `monitor / validate / test / activate / measure / archive`.
- The change is recorded in `decision_history` with `from_state, to_state, actor, rationale, timestamp`.
- The UI prompts for rationale on every change.

#### E5 — Report vNext

**Story:** As a magazine reader, I want a two-sentence executive summary at the top so I know what matters without reading further.
**Acceptance:**
- Executive summary block renders above by-the-numbers.
- Auto-generated from top 5 trends by `confidence × action_fit`.
- Editable / overridable via a new `culture_magazine_overrides` table.

**Story:** As a magazine reader, I want a "3 to act / 2 to monitor / 1 to skip" block so my decisions are pre-staged.
**Acceptance:**
- Renders below executive summary.
- "Act" entries have `recommended_action ≠ monitor / ignore` AND `confidence ≥60`.
- "Monitor" entries have `recommended_action = monitor` AND high `action_fit`.
- "Skip" entry has highest `popularity_score` among `verify_verdict = generic / uncertain` OR `confidence < 30`.

**Story:** As a magazine reader, I want to see why we predict a Breakout trend will break.
**Acceptance:**
- Each Breakout card shows a one-line reasoning: "Why: [top 2 contributing inputs]."

#### E6 — System trust states

**Story:** As a user, I want to know when the data is stale.
**Acceptance:**
- Banner appears when last cron run > 18h ago (yellow) or > 30h ago (red).
- CTA: "Trigger refresh" if authorised.

**Story:** As a user, I want to know when the system is degraded.
**Acceptance:**
- Banner appears when current cron run has > 10% source failures or a phase has timed out.
- Lists the failed sources / phases.

**Story:** As an editor, I want a system-health surface so I can audit at any time.
**Acceptance:**
- A new page `/culture-radar/system` shows: last 7 cron runs, source health, queue depth, Firecrawl credit balance, cost per day.

#### E9 — Source reliability in scoring

**Story:** As a developer, I want `culture_sources.reliability` to weight validation so noisy sources matter less.
**Acceptance:**
- `validation_score` is replaced by `validation_diversity_score` and `validation_reliability_score`.
- Both feed into `confidence_score` per the formula in 7.1.
- The old `validation_score` column remains for backward compatibility for one release.

#### E10 — Observability

**Story:** As ops, I want Firecrawl credit alerts before we run out.
**Acceptance:**
- A nightly check pings Firecrawl's account endpoint (or scrapes the dashboard, [ASSUMPTION] if no API).
- An alert fires to Slack / WhatsApp when credits < 1000.

**Story:** As ops, I want a cron-miss alert.
**Acceptance:**
- A second GHA workflow runs at 09:00 UTC checking that the 06:00 UTC run completed within the last 4h.
- If not, it fires an alert.

### 8.3 · Phase 2 stories (P1)

- **E4 — Workflow:**
  - Owner / reviewer fields, review queue surface, bulk actions, Slack notifications on high Action Fit.
- **E7 — Creator entity:**
  - New `culture_creators` table; dedupe by handle + platform; trends gain `featured_creators` FK array; magazine creator section becomes content-aware.
- Confidence breakdown chart inside trust panel.
- Subculture management UI for editors.

### 8.4 · Phase 3 stories (P2)

- **E8 — Moment linkage:**
  - `culture_moments` rows link to relevant trends via a new join table; magazine calendar inlines action angles.
- Editable executive summary in a small admin surface.
- A/B comparison of two trend variants in `test` state.
- Trend-evolution timeline across weeks (`culture_trend_threads`).
- Export to PDF / Notion for client-facing decks.

### 8.5 · Delivery sequence

Six weeks for MVP, with each epic targeting roughly 5–8 working days.

```
Week 1   Data model migrations (E1 + E9) + scoring library (E2 7.1)
Week 2   Confidence score in API + Trust panel component (E2)
Week 3   Decision state machine + Action Fit / Commercial / Creative scoring (E3)
Week 4   Magazine vNext layout (E5) + system trust banners (E6)
Week 5   System health page + observability (E6 + E10) + brief-flow refactor
Week 6   Polish, accessibility, performance (virtualisation), release notes
```

P2 (Phase 2) targets weeks 7–12. P3 thereafter.

---

## 9 · Risks and open questions

### 9.1 · Product risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| The "3 to act" block is wrong and users lose trust in week one | High | Medium | Ship with editable override; have a human-curator-in-the-loop for the first two weeks |
| Decision state machine becomes noisy ("everyone changes state, no one writes rationale") | Medium | Medium | Make rationale required on transitions to `activate`, `archive`; allow free-form on others; review weekly |
| Confidence score is initially under-calibrated and surfaces wrong trends | Medium | High | Ship behind a feature flag; compare confidence ranking vs current ranking for two weeks; tune weights |
| Replacing magazine layout breaks reader habits | Low | Medium | Keep old sections, add new ones; allow a "classic view" toggle for the first month |

### 9.2 · UX risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Trust panel feels overwhelming | Medium | High | Default to a one-line summary; expandable for the full breakdown |
| Filter bar becomes overloaded with new dimensions | Medium | High | Move secondary filters into a "More filters" drawer; default-collapse |
| Magazine executive summary feels too prescriptive | Medium | Low | Make the language editorial ("This week's signal worth acting on is…") not directive ("You must do X") |

### 9.3 · Data risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| ENUM migration breaks existing rows | High | Low | Use Postgres ENUM with `ADD VALUE` for unknown legacy values, normalise in migration script, ship behind feature flag |
| Subculture vocabulary becomes the team's bottleneck | Medium | Medium | Initial vocab from existing dropdown values; allow "uncategorised" as fallback; admin UI in Phase 2 |
| Confidence scoring penalises new sources unfairly | Medium | Medium | Default reliability for new sources is 3 (median); review monthly |
| Article-date verifier hits rate limits on heavy days | Low | Low | Cache for 7 days; rate-limit to 200 / hour |

### 9.4 · Technical risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Dual verifier doubles Gemini cost | Medium | High | Run only on trends with confidence in 40–60 band (uncertain zone); ~30% of total |
| Server-side filtering slows down the dashboard | Medium | Low | Index on `confidence_score`, `action_fit_score`, `decision_state`; precomputed materialised view if needed |
| Decision history table grows unbounded | Low | Low | Partition by month after 12 months |
| Vercel function timeouts on new computed-score endpoints | Medium | Low | Move heavy compute to GHA workflow phases (precedent set) |

### 9.5 · Governance risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| No clear owner of subculture vocabulary | Medium | High | Name an editor (Meinte + one delegate); monthly review |
| AI-generated `recommended_action` becomes a blame target | Medium | Medium | Always show "AI suggested" badge; require human approval before `activate` |
| Action Fit scoring drifts as Action's strategy changes | Medium | High | Maintain `lib/action-fit-rules.ts` with versioned weights; review quarterly |
| Public dashboard URL is now indexed by search engines | Low | High | Already public per request; add `robots.txt` for `/api/*` only; no PII in trend names; review with Action legal |

### 9.6 · Open questions

These need a decision before week 1 of MVP:

1. **Confidence breakdown weights.** The weights in section 7.1 are first-draft. Should source diversity be 30% or 35%? Should manual validation be 10% or 20%? Decision lead: Meinte + lead engineer.
2. **Action Fit category mapping.** We need a canonical list of Action's product categories with weights. Source: someone at Action.
3. **Recommended-action enum values.** Are `act_content / act_product / act_promo / monitor / validate / ignore` the right buckets? Should there be `act_creator_collab`? Decision lead: marketing lead.
4. **Decision state default for manual submissions.** Should they default to `validate` (review queue) or `monitor`? Recommendation: `validate`.
5. **Skip List inclusion rules.** Are single-source + popularity≥7 trends always skip-worthy, or sometimes legit? Recommendation: surface them in Skip with "single-source caveat", let editor override.
6. **Magazine executive summary tone.** Editorial ("This week, watch X") or directive ("Act on X by Friday")? Recommendation: editorial; we are advising, not commanding.
7. **Backwards compatibility window.** How long do we keep the old `status` field alongside the new `decision_state`? Recommendation: two releases (~4 weeks).
8. **Trust panel as drawer vs inline section.** On detail page, inline. On cards (list / magazine), drawer/popover. Decision lead: design.
9. **Should the magazine link to the dashboard for editing?** Yes for internal magazine, no for forwarded public version. Implementation in section TBD.
10. **Should `action_fit_score` be computed for all 14 markets separately?** Recommendation: yes, store `action_fit_by_market` as JSONB; expose the max + per-market in trust panel.

---

## 10 · What we preserve

This is the "don't break what works" section. Explicit list:

- **The scrape → extract split.** Phase-budgeted, fault-tolerant. Keep.
- **The GHA workflow.** 14 phases, each its own 300s budget. Keep.
- **The Gemini extraction prompt.** Recency hard cap, specificity rules, anti-holiday clauses, anti-mature-trend demotions. Keep.
- **The native HTML scraper.** Saves ~30 Firecrawl credits / day. Keep.
- **The live scrape progress panel.** DB-backed, refresh-safe. Keep — and use as the reference pattern for new system-state surfaces.
- **The AI hero image generation.** Cached per (trend_id, generated_date). Keep.
- **The TikTok oEmbed validation.** Keep.
- **The article-date verifier.** Now expose its verdict to the user; don't archive silently.
- **The fresh-URL regex filter on magazine queries.** Keep as a belt-and-braces defence in depth.
- **The editorial typography and brand palette.** Keep.
- **The 760px email-safe layout.** Keep.
- **The public-read / authenticated-write middleware split.** Keep (just shipped 2026-06-08).
- **The dual-repo push (marleenvanhummel-lang + Yassin2607).** Keep.

---

## 11 · What we deprecate / replace

- **`status` as decision field.** Replaced by `decision_state`. `status` becomes purely lifecycle (`active / archived`).
- **`popularity_score` as a black box.** Either retire or expose its inputs. [ASSUMPTION] We can backfill an explainable variant from per-source signal counts.
- **`validation_score` as raw count.** Replaced by `validation_diversity_score` + `validation_reliability_score`.
- **Free-text `subculture`.** Replaced by FK to `culture_subcultures`.
- **TEXT columns for enums.** Replaced by Postgres ENUM types.
- **Magazine "Predicted to Break" as a flat list.** Replaced by Breakout cards with reasoning.
- **Skip List as verdict-only.** Replaced by Skip List with algorithmic + verdict triggers.
- **Client-side dashboard filtering for first-class dimensions.** Replaced by server-side query (URL state).

---

## 12 · Success metrics

How we know vNext landed.

**Quality:**
- Reduction in stale-article-backed trends in the magazine, week 4 vs week 1. Target: 80% reduction.
- Reduction in single-source trends above confidence 50, week 4 vs week 1. Target: 50% reduction.

**Decision:**
- % of trends in the daily magazine that carry an Action Fit ≥ 50. Target: ≥70% by week 4.
- Number of trends transitioning from `validate` to `activate` weekly. Target: ≥3 by week 4.

**Trust:**
- Trust panel open rate per session. Target: ≥30% of detail-page visits.
- Manual validation rate on trends in the review queue. Target: ≥80% within 48h.

**System:**
- Cron miss rate (days with no successful run). Target: < 5% (already-met thanks to GHA + backup; vNext adds alerting).
- Average data age when user opens dashboard. Target: < 16h.
- Firecrawl credit headroom maintained ≥ 30%. Target: always green.

**Editorial:**
- Magazine read-through (top-to-bottom signal via TOC click events). [ASSUMPTION] We add basic anonymous analytics.
- Click-through from Exec Summary "act on these" links. Target: > 25%.

---

## 13 · Out of scope (for now)

- Real-time / streaming updates (current daily refresh remains).
- Multi-tenant (single Action workspace stays).
- Mobile-first redesign (responsive yes, native app no).
- Full creator-economy CRM (basic creator entity in P2 only).
- Pricing / packaging for external clients (this is internal).
- ML-trained predictive scoring (heuristic + explainable formulas in MVP; ML can come once we have ground truth labels from manual validation).
- Direct integration with Action's content CMS or product PIM.
- Translation of magazine to local languages (English with Dutch annotations stays).

---

## 14 · Appendix · How this PRD was made

Five Explore agents ran in parallel for ~2 minutes against the live codebase:

1. `pages-ui-states` — pages, components, runtime states
2. `data-model` — schema, types, enrichment fields
3. `extraction-scoring-validation` — Gemini prompts, scoring formulas, taxonomy enforcement
4. `magazine-renderer` — every section, query, visual style
5. `pipeline-cron-sources` — scrape → extract pipeline, GHA workflow, source dispatch

Each agent returned a ~3000-word audit including inventory, critique, and a reuse-vs-rebuild table. I (the synthesiser) merged the five into this PRD, preserving file paths, quoted prompts, and quantitative claims.

The companion document `docs/culture-radar-vnext-implementation-plan.md` translates this PRD into concrete file-by-file changes, TypeScript types, Zod schemas, SQL migrations, and a phased rollout.

---

*End of PRD. Companion implementation plan: `docs/culture-radar-vnext-implementation-plan.md`.*
