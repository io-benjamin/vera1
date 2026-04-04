-- Migration 010: Data quality scoring
-- Tracks institution-level reliability and per-transaction/pattern quality scores

-- Institution capabilities: what each bank actually provides via Plaid
CREATE TABLE IF NOT EXISTS institution_capabilities (
  institution_id    TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  supports_pending  BOOLEAN NOT NULL DEFAULT false,
  supports_time     BOOLEAN NOT NULL DEFAULT false,  -- true if Plaid returns datetime, not just date
  reliability_score DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed known institutions
INSERT INTO institution_capabilities (institution_id, name, supports_pending, supports_time, reliability_score, notes)
VALUES
  -- Amex: no pending via Plaid, date-only
  ('ins_amex',          'American Express',   false, false, 0.50, 'Does not expose pending transactions to Plaid'),
  -- Chase: pending supported, no time
  ('ins_chase',         'Chase',              true,  false, 0.85, 'Reliable pending, date-only'),
  -- Wells Fargo: pending sometimes, no time
  ('ins_wells_fargo',   'Wells Fargo',        true,  false, 0.80, 'Generally reliable pending'),
  -- Capital One: inconsistent pending
  ('ins_capital_one',   'Capital One',        true,  false, 0.70, 'Pending sometimes delayed or missing'),
  -- Citi: no pending reliably
  ('ins_citi',          'Citi',               false, false, 0.55, 'Pending transactions often missing'),
  -- Bank of America: pending supported
  ('ins_bofa',          'Bank of America',    true,  false, 0.80, 'Generally reliable'),
  -- Discover: partial pending support
  ('ins_discover',      'Discover',           true,  false, 0.70, 'Inconsistent pending'),
  -- Unknown fallback
  ('ins_unknown',       'Unknown Institution', false, false, 0.50, 'Assume worst case')
ON CONFLICT (institution_id) DO NOTHING;

-- Per-transaction data quality score (0.0–1.0, computed at sync time)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS data_quality_score DECIMAL(3,2) NOT NULL DEFAULT 0.50;

-- Per-pattern quality score + reason (set at detection time)
ALTER TABLE detected_habits
  ADD COLUMN IF NOT EXISTS data_quality_score DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS confidence_reason   TEXT;

-- Index for filtering by quality in habit detection queries
CREATE INDEX IF NOT EXISTS idx_transactions_data_quality
  ON transactions (data_quality_score);
