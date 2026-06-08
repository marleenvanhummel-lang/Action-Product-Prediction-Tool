-- vNext migration 006 · Action Fit / Commercial / Creative scoring + recommended action

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
  ADD COLUMN IF NOT EXISTS action_fit_by_market JSONB,
  ADD COLUMN IF NOT EXISTS action_fit_computed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_trends_action_fit_active
  ON culture_trends (action_fit_score DESC) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_trends_recommended_action
  ON culture_trends (recommended_action, action_fit_score DESC)
  WHERE status = 'active' AND recommended_action IS NOT NULL;

INSERT INTO culture_migrations (name) VALUES ('2026-06-08-006-action-fit-fields')
ON CONFLICT (name) DO NOTHING;
