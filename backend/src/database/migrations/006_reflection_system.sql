-- Reflection System
-- Stores reflection questions asked to users and their answers,
-- linked to detected patterns and optionally specific transactions.

CREATE TYPE response_type AS ENUM ('free_text', 'multiple_choice');

CREATE TABLE user_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  pattern_id UUID REFERENCES detected_habits(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT,
  response_type response_type NOT NULL DEFAULT 'free_text',
  options JSONB, -- populated for multiple_choice questions
  answered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_responses_user_id ON user_responses(user_id);
CREATE INDEX idx_user_responses_pattern_id ON user_responses(pattern_id);
CREATE INDEX idx_user_responses_answered ON user_responses(user_id, answered_at) WHERE answered_at IS NOT NULL;
CREATE INDEX idx_user_responses_pending ON user_responses(user_id, created_at) WHERE answered_at IS NULL;
