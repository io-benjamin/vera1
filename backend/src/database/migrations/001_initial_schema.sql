-- Initial schema migration
-- Creates all base tables if they don't exist

-- Create enums (IF NOT EXISTS not supported for types, so we use DO blocks)
DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT', 'INVESTMENT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_category AS ENUM (
    'FOOD', 'TRANSPORTATION', 'SHOPPING', 'ENTERTAINMENT',
    'BILLS', 'HEALTHCARE', 'TRAVEL', 'TRANSFER', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE personality_type AS ENUM (
    'DRIFTER', 'IMPULSE_BUYER', 'SUBSCRIPTION_ZOMBIE',
    'LIFESTYLE_CREEP', 'PROVIDER', 'OPTIMISTIC_OVERSPENDER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE leak_type AS ENUM (
    'DUPLICATE_SUBSCRIPTION', 'HIDDEN_ANNUAL_CHARGE', 'MERCHANT_INFLATION',
    'MICRO_DRAIN', 'FOOD_DELIVERY_DEPENDENCY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM (
    'OVERDRAFT_WARNING', 'SPENDING_PACE', 'PATTERN_RECOGNITION',
    'SUBSCRIPTION_ALERT', 'MERCHANT_PRICE', 'UNUSUAL_ACTIVITY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE statement_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
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

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
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

-- Statements table
CREATE TABLE IF NOT EXISTS statements (
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

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
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
  UNIQUE(account_id, date, name, amount)
);

-- Spending summaries
CREATE TABLE IF NOT EXISTS spending_summaries (
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

-- Spending personalities
CREATE TABLE IF NOT EXISTS spending_personalities (
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

-- Detected leaks
CREATE TABLE IF NOT EXISTS detected_leaks (
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

-- Emotional spending events
CREATE TABLE IF NOT EXISTS emotional_spending_events (
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
CREATE TABLE IF NOT EXISTS spending_alerts (
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

-- Weekly check-ins
CREATE TABLE IF NOT EXISTS weekly_checkins (
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

-- Family connections
CREATE TABLE IF NOT EXISTS family_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  connected_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  relationship VARCHAR(50) NOT NULL,
  can_view_transactions BOOLEAN DEFAULT true,
  can_manage_subscriptions BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(primary_user_id, connected_user_id)
);

-- Create indexes (IF NOT EXISTS supported in PostgreSQL 9.5+)
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_statements_user_id ON statements(user_id);
CREATE INDEX IF NOT EXISTS idx_statements_account_id ON statements(account_id);
CREATE INDEX IF NOT EXISTS idx_statements_status ON statements(status);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_statement_id ON transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_spending_summaries_user_id ON spending_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_spending_personalities_user_id ON spending_personalities(user_id);
CREATE INDEX IF NOT EXISTS idx_detected_leaks_user_id ON detected_leaks(user_id);
CREATE INDEX IF NOT EXISTS idx_detected_leaks_is_resolved ON detected_leaks(is_resolved);
CREATE INDEX IF NOT EXISTS idx_emotional_spending_events_user_id ON emotional_spending_events(user_id);
CREATE INDEX IF NOT EXISTS idx_spending_alerts_user_id ON spending_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_user_id ON weekly_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_family_connections_primary_user_id ON family_connections(primary_user_id);
