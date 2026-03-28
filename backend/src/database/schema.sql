-- Enums
CREATE TYPE account_type AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT', 'INVESTMENT', 'OTHER');
CREATE TYPE transaction_category AS ENUM (
  'FOOD', 'TRANSPORTATION', 'SHOPPING', 'ENTERTAINMENT',
  'BILLS', 'HEALTHCARE', 'TRAVEL', 'TRANSFER', 'OTHER'
);
CREATE TYPE personality_type AS ENUM (
  'DRIFTER', 'IMPULSE_BUYER', 'SUBSCRIPTION_ZOMBIE',
  'LIFESTYLE_CREEP', 'PROVIDER', 'OPTIMISTIC_OVERSPENDER'
);
CREATE TYPE leak_type AS ENUM (
  'DUPLICATE_SUBSCRIPTION', 'HIDDEN_ANNUAL_CHARGE', 'MERCHANT_INFLATION',
  'MICRO_DRAIN', 'FOOD_DELIVERY_DEPENDENCY'
);
CREATE TYPE alert_type AS ENUM (
  'OVERDRAFT_WARNING', 'SPENDING_PACE', 'PATTERN_RECOGNITION',
  'SUBSCRIPTION_ALERT', 'MERCHANT_PRICE', 'UNUSUAL_ACTIVITY'
);
CREATE TYPE statement_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE habit_type AS ENUM (
  'LATE_NIGHT_SPENDING', 'WEEKEND_SPLURGE', 'WEEKLY_RITUAL', 'IMPULSE_PURCHASE',
  'POST_PAYDAY_SURGE', 'COMFORT_SPENDING', 'RECURRING_INDULGENCE',
  'BINGE_SHOPPING', 'MEAL_DELIVERY_HABIT', 'CAFFEINE_RITUAL'
);
CREATE TYPE habit_frequency AS ENUM ('daily', 'weekly', 'monthly', 'occasional');
CREATE TYPE habit_trend AS ENUM ('increasing', 'stable', 'decreasing');

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  preferred_language VARCHAR(10) DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Accounts table (user-managed, statement-based)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type account_type NOT NULL,
  institution_name VARCHAR(255) NOT NULL,
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  last_four VARCHAR(4),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, name, institution_name)
);

-- Uploaded statements
CREATE TABLE statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER NOT NULL,
  statement_date DATE,
  period_start DATE,
  period_end DATE,
  status statement_status DEFAULT 'PENDING',
  error_message TEXT,
  transactions_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Transactions table (parsed from statements)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  statement_id UUID REFERENCES statements(id) ON DELETE SET NULL,
  amount DECIMAL(15, 2) NOT NULL,
  date DATE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category transaction_category,
  merchant_name VARCHAR(255),
  is_pending BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  -- Prevent duplicate transactions (same account, date, name, amount)
  UNIQUE(account_id, date, name, amount)
);

-- Spending summaries (cached weekly checkups)
CREATE TABLE spending_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  total_spent DECIMAL(15, 2) NOT NULL,
  transaction_count INTEGER NOT NULL,
  category_breakdown JSONB NOT NULL,
  insights JSONB NOT NULL,
  comparison_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, week_start_date, week_end_date)
);

-- Spending personalities (behavior analysis)
CREATE TABLE spending_personalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  primary_type personality_type NOT NULL,
  secondary_type personality_type,
  confidence_score DECIMAL(5, 2) NOT NULL,
  damage_score DECIMAL(15, 2) NOT NULL,
  analysis_period_start DATE NOT NULL,
  analysis_period_end DATE NOT NULL,
  behavior_patterns JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Detected leaks (money drains)
CREATE TABLE detected_leaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  leak_type leak_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  monthly_cost DECIMAL(15, 2) NOT NULL,
  annual_cost DECIMAL(15, 2) NOT NULL,
  merchant_names TEXT[],
  transaction_ids UUID[],
  is_resolved BOOLEAN DEFAULT false,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Detected spending habits
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

-- AI-generated insights
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

-- Emotional spending events
CREATE TABLE emotional_spending_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  time_of_day TIME NOT NULL,
  day_of_week INTEGER NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  merchant_name VARCHAR(255),
  category transaction_category,
  emotional_trigger VARCHAR(100),
  is_unusual BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Spending alerts
CREATE TABLE spending_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  alert_type alert_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL,
  action_items JSONB,
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Weekly check-ins (coaching messages)
CREATE TABLE weekly_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  what_went_wrong TEXT NOT NULL,
  patterns_identified TEXT NOT NULL,
  solutions JSONB NOT NULL,
  motivation TEXT NOT NULL,
  was_viewed BOOLEAN DEFAULT false,
  viewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, week_start_date, week_end_date)
);

-- Family connections (parent/family mode)
CREATE TABLE family_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  connected_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  relationship VARCHAR(50) NOT NULL,
  can_view_transactions BOOLEAN DEFAULT true,
  can_manage_subscriptions BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(primary_user_id, connected_user_id)
);

-- Indexes for better query performance
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_statements_user_id ON statements(user_id);
CREATE INDEX idx_statements_account_id ON statements(account_id);
CREATE INDEX idx_statements_status ON statements(status);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_statement_id ON transactions(statement_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_spending_summaries_user_id ON spending_summaries(user_id);
CREATE INDEX idx_spending_summaries_week_dates ON spending_summaries(week_start_date, week_end_date);
CREATE INDEX idx_spending_personalities_user_id ON spending_personalities(user_id);
CREATE INDEX idx_detected_leaks_user_id ON detected_leaks(user_id);
CREATE INDEX idx_detected_leaks_is_resolved ON detected_leaks(is_resolved);
CREATE INDEX idx_emotional_spending_events_user_id ON emotional_spending_events(user_id);
CREATE INDEX idx_emotional_spending_events_date ON emotional_spending_events(event_date);
CREATE INDEX idx_spending_alerts_user_id ON spending_alerts(user_id);
CREATE INDEX idx_spending_alerts_is_read ON spending_alerts(is_read);
CREATE INDEX idx_weekly_checkins_user_id ON weekly_checkins(user_id);
CREATE INDEX idx_family_connections_primary_user_id ON family_connections(primary_user_id);
CREATE INDEX idx_family_connections_connected_user_id ON family_connections(connected_user_id);
CREATE INDEX idx_detected_habits_user_id ON detected_habits(user_id);
CREATE INDEX idx_detected_habits_habit_type ON detected_habits(habit_type);
CREATE INDEX idx_detected_habits_is_acknowledged ON detected_habits(is_acknowledged);
CREATE INDEX idx_ai_insights_user_id ON ai_insights(user_id);
CREATE INDEX idx_ai_insights_is_read ON ai_insights(is_read);
