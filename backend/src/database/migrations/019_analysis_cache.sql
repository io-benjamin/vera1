CREATE TABLE IF NOT EXISTS analysis_cache (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint      TEXT NOT NULL,   -- hash of tx count + latest tx date + habit state
  analysis_json    JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_user
  ON analysis_cache (user_id, created_at DESC);
