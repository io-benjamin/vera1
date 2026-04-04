-- Add cursor for Plaid /transactions/sync endpoint.
-- The cursor tracks where we left off so each sync only fetches new/changed/removed transactions.
-- NULL means we've never synced this item with the sync endpoint yet (will do a full initial sync).

ALTER TABLE plaid_items
ADD COLUMN IF NOT EXISTS transactions_cursor TEXT;
