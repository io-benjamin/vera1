CREATE TABLE IF NOT EXISTS behavior_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  insight_title    TEXT NOT NULL,
  insight_content  TEXT NOT NULL,
  insight_action   TEXT NOT NULL,
  habit_fingerprint TEXT NOT NULL,   -- hash of habit ids+trends so we detect meaningful change
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_behavior_snapshots_user_period
  ON behavior_snapshots (user_id, created_at DESC);
