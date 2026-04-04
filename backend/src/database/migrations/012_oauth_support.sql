-- Migration 012: OAuth support via WorkOS
-- Makes password_hash nullable (OAuth users have no password)
-- Adds workos_user_id for upsert lookups

ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS workos_user_id TEXT UNIQUE;
