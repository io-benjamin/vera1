-- Migration 013: Time-of-day enrichment + reliability scoring
-- Adds user-provided, inferred, and source-tracked time fields to transactions.
-- All columns are nullable so existing rows remain valid.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS user_time_of_day      TEXT CHECK (user_time_of_day IN ('morning','midday','evening','night')),
  ADD COLUMN IF NOT EXISTS inferred_time_of_day  TEXT CHECK (inferred_time_of_day IN ('morning','midday','evening','night')),
  ADD COLUMN IF NOT EXISTS time_source           TEXT CHECK (time_source IN ('user','pending','inferred')),
  ADD COLUMN IF NOT EXISTS time_confidence       TEXT CHECK (time_confidence IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS time_reliability_score FLOAT,
  ADD COLUMN IF NOT EXISTS first_seen_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
