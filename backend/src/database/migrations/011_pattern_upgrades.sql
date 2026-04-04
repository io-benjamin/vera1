-- Migration 011: Upgraded pattern detection
-- Adds streak tracking, recovery detection, and stress spending cluster support

-- New habit type: stress spending day (behavioral cluster)
ALTER TYPE habit_type ADD VALUE IF NOT EXISTS 'STRESS_SPENDING_DAY';

-- Streak tracking
ALTER TABLE detected_habits
  ADD COLUMN IF NOT EXISTS streak_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_unit    TEXT,             -- 'days' | 'weeks' | 'months'
  ADD COLUMN IF NOT EXISTS streak_start   DATE;             -- when current streak began

-- Recovery tracking
ALTER TABLE detected_habits
  ADD COLUMN IF NOT EXISTS recovery_started_at  TIMESTAMPTZ,  -- when recovery was first detected
  ADD COLUMN IF NOT EXISTS peak_monthly_impact  DECIMAL(15,2); -- worst-ever monthly amount (for recovery %)

-- Index: find recovering habits quickly
CREATE INDEX IF NOT EXISTS idx_detected_habits_recovery
  ON detected_habits (user_id, recovery_started_at)
  WHERE recovery_started_at IS NOT NULL;
