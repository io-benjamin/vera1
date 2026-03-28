-- Plaid Integration Migration
-- Adds plaid_items table and updates existing tables for Plaid integration

-- Create plaid_items table to store Plaid connections
CREATE TABLE IF NOT EXISTS plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(255) NOT NULL UNIQUE,
  access_token VARCHAR(255) NOT NULL,
  institution_id VARCHAR(255),
  institution_name VARCHAR(255),
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_id)
);

-- Create indexes for plaid_items
CREATE INDEX idx_plaid_items_user_id ON plaid_items(user_id);
CREATE INDEX idx_plaid_items_item_id ON plaid_items(item_id);

-- Update accounts table to include Plaid fields
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS plaid_account_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS plaid_item_id VARCHAR(255) REFERENCES plaid_items(item_id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS subtype VARCHAR(50),
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

-- Create indexes for accounts Plaid fields
CREATE INDEX IF NOT EXISTS idx_accounts_plaid_account_id ON accounts(plaid_account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_plaid_item_id ON accounts(plaid_item_id);

-- Update transactions table to use plaid_transaction_id instead of statement_id
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS plaid_transaction_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS merchant_id VARCHAR(255);

-- Create index for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_plaid_transaction_id ON transactions(plaid_transaction_id);

-- Note: The following changes would require data migration if you have existing data:
-- - Removal of statements table (not done automatically to preserve data)
-- - Removal of statement_id from transactions
-- If you want to clean up old statements data, run:
-- DROP TABLE IF EXISTS statements CASCADE;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS statement_id;
