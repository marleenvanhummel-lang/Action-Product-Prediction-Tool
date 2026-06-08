-- vNext migration 005 · Decision history audit log

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

CREATE INDEX IF NOT EXISTS idx_decision_history_trend
  ON culture_decision_history (trend_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_history_state
  ON culture_decision_history (to_state, created_at DESC);

INSERT INTO culture_migrations (name) VALUES ('2026-06-08-005-decision-history')
ON CONFLICT (name) DO NOTHING;
