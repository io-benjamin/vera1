-- Migration 015: add missing composite unique constraint on accounts(user_id, plaid_account_id)
--
-- plaidService.ts uses ON CONFLICT (user_id, plaid_account_id) when upserting
-- accounts, but migration 003 only created a plain index on plaid_account_id alone.
-- Without this constraint Postgres raises:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"

-- Drop the old plain single-column index (superseded below)
DROP INDEX IF EXISTS idx_accounts_plaid_account_id;

-- Drop the partial index from a previous failed attempt if it exists
DROP INDEX IF EXISTS idx_accounts_user_plaid_account_id;

-- Full (non-partial) composite unique index.
-- ON CONFLICT (user_id, plaid_account_id) requires a plain unique index with
-- no WHERE clause. Postgres treats NULLs as distinct in unique indexes so
-- multiple rows with plaid_account_id = NULL are still permitted.
CREATE UNIQUE INDEX idx_accounts_user_plaid_account_id
  ON accounts(user_id, plaid_account_id);
