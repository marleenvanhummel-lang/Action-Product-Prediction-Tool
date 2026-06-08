# Culture Radar vNext — Implementation Plan

**Author:** Synthesised by Claude from a 5-agent parallel codebase analysis (2026-06-08)
**Status:** Draft v1.0 — engineering review needed before week 1
**Companion doc:** `docs/culture-radar-vnext-prd.md` (product vision and rationale)

---

## 0 · Scope of this document

The PRD says *what* and *why*. This document says *what to build, in which files, in what order*. Every section is concrete: file paths, type definitions, SQL DDL, endpoint shapes, test strategy. No vision restating, no requirements restating.

If you're a developer about to start week 1 of MVP, read sections 2 → 3 → 4 → 7 in that order.

---

## 1 · Folder structure changes

Current relevant tree (only what changes):

```
app/
  api/
    culture/
      *                           ← ~80 routes
  culture-radar/
    page.tsx                      ← dashboard
    insights/page.tsx
    report/page.tsx
    trends/[slug]/page.tsx
components/
  culture/
    ScrapeProgressPanel.tsx       ← keep as model
lib/
  culture-ai.ts                   ← Gemini extraction
  culture-db.ts                   ← Neon SQL helpers
  culture-radar.ts                ← scoring helpers
  trend-growth.ts                 ← growth heuristic
  trend-vibe.ts
  trend-country.ts
  trend-mindmap.ts
  trend-lifecycle.ts
  trend-image.ts
  trend-embeddings.ts
  culture-action-brief.ts
  article-date.ts
  native-html-scraper.ts          ← recent
  report-renderer.ts              ← 2066 lines
types/
  culture.ts                      ← core types
```

vNext additions:

```
app/
  api/
    culture/
      v2/
        confidence/route.ts       ← NEW · compute & return confidence breakdown
        decision/route.ts         ← NEW · POST decision-state transitions
        review-queue/route.ts     ← NEW · list trends in `validate` state
        system-health/route.ts    ← NEW · status, age, queue depth, credits
        action-fit/route.ts       ← NEW · recompute action fit batch
  culture-radar/
    system/page.tsx               ← NEW · system health surface
components/
  culture/
    TrustPanel.tsx                ← NEW · drawer/inline, see §6.5
    DecisionStateMenu.tsx         ← NEW · pill with state machine
    ConfidenceDisc.tsx            ← NEW · small badge
    RelevanceTriptych.tsx         ← NEW · action/commercial/creative dots
    DataFreshnessBanner.tsx       ← NEW · stale/degraded warnings
    SystemHealthFooter.tsx        ← NEW · used on dashboard + magazine
    ReviewQueueDrawer.tsx         ← NEW · MVP-light, Phase 2 full
lib/
  scoring/
    confidence.ts                 ← NEW · pure formula
    action-fit.ts                 ← NEW · pure formula
    commercial-relevance.ts       ← NEW
    creative-relevance.ts         ← NEW
    breakout-probability.ts       ← NEW · wraps growth × confidence
    saturation-risk.ts            ← NEW
    weights.ts                    ← NEW · single source of truth for weights
  decision/
    states.ts                     ← NEW · enum + transitions
    history.ts                    ← NEW · SQL helpers
  taxonomy/
    subcultures.ts                ← NEW · queries against culture_subcultures
    action-categories.ts          ← NEW · Action's category map
types/
  culture-vnext.ts                ← NEW · new types alongside old
  scoring.ts                      ← NEW · score shapes + Zod
  decision.ts                     ← NEW · state machine types
db/
  migrations/
    2026-06-MM-001-enums.sql              ← NEW
    2026-06-MM-002-decision-state.sql     ← NEW
    2026-06-MM-003-confidence-fields.sql  ← NEW
    2026-06-MM-004-subcultures-table.sql  ← NEW
    2026-06-MM-005-decision-history.sql   ← NEW
    2026-06-MM-006-action-fit-fields.sql  ← NEW
docs/
  culture-radar-vnext-prd.md
  culture-radar-vnext-implementation-plan.md   ← this file
```

Notes:

- New endpoints land under `/api/culture/v2/`. The old `/api/culture/*` endpoints stay intact during the migration window. After two stable weeks, v1 endpoints get a deprecation header.
- `lib/scoring/weights.ts` is the single source of truth for tunable numbers. Anything outside this file using a magic number is a regression.
- `db/migrations/` is new. We've never had managed migrations (`docs/culture-radar/schema.sql` is the only DDL). We adopt a simple numbered SQL approach: each migration applied once, recorded in `culture_migrations`.

---

## 2 · Data model migration

### 2.1 · ENUM migrations

Postgres has native ENUM types. We use them for the taxonomy fields.

**Migration `001-enums.sql`:**

```sql
-- Migrations table (one-time setup)
CREATE TABLE IF NOT EXISTS culture_migrations (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Define enums
DO $$ BEGIN
  CREATE TYPE culture_category AS ENUM (
    'food','beauty','fashion','home','lifestyle','tech',
    'meme','culture','platform','sound'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE culture_content_type AS ENUM (
    'hashtag','format','sound','aesthetic','behavior','meme'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE culture_vibe AS ENUM (
    'unhinged','aesthetic','humor','wholesome','emotional',
    'informational','product','sport'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE culture_verify_verdict AS ENUM (
    'real','generic','fabricated','uncertain'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE culture_lifecycle_stage AS ENUM (
    'emerging','climbing','peak','declining','dormant'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Normalise existing values before swapping column types
UPDATE culture_trends SET category = lower(trim(category));
UPDATE culture_trends SET vibe = lower(trim(vibe)) WHERE vibe IS NOT NULL;
UPDATE culture_trends SET content_type = lower(trim(content_type)) WHERE content_type IS NOT NULL;
UPDATE culture_trends SET verify_verdict = lower(trim(verify_verdict)) WHERE verify_verdict IS NOT NULL;

-- Quarantine rows with values outside the new enums
UPDATE culture_trends SET status = 'flagged'
  WHERE category NOT IN ('food','beauty','fashion','home','lifestyle','tech','meme','culture','platform','sound');

-- Add new typed columns alongside the TEXT ones (dual-write window)
ALTER TABLE culture_trends
  ADD COLUMN IF NOT EXISTS category_e culture_category,
  ADD COLUMN IF NOT EXISTS content_type_e culture_content_type,
  ADD COLUMN IF NOT EXISTS vibe_e culture_vibe,
  ADD COLUMN IF NOT EXISTS verify_verdict_e culture_verify_verdict,
  ADD COLUMN IF NOT EXISTS lifecycle_stage_e culture_lifecycle_stage;

-- Backfill from TEXT to ENUM where values are valid
UPDATE culture_trends SET
  category_e = category::culture_category,
  content_type_e = NULLIF(content_type, '')::culture_content_type,
  vibe_e = NULLIF(vibe, '')::culture_vibe,
  verify_verdict_e = NULLIF(verify_verdict, '')::culture_verify_verdict,
  lifecycle_stage_e = NULLIF(lifecycle_stage, '')::culture_lifecycle_stage
WHERE status != 'flagged';

INSERT INTO culture_migrations (name) VALUES ('2026-06-MM-001-enums');
```

