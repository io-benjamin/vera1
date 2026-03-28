-- Insight Learnings
-- Stores what the AI has learned about a user from combining
-- transaction patterns + reflection responses over time.
-- This is distinct from raw ai_insights — it represents durable behavioral understanding.

CREATE TABLE insight_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  pattern_id UUID REFERENCES detected_habits(id) ON DELETE SET NULL,
  insight_summary TEXT NOT NULL,        -- one-sentence summary of what was learned
  learned_behavior TEXT NOT NULL,       -- the specific behavioral tendency identified
  confidence DECIMAL(4, 2) NOT NULL,    -- 0.00 to 1.00
  source_reflection_ids UUID[] DEFAULT '{}', -- which user_responses contributed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_insight_learnings_user_id ON insight_learnings(user_id);
CREATE INDEX idx_insight_learnings_pattern_id ON insight_learnings(pattern_id);
CREATE INDEX idx_insight_learnings_confidence ON insight_learnings(user_id, confidence DESC);
