-- Add habit detection tables
-- Migration: 002_add_habits_tables

-- Create habit-related enums
DO $$ BEGIN
  CREATE TYPE habit_type AS ENUM (
    'LATE_NIGHT_SPENDING', 'WEEKEND_SPLURGE', 'WEEKLY_RITUAL', 'IMPULSE_PURCHASE',
    'POST_PAYDAY_SURGE', 'COMFORT_SPENDING', 'RECURRING_INDULGENCE',
    'BINGE_SHOPPING', 'MEAL_DELIVERY_HABIT', 'CAFFEINE_RITUAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE habit_frequency AS ENUM ('daily', 'weekly', 'monthly', 'occasional');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE habit_trend AS ENUM ('increasing', 'stable', 'decreasing');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drop existing tables if they have wrong structure (development only)
DROP TABLE IF EXISTS ai_insights CASCADE;
DROP TABLE IF EXISTS detected_habits CASCADE;

-- Detected spending habits table
CREATE TABLE detected_habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  habit_type habit_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  frequency habit_frequency NOT NULL,
  monthly_impact DECIMAL(15, 2) NOT NULL,
  annual_impact DECIMAL(15, 2) NOT NULL,
  occurrence_count INTEGER NOT NULL,
  avg_amount DECIMAL(15, 2) NOT NULL,
  trigger_conditions JSONB NOT NULL DEFAULT '{}',
  sample_transactions JSONB NOT NULL DEFAULT '[]',
  first_detected TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_occurrence TIMESTAMP WITH TIME ZONE,
  trend habit_trend,
  is_acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- AI-generated insights table
CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  insight_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  psychological_trigger TEXT,
  recommended_action TEXT,
  potential_savings DECIMAL(15, 2),
  confidence_score DECIMAL(5, 2),
  related_habits UUID[],
  is_read BOOLEAN DEFAULT false,
  is_helpful BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_detected_habits_user_id ON detected_habits(user_id);
CREATE INDEX idx_detected_habits_habit_type ON detected_habits(habit_type);
CREATE INDEX idx_detected_habits_is_acknowledged ON detected_habits(is_acknowledged);
CREATE INDEX idx_detected_habits_monthly_impact ON detected_habits(monthly_impact DESC);
CREATE INDEX idx_ai_insights_user_id ON ai_insights(user_id);
CREATE INDEX idx_ai_insights_is_read ON ai_insights(is_read);
CREATE INDEX idx_ai_insights_created_at ON ai_insights(created_at DESC);