The dual-column approach lets us migrate code path-by-path without a Big Bang. After all writes use the `_e` columns, we drop the originals and rename.

### 2.2 · Subcultures table

**Migration `004-subcultures-table.sql`:**

```sql
CREATE TABLE IF NOT EXISTS culture_subcultures (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  parent_slug TEXT REFERENCES culture_subcultures(slug),
  emoji TEXT,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed from existing dropdown vocabulary
INSERT INTO culture_subcultures (slug, label, emoji, description) VALUES
  ('cottagecore', 'Cottagecore', '🌾', 'Pastoral, romantic, anti-urban aesthetic'),
  ('mob_wife', 'Mob Wife', '💎', 'Glamour, fur, gold, big sunglasses'),
  ('gen_alpha_brainrot', 'Gen Alpha Brainrot', '🧠', 'Skibidi, ohio, gyatt, etc.'),
  ('italian_brainrot', 'Italian Brainrot', '🇮🇹', 'Tralalero, capybara, etc.'),
  ('booktok', 'BookTok', '📖', 'Reading TikTok community'),
  ('foodtok', 'FoodTok', '🍴', 'Food TikTok community'),
  ('beautytok', 'BeautyTok', '💄', 'Beauty TikTok community'),
  ('fittok', 'FitTok', '💪', 'Fitness TikTok community'),
  ('hometok', 'HomeTok', '🏠', 'Home decor TikTok community')
  -- … the other ~21 values from app/culture-radar/page.tsx dropdown
ON CONFLICT (slug) DO NOTHING;

-- Add FK column to trends
ALTER TABLE culture_trends
  ADD COLUMN IF NOT EXISTS subculture_id INTEGER REFERENCES culture_subcultures(id);

-- Backfill: map TEXT subculture to slug → id
UPDATE culture_trends t SET subculture_id = s.id
  FROM culture_subcultures s
  WHERE lower(t.subculture) = s.slug;

-- Trends with subculture text we don't recognise get NULL subculture_id
-- (they keep their text in `subculture` for editor review)

INSERT INTO culture_migrations (name) VALUES ('2026-06-MM-004-subcultures-table');
```

### 2.3 · Decision state and history

**Migration `002-decision-state.sql`:**

```sql
DO $$ BEGIN
  CREATE TYPE culture_decision_state AS ENUM (
    'monitor','validate','test','activate','measure','archive'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE culture_trends
  ADD COLUMN IF NOT EXISTS decision_state culture_decision_state NOT NULL DEFAULT 'monitor',
  ADD COLUMN IF NOT EXISTS decision_owner TEXT,
  ADD COLUMN IF NOT EXISTS decision_updated_at TIMESTAMPTZ;

-- Backfill: archived trends → archive; everything else stays monitor
UPDATE culture_trends SET decision_state = 'archive' WHERE status = 'archived';

INSERT INTO culture_migrations (name) VALUES ('2026-06-MM-002-decision-state');
```

**Migration `005-decision-history.sql`:**

```sql
CREATE TABLE IF NOT EXISTS culture_decision_history (
  id BIGSERIAL PRIMARY KEY,
  trend_id UUID NOT NULL REFERENCES culture_trends(id) ON DELETE CASCADE,
  from_state culture_decision_state,
  to_state culture_decision_state NOT NULL,
  actor TEXT NOT NULL,
  rationale TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_history_trend ON culture_decision_history(trend_id, created_at DESC);

INSERT INTO culture_migrations (name) VALUES ('2026-06-MM-005-decision-history');
```

### 2.4 · Confidence and Action Fit fields

**Migration `003-confidence-fields.sql`:**

```sql
ALTER TABLE culture_trends
  ADD COLUMN IF NOT EXISTS confidence_score SMALLINT,
  ADD COLUMN IF NOT EXISTS confidence_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS validation_diversity_score SMALLINT,
  ADD COLUMN IF NOT EXISTS validation_reliability_score SMALLINT,
  ADD COLUMN IF NOT EXISTS verify_verdict_b culture_verify_verdict,
  ADD COLUMN IF NOT EXISTS verify_reasoning_a TEXT,
  ADD COLUMN IF NOT EXISTS verify_reasoning_b TEXT,
  ADD COLUMN IF NOT EXISTS article_date_verdict TEXT,
  ADD COLUMN IF NOT EXISTS manual_validation_status TEXT
    CHECK (manual_validation_status IN ('pending','approved','rejected'))
    DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_trends_confidence
  ON culture_trends (confidence_score DESC) WHERE status = 'active';

INSERT INTO culture_migrations (name) VALUES ('2026-06-MM-003-confidence-fields');
```

**Migration `006-action-fit-fields.sql`:**

