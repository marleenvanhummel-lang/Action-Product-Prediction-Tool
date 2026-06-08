-- vNext migration 001 · Postgres ENUM types for taxonomy fields
-- Strategy: add typed columns alongside existing TEXT columns (dual-write window).
-- After 4 stable weeks we drop the TEXT columns and rename the _e variants.

CREATE TABLE IF NOT EXISTS culture_migrations (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Normalise existing TEXT values
UPDATE culture_trends SET category = lower(trim(category)) WHERE category IS NOT NULL;
UPDATE culture_trends SET vibe = lower(trim(vibe)) WHERE vibe IS NOT NULL;
UPDATE culture_trends SET content_type = lower(trim(content_type)) WHERE content_type IS NOT NULL;
UPDATE culture_trends SET verify_verdict = lower(trim(verify_verdict)) WHERE verify_verdict IS NOT NULL;
UPDATE culture_trends SET lifecycle_stage = lower(trim(lifecycle_stage)) WHERE lifecycle_stage IS NOT NULL;

-- Add typed columns (dual-write)
ALTER TABLE culture_trends
  ADD COLUMN IF NOT EXISTS category_e culture_category,
  ADD COLUMN IF NOT EXISTS content_type_e culture_content_type,
  ADD COLUMN IF NOT EXISTS vibe_e culture_vibe,
  ADD COLUMN IF NOT EXISTS verify_verdict_e culture_verify_verdict,
  ADD COLUMN IF NOT EXISTS verify_verdict_b culture_verify_verdict,
  ADD COLUMN IF NOT EXISTS verify_reasoning_a TEXT,
  ADD COLUMN IF NOT EXISTS verify_reasoning_b TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_stage_e culture_lifecycle_stage;

-- Backfill from TEXT to ENUM where values are valid.
-- Rows with unknown values keep _e = NULL; can be reviewed via:
--   SELECT id, name, category FROM culture_trends WHERE category_e IS NULL AND category IS NOT NULL;
UPDATE culture_trends SET
  category_e = CASE WHEN category IN
    ('food','beauty','fashion','home','lifestyle','tech','meme','culture','platform','sound')
    THEN category::culture_category END,
  content_type_e = CASE WHEN content_type IN
    ('hashtag','format','sound','aesthetic','behavior','meme')
    THEN content_type::culture_content_type END,
  vibe_e = CASE WHEN vibe IN
    ('unhinged','aesthetic','humor','wholesome','emotional','informational','product','sport')
    THEN vibe::culture_vibe END,
  verify_verdict_e = CASE WHEN verify_verdict IN
    ('real','generic','fabricated','uncertain')
    THEN verify_verdict::culture_verify_verdict END,
  lifecycle_stage_e = CASE WHEN lifecycle_stage IN
    ('emerging','climbing','peak','declining','dormant')
    THEN lifecycle_stage::culture_lifecycle_stage END;

INSERT INTO culture_migrations (name) VALUES ('2026-06-08-001-enums')
ON CONFLICT (name) DO NOTHING;
