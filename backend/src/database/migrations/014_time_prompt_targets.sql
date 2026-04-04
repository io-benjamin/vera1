-- Migration 014: time_prompt_targets
-- Tracks which transactions have been selected for user time-of-day prompting,
-- and which cluster each belongs to for downstream inference.

CREATE TABLE IF NOT EXISTS time_prompt_targets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id TEXT       NOT NULL,
  cluster_id    TEXT        NOT NULL,
  -- prompted: true = surfaced to the user as a question
  prompted      BOOLEAN     NOT NULL DEFAULT false,
  -- answered: true = user submitted a time_of_day response
  answered      BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by user for pending/answered queries
CREATE INDEX IF NOT EXISTS idx_tpt_user_id ON time_prompt_targets(user_id);

-- Fast lookup by cluster to find all members during inference
CREATE INDEX IF NOT EXISTS idx_tpt_cluster ON time_prompt_targets(user_id, cluster_id);

-- Prevent duplicate rows per (user, transaction)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tpt_unique_user_tx
  ON time_prompt_targets(user_id, transaction_id);
