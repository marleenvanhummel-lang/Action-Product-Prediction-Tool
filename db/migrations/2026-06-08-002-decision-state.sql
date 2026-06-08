-- vNext migration 002 · Decision state machine

DO $$ BEGIN
  CREATE TYPE culture_decision_state AS ENUM (
    'monitor','validate','test','activate','measure','archive'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE culture_trends
  ADD COLUMN IF NOT EXISTS decision_state culture_decision_state NOT NULL DEFAULT 'monitor',
  ADD COLUMN IF NOT EXISTS decision_owner TEXT,
  ADD COLUMN IF NOT EXISTS decision_updated_at TIMESTAMPTZ;

-- Backfill: existing archived trends → archive; the rest stay 'monitor' (default).
UPDATE culture_trends SET decision_state = 'archive', decision_updated_at = updated_at
  WHERE status = 'archived';

-- For the manual-submission flow, default new submits to 'validate' (review queue).
-- This is enforced in app/api/culture/submit/route.ts, not via DB default.

INSERT INTO culture_migrations (name) VALUES ('2026-06-08-002-decision-state')
ON CONFLICT (name) DO NOTHING;
