-- =====================================================================
-- Culture Radar — Schema (Neon / Vercel Postgres)
-- =====================================================================
-- Run this against your Neon / Vercel Postgres database.
--   - Neon dashboard:  SQL Editor → paste → Run
--   - psql:            psql $POSTGRES_URL -f schema.sql
--
-- No RLS (Culture Radar is admin-only, protected at the API layer by
-- API_SECRET in middleware.ts). All writes go through service-side code
-- using the POSTGRES_URL connection string.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- culture_sources
-- Curated catalogue of scrapeable sources (TikTok, Reddit, blogs, etc).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS culture_sources (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,           -- food | beauty | fashion | home | lifestyle | tech | meme | platform | sound | culture
  source_type TEXT NOT NULL,        -- platform | blog | reddit | youtube | instagram_proxy | hashtag_page | aggregator | google_trends_api
  reliability INTEGER NOT NULL DEFAULT 3,   -- 1-5 stars
  detection_lag_days INTEGER,       -- typical lag from real trend emergence
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  last_scraped_at TIMESTAMPTZ,
  last_scrape_status TEXT,          -- ok | error | skipped
  last_scrape_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_culture_sources_active ON culture_sources (active, category);

-- ---------------------------------------------------------------------
-- culture_trends
-- One row per unique trend per week. Lifecycle: emerging → peak → declining → archived.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS culture_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),

  name TEXT NOT NULL,
  slug TEXT NOT NULL,                       -- normalized for dedup: lowercase, no diacritics
  description TEXT NOT NULL,                -- AI-generated, explains what it is + why trending NOW
  category TEXT NOT NULL,                   -- food | beauty | fashion | home | lifestyle | tech | meme | culture
  content_type TEXT,                        -- hashtag | format | sound | aesthetic | behavior | meme

  hashtags TEXT[] DEFAULT '{}',
  example_urls TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,

  popularity_score NUMERIC NOT NULL DEFAULT 0,   -- 0-10, AI-assigned
  freshness_score NUMERIC NOT NULL DEFAULT 10,   -- 10 = this week, drops to 0 after 7 days
  validation_score INTEGER NOT NULL DEFAULT 1,   -- # of distinct sources confirming this trend
  reasoning TEXT,                                -- AI explanation of the scores

  source_ids INTEGER[] DEFAULT '{}',             -- references culture_sources.id
  source_names TEXT[] DEFAULT '{}',              -- denormalized for fast UI rendering

  daily_rank INTEGER,                            -- 1-10 if in daily top 10
  weekly_rank INTEGER,                           -- 1-50 if in weekly top 50
  rank_date DATE,
  rank_week TEXT,                                -- ISO week, e.g. "2026-W19"

  estimated_views TEXT,                          -- raw string like "20M this week"

  status TEXT NOT NULL DEFAULT 'active',         -- active | archived | flagged
  UNIQUE (slug, rank_week)
);

CREATE INDEX IF NOT EXISTS idx_culture_trends_status_week ON culture_trends (status, rank_week);
CREATE INDEX IF NOT EXISTS idx_culture_trends_category ON culture_trends (category);
CREATE INDEX IF NOT EXISTS idx_culture_trends_daily_rank ON culture_trends (rank_date, daily_rank) WHERE daily_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_culture_trends_weekly_rank ON culture_trends (rank_week, weekly_rank) WHERE weekly_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_culture_trends_popularity ON culture_trends (popularity_score DESC);

-- ---------------------------------------------------------------------
-- culture_predictions
-- Forward-looking AI predictions: emerging trends, seasonal events, lifecycle phases.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS culture_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  prediction_type TEXT NOT NULL,            -- emerging | lifecycle | seasonal
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 50,   -- 0-100

  predicted_peak_date DATE,
  predicted_duration_days INTEGER,

  related_trend_ids UUID[] DEFAULT '{}',
  related_trend_names TEXT[] DEFAULT '{}',
  hashtags TEXT[] DEFAULT '{}',
  categories TEXT[] DEFAULT '{}',
  seasonal_event TEXT,

  status TEXT NOT NULL DEFAULT 'active',    -- active | confirmed | expired | failed
  expires_at TIMESTAMPTZ DEFAULT (NOW() + interval '14 days')
);

CREATE INDEX IF NOT EXISTS idx_culture_predictions_type_status ON culture_predictions (prediction_type, status);
CREATE INDEX IF NOT EXISTS idx_culture_predictions_expires ON culture_predictions (expires_at);

-- ---------------------------------------------------------------------
-- culture_moderation
-- Team feedback on trends. Feeds the learning loop.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS culture_moderation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  trend_id UUID NOT NULL REFERENCES culture_trends(id) ON DELETE CASCADE,
  user_email TEXT,                          -- who reviewed it (free-form for now)

  action TEXT NOT NULL,                     -- approve | reject | flag | use
  reason TEXT,                              -- optional free-text reason
  feedback_tags TEXT[] DEFAULT '{}'         -- e.g. ['off-brand', 'too-old', 'niche-fit']
);

CREATE INDEX IF NOT EXISTS idx_culture_moderation_trend ON culture_moderation (trend_id);

-- ---------------------------------------------------------------------
-- culture_fetch_runs
-- Audit log of every scrape+AI run, so we can debug + show "last refresh".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS culture_fetch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  triggered_by TEXT,                        -- 'manual' | 'cron' | user_email
  sources_attempted INTEGER NOT NULL DEFAULT 0,
  sources_ok INTEGER NOT NULL DEFAULT 0,
  sources_failed INTEGER NOT NULL DEFAULT 0,
  trends_inserted INTEGER NOT NULL DEFAULT 0,
  trends_updated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',   -- running | ok | partial | failed
  error TEXT,
  ai_model TEXT,
  ai_tokens_in INTEGER,
  ai_tokens_out INTEGER
);

CREATE INDEX IF NOT EXISTS idx_culture_fetch_runs_started ON culture_fetch_runs (started_at DESC);
