-- Add pending_captured_at to transactions
-- Captures the real-world timestamp when a transaction first appears as pending.
-- This is the best proxy we have for time-of-day since banks only provide dates.
-- The column is intentionally never overwritten on conflict — only set on first insert.

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS pending_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_transactions_pending_captured_at
  ON transactions(pending_captured_at)
  WHERE pending_captured_at IS NOT NULL;