```sql
DO $$ BEGIN
  CREATE TYPE culture_speed_to_activation AS ENUM (
    'now','this_week','this_month','quarter','not_actionable'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE culture_recommended_action AS ENUM (
    'act_content','act_product','act_promo','monitor','validate','ignore'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE culture_trends
  ADD COLUMN IF NOT EXISTS action_fit_score SMALLINT,
  ADD COLUMN IF NOT EXISTS commercial_relevance_score SMALLINT,
  ADD COLUMN IF NOT EXISTS creative_relevance_score SMALLINT,
  ADD COLUMN IF NOT EXISTS breakout_probability SMALLINT,
  ADD COLUMN IF NOT EXISTS saturation_risk SMALLINT,
  ADD COLUMN IF NOT EXISTS speed_to_activation culture_speed_to_activation,
  ADD COLUMN IF NOT EXISTS recommended_action culture_recommended_action,
  ADD COLUMN IF NOT EXISTS recommended_market TEXT[],
  ADD COLUMN IF NOT EXISTS action_fit_by_market JSONB;

CREATE INDEX IF NOT EXISTS idx_trends_action_fit
  ON culture_trends (action_fit_score DESC) WHERE status = 'active';

INSERT INTO culture_migrations (name) VALUES ('2026-06-MM-006-action-fit-fields');
```

### 2.5 · Migration runner

We don't introduce a heavy ORM. A simple node script reads `db/migrations/*.sql` in name order, checks `culture_migrations` for what's applied, and runs the rest in a transaction. ~80 lines.

```ts
// scripts/migrate.ts
import { neon } from '@neondatabase/serverless'
import fs from 'fs'
import path from 'path'

const sql = neon(process.env.POSTGRES_URL!)
const DIR = path.join(__dirname, '../db/migrations')

async function run() {
  await sql`CREATE TABLE IF NOT EXISTS culture_migrations (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  const applied = (await sql`SELECT name FROM culture_migrations`).map((r: any) => r.name)
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
  for (const f of files) {
    const name = f.replace(/\.sql$/, '')
    if (applied.includes(name)) continue
    const sqlText = fs.readFileSync(path.join(DIR, f), 'utf8')
    console.log(`Applying ${name}...`)
    await sql(sqlText) // Neon supports raw multi-statement when called like this
  }
}
run().catch(e => { console.error(e); process.exit(1) })
```

Invoked locally before deploying and via a new GHA workflow `db-migrate.yml`.

---

## 3 · TypeScript types

### 3.1 · New types — `types/culture-vnext.ts`

```ts
// Decision layer

export type DecisionState =
  | 'monitor' | 'validate' | 'test' | 'activate' | 'measure' | 'archive'

export type RecommendedAction =
  | 'act_content' | 'act_product' | 'act_promo'
  | 'monitor' | 'validate' | 'ignore'

export type SpeedToActivation =
  | 'now' | 'this_week' | 'this_month' | 'quarter' | 'not_actionable'

// Scoring layer

export interface ConfidenceBreakdown {
  sourceDiversity: number     // 0-30
  sourceReliability: number   // 0-25
  crossCountrySpread: number  // 0-15
  articleDateFreshness: number // 0-15
  manualValidation: number    // 0-10
  verifierAgreement: number   // 0-5
}

export interface ConfidenceScore {
  total: number               // 0-100
  breakdown: ConfidenceBreakdown
  computedAt: string          // ISO timestamp
  inputsHash: string          // hash of inputs to detect drift
}

// Decision history

export interface DecisionHistoryEntry {
  id: number
  trendId: string
  fromState: DecisionState | null
  toState: DecisionState
  actor: string
  rationale: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

// Trust panel data — what TrustPanel consumes

export interface TrustPanelData {
  confidence: ConfidenceScore
  sources: Array<{
    id: number
    name: string
    reliability: number       // 1-5
    lastSeen: string
    snippet: string | null
    verifyVerdict: string | null
  }>
  verifierA: { verdict: string; reasoning: string } | null
  verifierB: { verdict: string; reasoning: string } | null
  articleDate: {
    verdict: 'fresh' | 'inconclusive' | 'stale'
    newestArticleDays: number | null
  } | null
  manualValidation: {
    status: 'pending' | 'approved' | 'rejected'
    reviewer: string | null
    rationale: string | null
    decidedAt: string | null
  }
  crossCountrySignal: {
    markets: string[]
    platforms: string[]
  }
}

// Extended trend shape

export interface CultureTrendVNext {
  // Identity (unchanged)
  id: string
  slug: string
  name: string
  summary: string             // was `description`

  // Taxonomy (now typed)
  category: 'food'|'beauty'|'fashion'|'home'|'lifestyle'|'tech'|'meme'|'culture'|'platform'|'sound'
  contentType: 'hashtag'|'format'|'sound'|'aesthetic'|'behavior'|'meme'
  vibe: 'unhinged'|'aesthetic'|'humor'|'wholesome'|'emotional'|'informational'|'product'|'sport' | null
  subculture: {
    id: number
    slug: string
    label: string
  } | null
  region: string[]            // ISO country codes

  // Time
  firstSeen: string
  lastUpdated: string

  // Lifecycle (typed)
  growthStage: 'emerging'|'climbing'|'peak'|'declining'|'dormant'
  growthScore: number         // 0-10
  accelerationScore: number   // 0-10 (NEW — delta from snapshot)
  breakoutProbability: number // 0-100
  saturationRisk: number      // 0-100

  // Trust
  sourceCount: number
  sourceDiversity: number     // distinct categories
  sourceTypes: string[]
  confidenceScore: number     // 0-100
  confidenceBreakdown: ConfidenceBreakdown
  manualValidationStatus: 'pending'|'approved'|'rejected'

  // Decision
  actionFitScore: number      // 0-100
  commercialRelevanceScore: number  // 0-100
  creativeRelevanceScore: number    // 0-100
  speedToActivation: SpeedToActivation
  recommendedAction: RecommendedAction
  recommendedMarket: string[]
  decisionState: DecisionState
  decisionOwner: string | null

  // Brief (now structured)
  whyNow: string
  behaviorShift: string | null
  contentOpportunity: string | null
  productOpportunity: string | null
  creatorOpportunity: string | null
  promoOpportunity: string | null

