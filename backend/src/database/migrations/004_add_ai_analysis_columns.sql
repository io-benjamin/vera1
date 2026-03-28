-- Add missing columns to ai_insights for AIAnalysisService
-- Migration: 004_add_ai_analysis_columns

-- Add new columns to ai_insights table if they don't exist
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS analysis_date DATE;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS transaction_summary JSONB;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS claude_response JSONB;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS identified_patterns TEXT[];
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS personality_summary TEXT;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS damage_estimate DECIMAL(15, 2);

-- Set default for analysis_date from created_at for existing rows
UPDATE ai_insights SET analysis_date = created_at::date WHERE analysis_date IS NULL;

-- Create learned_patterns table for tracking patterns over time
CREATE TABLE IF NOT EXISTS learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pattern_key VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  first_detected DATE NOT NULL,
  last_detected DATE NOT NULL,
  occurrence_count INTEGER DEFAULT 1,
  estimated_monthly_cost DECIMAL(15, 2) DEFAULT 0,
  is_improving BOOLEAN,
  claude_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, pattern_key)
);

-- Create coaching_history table for tracking coaching effectiveness
CREATE TABLE IF NOT EXISTS coaching_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  insight_id UUID REFERENCES ai_insights(id) ON DELETE SET NULL,
  coaching_type VARCHAR(50) NOT NULL,
  message_given TEXT NOT NULL,
  actions_suggested JSONB,
  user_action VARCHAR(50),
  behavior_changed BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_insights_analysis_date ON ai_insights(analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_user_id ON learned_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_pattern_key ON learned_patterns(pattern_key);
CREATE INDEX IF NOT EXISTS idx_coaching_history_user_id ON coaching_history(user_id);
CREATE INDEX IF NOT EXISTS idx_coaching_history_insight_id ON coaching_history(insight_id);
