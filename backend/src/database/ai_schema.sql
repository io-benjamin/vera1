-- AI Learning System Schema
-- Run this after the main schema.sql

-- Store Claude's analysis history
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  analysis_date DATE NOT NULL,
  transaction_summary JSONB,        -- Aggregated data sent to Claude
  claude_response JSONB,            -- Full structured response
  identified_patterns TEXT[],       -- ["late-night-food-orders", "subscription-creep"]
  personality_summary TEXT,         -- Natural language personality description
  damage_estimate DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track patterns over time (Claude updates these)
CREATE TABLE IF NOT EXISTS learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pattern_key VARCHAR(100),         -- "weekend-splurge", "stress-shopping"
  description TEXT,
  first_detected DATE,
  last_detected DATE,
  occurrence_count INTEGER DEFAULT 1,
  estimated_monthly_cost DECIMAL(10,2),
  is_improving BOOLEAN,
  claude_notes TEXT,                -- AI's observations about this pattern
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, pattern_key)
);

-- Track coaching effectiveness
CREATE TABLE IF NOT EXISTS coaching_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  insight_id UUID REFERENCES ai_insights(id) ON DELETE SET NULL,
  coaching_type VARCHAR(50),        -- 'personality', 'leak', 'weekly'
  message_given TEXT,
  actions_suggested TEXT[],
  user_action VARCHAR(50),          -- 'followed', 'dismissed', 'partial', null
  behavior_changed BOOLEAN,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_ai_insights_user ON ai_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_date ON ai_insights(user_id, analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_user ON learned_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_coaching_history_user ON coaching_history(user_id);
