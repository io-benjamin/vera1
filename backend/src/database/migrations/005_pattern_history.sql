-- Migration: 005_pattern_history
-- Adds cumulative pattern tracking for AI learning over time

-- Pattern history table - stores monthly snapshots of each pattern
-- This allows tracking trends over time and building AI context
CREATE TABLE IF NOT EXISTS pattern_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pattern_key VARCHAR(100) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  monthly_amount DECIMAL(15, 2) DEFAULT 0,
  occurrence_count INTEGER DEFAULT 0,
  avg_amount DECIMAL(15, 2) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, pattern_key, period_start)
);

-- Add trend tracking columns to learned_patterns if not exists
ALTER TABLE learned_patterns ADD COLUMN IF NOT EXISTS trend_direction VARCHAR(20);
ALTER TABLE learned_patterns ADD COLUMN IF NOT EXISTS trend_percentage DECIMAL(5, 2);
ALTER TABLE learned_patterns ADD COLUMN IF NOT EXISTS months_tracked INTEGER DEFAULT 1;
ALTER TABLE learned_patterns ADD COLUMN IF NOT EXISTS best_month_amount DECIMAL(15, 2);
ALTER TABLE learned_patterns ADD COLUMN IF NOT EXISTS worst_month_amount DECIMAL(15, 2);
ALTER TABLE learned_patterns ADD COLUMN IF NOT EXISTS ai_context TEXT;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pattern_history_user_id ON pattern_history(user_id);
CREATE INDEX IF NOT EXISTS idx_pattern_history_pattern_key ON pattern_history(pattern_key);
CREATE INDEX IF NOT EXISTS idx_pattern_history_period ON pattern_history(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_history_user_pattern ON pattern_history(user_id, pattern_key);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_learned_patterns_user_updated
  ON learned_patterns(user_id, updated_at DESC);

-- Add unique constraint to detected_habits for upsert support
-- This allows updating existing habits instead of deleting/recreating
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'detected_habits_user_habit_unique'
  ) THEN
    ALTER TABLE detected_habits
    ADD CONSTRAINT detected_habits_user_habit_unique
    UNIQUE (user_id, habit_type);
  END IF;
END $$;