  // Notes
  notes: string | null
}
```

### 3.2 · Zod schemas — `types/scoring.ts`

We want runtime validation at API boundaries. Zod gives us this for free.

```ts
import { z } from 'zod'

export const DecisionStateSchema = z.enum([
  'monitor','validate','test','activate','measure','archive'
])

export const RecommendedActionSchema = z.enum([
  'act_content','act_product','act_promo','monitor','validate','ignore'
])

export const SpeedToActivationSchema = z.enum([
  'now','this_week','this_month','quarter','not_actionable'
])

export const ConfidenceBreakdownSchema = z.object({
  sourceDiversity: z.number().int().min(0).max(30),
  sourceReliability: z.number().int().min(0).max(25),
  crossCountrySpread: z.number().int().min(0).max(15),
  articleDateFreshness: z.number().int().min(0).max(15),
  manualValidation: z.number().int().min(0).max(10),
  verifierAgreement: z.number().int().min(0).max(5),
})

export const ConfidenceScoreSchema = z.object({
  total: z.number().int().min(0).max(100),
  breakdown: ConfidenceBreakdownSchema,
  computedAt: z.string().datetime(),
  inputsHash: z.string(),
})

export const DecisionTransitionSchema = z.object({
  trendId: z.string().uuid(),
  toState: DecisionStateSchema,
  rationale: z.string().min(3).max(500).optional(),
})
```

### 3.3 · State machine — `lib/decision/states.ts`

```ts
import type { DecisionState } from '@/types/culture-vnext'

// Allowed transitions. Anything else is rejected at the API layer.
const TRANSITIONS: Record<DecisionState, DecisionState[]> = {
  monitor: ['validate', 'archive'],
  validate: ['monitor', 'test', 'archive'],
  test: ['monitor', 'activate', 'archive'],
  activate: ['measure', 'archive'],
  measure: ['monitor', 'archive'],
  archive: ['monitor'],  // un-archive only
}

// States that require a rationale on transition
const RATIONALE_REQUIRED: DecisionState[] = ['activate', 'archive']

export function canTransition(from: DecisionState, to: DecisionState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function rationaleRequired(to: DecisionState): boolean {
  return RATIONALE_REQUIRED.includes(to)
}
```

---

## 4 · File-by-file changes

This section lists every file that needs to change for MVP. Sorted by area.

### 4.1 · Data layer

| File | Change |
|---|---|
| `lib/culture-db.ts` | (1) Add `getConfidenceData(trendId)` for trust panel. (2) Add `listReviewQueue()`. (3) Update `listTrends` to support new filters: `confidence_min`, `action_fit_min`, `decision_state`. (4) Move to ENUM columns once Phase 2 of migration runs. |
| `types/culture.ts` | Mark `CultureTrend.description` as deprecated; keep alias to `summary`. |
| `types/culture-vnext.ts` | NEW — see §3.1 |
| `types/scoring.ts` | NEW — Zod schemas |
| `types/decision.ts` | NEW — DecisionState + history shapes |

### 4.2 · Scoring layer (`lib/scoring/`)

All new. Pure functions, no side effects. Each exports a single function plus its Zod-validated input shape.

```ts
// lib/scoring/confidence.ts
import { WEIGHTS } from './weights'
import type { ConfidenceScore } from '@/types/culture-vnext'

export interface ConfidenceInputs {
  sources: Array<{ category: string; reliability: number; lastSeen: Date }>
  countryRelevance: string[]
  articleDateVerdict: 'fresh' | 'inconclusive' | 'stale' | null
  manualValidationStatus: 'pending' | 'approved' | 'rejected'
  verifierA: 'real' | 'generic' | 'fabricated' | 'uncertain' | null
  verifierB: 'real' | 'generic' | 'fabricated' | 'uncertain' | null
}

export function computeConfidence(inputs: ConfidenceInputs): ConfidenceScore {
  const distinctCategories = new Set(inputs.sources.map(s => s.category)).size
  const sourceDiversity = Math.min(WEIGHTS.confidence.sourceDiversityMax, distinctCategories * 6)

  const meanReliability = inputs.sources.length
    ? inputs.sources.reduce((a, s) => a + s.reliability, 0) / inputs.sources.length
    : 0
  const sourceReliability = Math.round(meanReliability * 5)

  const crossCountrySpread = Math.min(WEIGHTS.confidence.crossCountryMax, inputs.countryRelevance.length * 3)

  const articleDateFreshness =
    inputs.articleDateVerdict === 'fresh' ? 15
    : inputs.articleDateVerdict === 'inconclusive' ? 8
    : 0

  const manualValidation =
    inputs.manualValidationStatus === 'approved' ? 10
    : inputs.manualValidationStatus === 'pending' ? 5
    : 0

  const verifierAgreement =
    inputs.verifierA === 'real' && inputs.verifierB === 'real' ? 5
    : inputs.verifierA === 'real' || inputs.verifierB === 'real' ? 2
    : 0

  const breakdown = {
    sourceDiversity,
    sourceReliability,
    crossCountrySpread,
    articleDateFreshness,
    manualValidation,
    verifierAgreement,
  }
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0)

  return {
    total,
    breakdown,
    computedAt: new Date().toISOString(),
    inputsHash: hashInputs(inputs),
  }
}

function hashInputs(_: ConfidenceInputs): string {
  // [ASSUMPTION] Simple string hash is fine; we only need drift detection,
  // not crypto. Use a tiny FNV-1a or just JSON.stringify length+chars.
  return 'todo'
}
```

```ts
// lib/scoring/weights.ts — single source of truth
export const WEIGHTS = {
  confidence: {
    sourceDiversityMax: 30,
    sourceReliabilityMax: 25,
    crossCountryMax: 15,
    articleDateMax: 15,
    manualValidationMax: 10,
    verifierAgreementMax: 5,
  },
  actionFit: {
    categoryMatchMax: 35,
    marketOverlapMax: 25,
    brandVoiceMax: 20,
    audienceMax: 10,
    lifecycleMax: 10,
  },
  commercial: {
    productOpportunityMax: 35,
    pricePointMax: 20,
    basketAdjacencyMax: 15,
    seasonalLiftMax: 15,
    speedMax: 10,
    confidenceFloorMax: 5,
  },
  creative: {
    visualDistinctnessMax: 30,
    formatClarityMax: 25,
    creatorAvailabilityMax: 20,
    brandVoiceMax: 15,
    speedMax: 10,
  },
} as const
```

Sibling files `action-fit.ts`, `commercial-relevance.ts`, `creative-relevance.ts`, `breakout-probability.ts`, `saturation-risk.ts` follow the same pure-function shape.

### 4.3 · API endpoints

#### New endpoints (under `/api/culture/v2/`)

**`v2/confidence/route.ts`** — recomputes and returns trust panel data for one trend.

```ts
export async function GET(req: Request) {
  const url = new URL(req.url)
  const trendId = url.searchParams.get('id')
  if (!trendId) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const data = await getConfidenceData(trendId)  // joins sources, verifiers, etc.
  const score = computeConfidence(data)
  // Persist for caching
  await sql().query(
    `UPDATE culture_trends SET confidence_score = $1, confidence_breakdown = $2
     WHERE id = $3`,
    [score.total, JSON.stringify(score.breakdown), trendId]
  )
  return NextResponse.json(score)
}
```

**`v2/decision/route.ts`** — POST a state transition.

```ts
export async function POST(req: Request) {
  const body = DecisionTransitionSchema.parse(await req.json())
  const { trendId, toState, rationale } = body
  const trend = await sql().query(
    `SELECT decision_state FROM culture_trends WHERE id = $1`, [trendId]
  ).then(r => r[0])
  if (!trend) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const from = trend.decision_state
  if (!canTransition(from, toState))
    return NextResponse.json({ error: `cannot ${from} → ${toState}` }, { status: 422 })
  if (rationaleRequired(toState) && !rationale)
    return NextResponse.json({ error: 'rationale required' }, { status: 422 })

  await sql().query(
    `UPDATE culture_trends SET decision_state = $1, decision_updated_at = NOW()
     WHERE id = $2`, [toState, trendId]
  )
  await sql().query(
    `INSERT INTO culture_decision_history (trend_id, from_state, to_state, actor, rationale)
     VALUES ($1, $2, $3, $4, $5)`,
    [trendId, from, toState, getActor(req), rationale ?? null]
  )
  return NextResponse.json({ ok: true })
}
```

**`v2/review-queue/route.ts`** — list trends in `validate` state.

```ts
export async function GET() {
  const rows = await sql().query(
    `SELECT id, name, slug, confidence_score, action_fit_score,
            first_seen_at, source_names, decision_owner
       FROM culture_trends
      WHERE decision_state = 'validate' AND status = 'active'
      ORDER BY confidence_score DESC NULLS LAST, first_seen_at DESC
      LIMIT 100`
  )
  return NextResponse.json({ trends: rows })
}
```

**`v2/system-health/route.ts`** — for the dashboard banner + system page.

```ts
export async function GET() {
  const [last] = await sql().query(
    `SELECT started_at, finished_at, sources_attempted, sources_ok, sources_failed,
            trends_inserted, status
       FROM culture_fetch_runs ORDER BY started_at DESC LIMIT 1`
  )
  const ageMs = last ? Date.now() - new Date(last.started_at).getTime() : null
  const ageHours = ageMs ? Math.round(ageMs / 3_600_000) : null

  const [queue] = await sql().query(
    `SELECT COUNT(*) FILTER (WHERE processed_at IS NULL AND status = 'ok') AS queue
       FROM culture_scrape_results`
  )

  const [sourceHealth] = await sql().query(
    `SELECT COUNT(*) FILTER (WHERE last_scrape_status = 'ok') AS ok,
            COUNT(*) AS total
       FROM culture_sources WHERE active = true`
  )

  return NextResponse.json({
    ageHours,
    stale: ageHours !== null && ageHours > 18,
    degraded: last && last.sources_failed / Math.max(1, last.sources_attempted) > 0.1,
    lastRun: last,
    queueDepth: Number(queue.queue),
    sourceHealth: {
      ok: Number(sourceHealth.ok),
      total: Number(sourceHealth.total),
    },
  })
}
```

**`v2/action-fit/route.ts`** — POST batch recompute.

```ts
export async function POST(req: Request) {
  const { limit = 50 } = await req.json().catch(() => ({}))
  const trends = await sql().query(
    `SELECT id, category, country_relevance, vibe, subculture_id, lifecycle_stage,
            brand_brief, confidence_score
       FROM culture_trends
      WHERE status = 'active' AND (action_fit_score IS NULL OR updated_at > action_fit_computed_at)
      LIMIT $1`, [limit]
  )
  for (const t of trends) {
    const fit = computeActionFit(t)
    await sql().query(
      `UPDATE culture_trends SET
         action_fit_score = $1,
         action_fit_by_market = $2,
         action_fit_computed_at = NOW()
       WHERE id = $3`,
      [fit.score, JSON.stringify(fit.byMarket), t.id]
    )
  }
  return NextResponse.json({ processed: trends.length })
}
```

#### Updated endpoints (existing)

| Route | Change |
|---|---|
| `app/api/culture/trends/route.ts` | Add query params: `confidence_min`, `action_fit_min`, `decision_state`, `entity_type`. Apply at SQL layer. |
| `app/api/culture/submit/route.ts` | Default `decision_state = 'validate'` instead of immediately active. |
| `app/api/culture/feedback/route.ts` | When archiving, also write a `decision_history` row. |
| `app/api/culture/verify-trends/route.ts` | Run **two** Gemini prompts; persist both to `verify_verdict_a`, `verify_verdict_b` + reasoning. |
| `app/api/culture/extract/route.ts` | Default new trends to `decision_state = 'monitor'` and `manual_validation_status = 'pending'`. |
| `app/api/culture/cron-refresh/route.ts` | Legacy — leave alone. GHA workflow is the canonical path. |

### 4.4 · GHA workflow update

`.github/workflows/cron-refresh.yml` gets two new phases between current phases 3 and 4:

```yaml
- name: Recompute confidence scores
  if: success()
  env:
    BEARER: ${{ secrets.CULTURE_API_SECRET }}
  run: |
    curl -sS -o /tmp/p.json -w 'confidence HTTP %{http_code} (%{time_total}s)\n' \
      -X POST -H "Authorization: Bearer $BEARER" -H 'Content-Type: application/json' \
      --max-time 300 -d '{"limit":200}' "$BASE_URL/api/culture/v2/confidence/batch"
    jq '{updated, errors}' /tmp/p.json || head -c 300 /tmp/p.json

- name: Recompute Action Fit
  if: success()
  env:
    BEARER: ${{ secrets.CULTURE_API_SECRET }}
  run: |
    curl -sS -o /tmp/p.json -w 'action-fit HTTP %{http_code} (%{time_total}s)\n' \
      -X POST -H "Authorization: Bearer $BEARER" -H 'Content-Type: application/json' \
      --max-time 300 -d '{"limit":100}' "$BASE_URL/api/culture/v2/action-fit"
```

And a new last phase for ops alerts:

```yaml
- name: Pipeline health summary
  if: always()
  env:
    BEARER: ${{ secrets.CULTURE_API_SECRET }}
  run: |
    curl -sS "$BASE_URL/api/culture/v2/system-health" -H "Authorization: Bearer $BEARER" \
      | jq '{stale, degraded, queueDepth, sourceHealth, ageHours}'
```

A second workflow `.github/workflows/cron-miss-alert.yml` runs at 09:00 UTC daily:

```yaml
name: Cron miss alarm
on:
  schedule:
    - cron: "0 9 * * *"
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: |
          AGE=$(curl -sS "${{ vars.BASE_URL }}/api/culture/v2/system-health" \
            -H "Authorization: Bearer ${{ secrets.CULTURE_API_SECRET }}" \
            | jq -r '.ageHours')
          if [ "$AGE" -gt "4" ]; then
            echo "::error::Last cron run is $AGE hours old; firing alert"
            # POST to WhatsApp bridge / Slack
            curl -X POST "${{ secrets.ALERT_WEBHOOK }}" \
              -d "{\"text\":\"Culture Radar cron stale: ${AGE}h since last run\"}"
            exit 1
          fi
```

### 4.5 · UI components

#### `components/culture/TrustPanel.tsx` (NEW)

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { TrustPanelData } from '@/types/culture-vnext'

export function TrustPanel({ trendId, mode = 'inline' }: {
  trendId: string
  mode?: 'inline' | 'drawer'
}) {
  const [data, setData] = useState<TrustPanelData | null>(null)
  useEffect(() => {
    fetch(`/api/culture/v2/confidence?id=${trendId}`)
      .then(r => r.json()).then(setData)
  }, [trendId])
  if (!data) return <div>Loading trust…</div>
  return (
    <div className={mode === 'drawer' ? 'jai-drawer' : 'jai-inline-trust'}>
      <ConfidenceBreakdownChart breakdown={data.confidence.breakdown} />
      <SourceList sources={data.sources} />
      <VerifierComparison a={data.verifierA} b={data.verifierB} />
      <ArticleDateVerdictRow value={data.articleDate} />
      <ManualValidationLog value={data.manualValidation} />
    </div>
  )
}
```

#### `components/culture/ConfidenceDisc.tsx` (NEW)

A simple SVG disc with the number and a click handler.

#### `components/culture/DecisionStateMenu.tsx` (NEW)

Dropdown rendering only the allowed next states (uses `canTransition`).

#### `components/culture/DataFreshnessBanner.tsx` (NEW)

Polls `/api/culture/v2/system-health` every 60s; renders amber > 18h, red > 30h.

#### `components/culture/SystemHealthFooter.tsx` (NEW)

Used at the bottom of dashboard and magazine. Shows last run, queue, source health.

#### Existing components

| File | Change |
|---|---|
| `app/culture-radar/page.tsx` | (1) Mount `DataFreshnessBanner` at top. (2) Replace KPI strip with the new three KPIs. (3) Add server-side filters via URL state. (4) Mount `SystemHealthFooter` at bottom. |
| `app/culture-radar/trend-cards.tsx` | (1) Add `ConfidenceDisc` and `RelevanceTriptych` to each card. (2) Replace static growth badge with velocity arrow. (3) Wire `DecisionStateMenu` for in-place state changes. |
| `app/culture-radar/trends/[slug]/page.tsx` | (1) New header block. (2) Replace `brand_brief` blob with structured sub-sections. (3) Render decision history timeline. (4) Embed `TrustPanel` inline. |

### 4.6 · Magazine renderer

`lib/report-renderer.ts` (the 2066-line file) gets a careful refactor. We don't rewrite it; we add functions and reorder.

New functions:

```ts
// At top of report
function renderExecutiveSummary(d: ReportData): string {
  // 2-sentence editorial + 3 act / 2 monitor / 1 skip block
}

function render3Act2Monitor1Skip(d: ReportData): string {
  const act = d.dailyTop10
    .filter(t => t.confidenceScore >= 60 && t.recommendedAction.startsWith('act_'))
    .slice(0, 3)
  const monitor = d.dailyTop10
    .filter(t => t.recommendedAction === 'monitor' && t.actionFitScore >= 50)
    .slice(0, 2)
  const skip = pickSkipExample(d)
  return /* markup */
}
```

Modifications:

- Cover masthead block now wraps the executive summary.
- Every `renderTrendCard` call inserts a `ConfidenceDisc` SVG.
- `renderBreakoutSection` prepends a "Why:" line per card from `confidenceBreakdown`.
- `renderSparklineSvg` now takes `lifecycleStage` and picks the stroke colour.
- `renderCountryPulseSection` splits each market into `global` and `local` subgroups.
- `renderMomentRow` inlines the action angle from `brand_brief.contentAngle`.
- `renderSkipList` adds algorithmic flags beyond verdict.
- New `renderSystemHealthFooter` appended after pull quote.

We keep all visual constants (fonts, colours, paddings) untouched.

---

## 5 · API contract changes

### 5.1 · `/api/culture/trends` v1 → v2

Today's response keeps the `CultureTrend` shape. vNext adds fields:

```ts
{
  // existing fields unchanged
  ...
  // new
  confidenceScore: number | null
  confidenceBreakdown: ConfidenceBreakdown | null
  actionFitScore: number | null
  commercialRelevanceScore: number | null
  creativeRelevanceScore: number | null
  breakoutProbability: number | null
  saturationRisk: number | null
  speedToActivation: SpeedToActivation | null
  recommendedAction: RecommendedAction | null
  recommendedMarket: string[]
  decisionState: DecisionState
  decisionOwner: string | null
  manualValidationStatus: 'pending' | 'approved' | 'rejected'
}
```

Backwards compatible: clients ignore unknown fields. Old clients keep working.

### 5.2 · Filter parameters

The `/api/culture/trends` endpoint now accepts:

| Param | Type | Effect |
|---|---|---|
| `confidence_min` | int 0-100 | `WHERE confidence_score >= ?` |
| `action_fit_min` | int 0-100 | `WHERE action_fit_score >= ?` |
| `decision_state` | enum | `WHERE decision_state = ?` (CSV for OR) |
| `entity_type` | enum | trend / format / sound / creator / moment |

URL state: dashboard mirrors these in the URL via Next.js `useSearchParams`.

---

## 6 · Caching and performance

The trust panel data is computed on-demand but cached in `culture_trends.confidence_score` + `confidence_breakdown` JSONB. Recompute triggers:

- New trend insert
- Source list change (new source, source archived)
- New verifier verdict
- Daily refresh recompute pass

Server-side trend listing (`/api/culture/trends`) uses these indexed columns; no per-request computation.

Action Fit, Commercial, Creative scores follow the same pattern.

[ASSUMPTION] We don't need ISR for the magazine yet. Current `/api/culture/report.html` is `dynamic = force-dynamic`; we keep it. If page generation time becomes a problem after vNext (it adds work), we revisit.

---

## 7 · Phased delivery

### 7.1 · MVP — Weeks 1–6

| Week | Deliverable | Files / artefacts |
|---|---|---|
| 1 | Migrations 001 + 002 + 003 + 005; scoring library skeleton | `db/migrations/*.sql`, `lib/scoring/*` |
| 2 | Confidence endpoint + Trust panel component (inline) | `app/api/culture/v2/confidence`, `components/culture/TrustPanel.tsx` |
| 3 | Decision state machine + endpoint + UI menu + history table reads | `lib/decision/states.ts`, `app/api/culture/v2/decision/route.ts`, `components/culture/DecisionStateMenu.tsx` |
| 4 | Migrations 004 + 006; Action Fit + Commercial + Creative scoring | `lib/scoring/action-fit.ts` etc., `app/api/culture/v2/action-fit` |
| 5 | Magazine vNext (exec summary, confidence badges, reasoning); system trust banners | `lib/report-renderer.ts`, `components/culture/DataFreshnessBanner.tsx`, `SystemHealthFooter.tsx` |
| 6 | System health page; observability workflow; polish + accessibility + virtualisation | `app/culture-radar/system/page.tsx`, `.github/workflows/cron-miss-alert.yml` |

### 7.2 · Phase 2 — Weeks 7–12

- Workflow (owner, reviewer, history surface, bulk actions): E4
- Creator entity: `culture_creators` table + dedupe job
- Notifications on high-Action-Fit trends (WhatsApp / Slack)
- Trust panel as drawer (not just inline)
- Subculture management admin UI

### 7.3 · Phase 3 — Weeks 13+

- Moment ↔ trend linkage
- A/B test variants
- Trend threads across weeks
- Editable executive summary admin
- ML-trained scoring once ≥3 months of validation data exists

---

## 8 · Testing strategy

### 8.1 · Unit tests (Vitest)

New: every scoring function gets a test file with explicit table-driven cases.

```ts
// lib/scoring/confidence.test.ts
import { describe, it, expect } from 'vitest'
import { computeConfidence } from './confidence'

describe('computeConfidence', () => {
  it('rewards source category diversity', () => {
    const score = computeConfidence({
      sources: [
        { category: 'tiktok', reliability: 3, lastSeen: new Date() },
        { category: 'newsletter', reliability: 3, lastSeen: new Date() },
        { category: 'reddit', reliability: 3, lastSeen: new Date() },
      ],
      countryRelevance: ['NL', 'BE'],
      articleDateVerdict: 'fresh',
      manualValidationStatus: 'pending',
      verifierA: 'real',
      verifierB: 'real',
    })
    expect(score.breakdown.sourceDiversity).toBe(18)
    expect(score.total).toBeGreaterThan(60)
  })

  it('caps single-source trends at 35', () => {
    const score = computeConfidence({
      sources: [{ category: 'tiktok', reliability: 3, lastSeen: new Date() }],
      countryRelevance: [],
      articleDateVerdict: 'fresh',
      manualValidationStatus: 'pending',
      verifierA: 'real',
      verifierB: 'real',
    })
    expect(score.total).toBeLessThanOrEqual(35)
  })

  // … cap-on-low-reliability, stale article date penalty, etc.
})
```

Coverage target for MVP: 90% on `lib/scoring/`, 80% on `lib/decision/`.

### 8.2 · Integration tests

Two new GHA jobs:

- **`test-migrations.yml`** — spin up a Neon branch DB, run all migrations top-to-bottom, fail if any error.
- **`test-pipeline-smoke.yml`** — after every push, run a 5-source scrape + extract against staging; assert non-zero new trends, confidence computed, decision state defaults set.

### 8.3 · UI smoke

Using Playwright (already in deferred tools):

- Dashboard loads with stale banner mock data.
- Trend card opens trust panel.
- Decision state menu transitions monitor → validate; refresh shows new state.
- Magazine renders exec summary + confidence badges + system footer.

### 8.4 · Migration rehearsal

Before applying migrations to production Neon:

1. Run on a Neon branch DB seeded with a recent prod snapshot (Neon supports this natively).
2. Run vNext API endpoints against that branch DB.
3. Verify a sample of trends has correct `confidence_score`.
4. Roll back the branch, deploy migration runner to prod.

---

## 9 · Rollout

### 9.1 · Feature flags

We don't have a feature flag system yet. We add a tiny one:

```ts
// lib/feature-flags.ts
export function flag(name: string): boolean {
  const val = process.env[`FLAG_${name.toUpperCase()}`]
  return val === '1' || val === 'true'
}
```

Used like `if (flag('vnext_magazine')) { /* new layout */ } else { /* old */ }`.

Flags shipped:

- `FLAG_VNEXT_CONFIDENCE` — show confidence disc on cards.
- `FLAG_VNEXT_TRUST_PANEL` — enable the drawer / inline panel.
- `FLAG_VNEXT_DECISION_STATE` — show the state menu on cards.
- `FLAG_VNEXT_MAGAZINE` — render new magazine layout.
- `FLAG_VNEXT_SYSTEM_BANNERS` — show stale / degraded banners.

Default OFF in prod for week 1; flipped ON after each phase verifies.

### 9.2 · Backwards compatibility window

- Old `status` column stays alongside `decision_state` for 4 weeks.
- Old `description` keeps an alias to `summary`.
- Old `validation_score` keeps populated alongside new diversity / reliability scores for 2 weeks.
- v1 API endpoints keep returning new fields as null until clients are updated.

### 9.3 · Monitoring during rollout

Add a small `culture_vnext_metrics` event log:

| Event | When |
|---|---|
| `trust_panel_opened` | User clicks confidence disc |
| `decision_transition` | State change posted |
| `magazine_exec_summary_click` | Reader clicks act / monitor / skip link |
| `confidence_score_drift` | Computed score differs > 20 from previous run |
| `dual_verifier_disagreement` | a ≠ b |

Cheap to write, expensive to lack. We need these to tune weights in section 7 of PRD.

---

## 10 · Cost estimate

The new computations add cost. Order of magnitude:

| Item | Per refresh | Per month |
|---|---|---|
| Dual verifier (only on uncertain band, ~30% of trends) | +~$0.30 | +~$9 |
| Action Fit scoring (Gemini classifier on first detection) | +~$0.40 | +~$12 |
| Commercial / Creative classifier | +~$0.50 | +~$15 |
| Magazine recompute (heavier) | +~$0.05 | +~$1.50 |
| **Total added vs today** | **+~$1.25** | **+~$37** |

Current daily cost is roughly $4 (Firecrawl + Gemini extraction + briefs + image gen). vNext brings this to roughly $5.25 / day, ~$160 / month. [ASSUMPTION] All numbers based on observed token usage in May 2026; Gemini Flash pricing assumed stable.

---

## 11 · Operational checklist for week 1

Concrete things to do day 1:

1. **Spin up Neon branch DB** — clone prod, name `vnext-mvp`.
2. **Create migrations folder** `db/migrations/` with files 001–006 from §2.
3. **Run `scripts/migrate.ts`** against the branch DB.
4. **Verify** the new columns exist; sample SELECT confirms `decision_state = 'monitor'` for active trends.
5. **Create `lib/scoring/weights.ts`** with the section 7 weights.
6. **Create `lib/scoring/confidence.ts`** with the pure function + Vitest test file.
7. **Wire** `/api/culture/v2/confidence/route.ts` against the branch DB.
8. **Hit** `GET /api/culture/v2/confidence?id=<known-trend-id>` and check response.
9. **Add** `FLAG_VNEXT_CONFIDENCE` to Vercel env vars (preview env first).
10. **PR** with the migrations + scoring + endpoint; review; merge to a `vnext` branch (not main yet).

---

## 12 · Open engineering questions

These are below the PRD's open questions; they're details engineering needs to decide as it builds.

1. **Should `confidence_breakdown` be a JSONB or separate columns?**
   Recommendation: JSONB for now (flexible), structured columns once stable. Cost is one ALTER TABLE later.

2. **How do we name "v2" endpoints long-term?**
   Recommendation: ship under `/api/culture/v2/`. When the migration is done, deprecate v1 under `/api/culture/legacy/` and rename v2 to `/api/culture/`. Two-step move.

3. **How do we test Postgres ENUMs locally?**
   Recommendation: docker-compose with Postgres 16, seed from a Neon branch dump.

4. **Where do we put server-side authoring of executive summary?**
   Recommendation: `lib/exec-summary.ts` with a deterministic auto-generator (top 5 trends by `confidence × action_fit`) plus a `culture_magazine_overrides` table the editor writes to.

5. **Should the `culture_subcultures` table support i18n labels?**
   Recommendation: not in MVP. Phase 2 if a non-English deck is needed.

6. **How do we audit changes to weight constants?**
   Recommendation: keep `lib/scoring/weights.ts` version-controlled; require PR review; add a migration that snapshots the weight values when a major change rolls out (so retro analysis is possible).

7. **The dual-write column approach (`category` and `category_e`)** — when do we drop the TEXT version?
   Recommendation: 4 weeks after vNext goes live and stable.

8. **Does the magazine renderer become server component or stay server-side string?**
   Recommendation: stay string for now (faster, no client tree); revisit if interactivity moves to client.

9. **How do we track the cron-of-the-cron (the 09:00 UTC alarm)?**
   Recommendation: it just emails / WhatsApps on failure; we don't need a dashboard for it yet.

10. **Should `confidence_score = NULL` mean "not yet computed" or "uncomputable"?**
    Recommendation: `NULL` = not yet computed; introduce `confidence_uncomputable_reason TEXT` if a trend has structural issues (no sources, etc.).

---

## 13 · Definition of done (MVP)

vNext MVP is shipped when:

- [ ] All 6 migrations applied to production Neon.
- [ ] `lib/scoring/` has 6 functions, each with ≥80% unit test coverage.
- [ ] `/api/culture/v2/{confidence,decision,review-queue,system-health,action-fit}` all live and authenticated correctly.
- [ ] Dashboard renders confidence disc + decision state menu on every card behind `FLAG_VNEXT_CONFIDENCE`.
- [ ] Magazine renders executive summary + 3-act-2-monitor-1-skip + confidence badges + system footer behind `FLAG_VNEXT_MAGAZINE`.
- [ ] System health page exists at `/culture-radar/system`.
- [ ] Cron-miss alert workflow runs daily and has fired at least once in test.
- [ ] All flags flipped ON in prod after a 1-week dual-rendering soak.
- [ ] Old `status` + `validation_score` columns still backwards compatible.
- [ ] Two-page handover note in `docs/` for the next engineer.

---

*End of implementation plan. PRD: `docs/culture-radar-vnext-prd.md`.*
