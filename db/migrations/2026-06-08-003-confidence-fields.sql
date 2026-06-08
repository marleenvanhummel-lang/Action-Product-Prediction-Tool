-- vNext migration 003 · Explainable confidence + validation rebuild

ALTER TABLE culture_trends
  ADD COLUMN IF NOT EXISTS confidence_score SMALLINT,
  ADD COLUMN IF NOT EXISTS confidence_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS confidence_computed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_diversity_score SMALLINT,
  ADD COLUMN IF NOT EXISTS validation_reliability_score SMALLINT,
  ADD COLUMN IF NOT EXISTS article_date_verdict TEXT
    CHECK (article_date_verdict IS NULL OR article_date_verdict IN ('fresh','inconclusive','stale')),
  ADD COLUMN IF NOT EXISTS manual_validation_status TEXT
    CHECK (manual_validation_status IS NULL OR manual_validation_status IN ('pending','approved','rejected'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS manual_validation_reviewer TEXT,
  ADD COLUMN IF NOT EXISTS manual_validation_rationale TEXT,
  ADD COLUMN IF NOT EXISTS manual_validation_decided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_trends_confidence_active
  ON culture_trends (confidence_score DESC) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_trends_review_queue
  ON culture_trends (decision_state, confidence_score DESC)
  WHERE status = 'active' AND decision_state = 'validate';

INSERT INTO culture_migrations (name) VALUES ('2026-06-08-003-confidence-fields')
ON CONFLICT (name) DO NOTHING;
