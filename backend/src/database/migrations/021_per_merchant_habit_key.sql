-- Migration 021: allow multiple detected_habits rows per habit_type
-- by adding a pattern_key discriminator (e.g. slugified merchant name).
-- Merchant-specific types (RECURRING_SPEND, MERCHANT_DEPENDENCY, WEEKLY_RITUAL,
-- FOOD_DELIVERY_DEPENDENCY) can have one row per merchant; all others keep the
-- empty-string key so their existing uniqueness is preserved.

-- 1. Add the column (default '' so existing rows get a valid key immediately)
ALTER TABLE detected_habits
  ADD COLUMN IF NOT EXISTS pattern_key VARCHAR(255) NOT NULL DEFAULT '';

-- 2. Drop the old single-column unique constraint
ALTER TABLE detected_habits
  DROP CONSTRAINT IF EXISTS detected_habits_user_habit_unique;

-- 3. Add the new composite unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'detected_habits_user_habit_key_unique'
  ) THEN
    ALTER TABLE detected_habits
    ADD CONSTRAINT detected_habits_user_habit_key_unique
    UNIQUE (user_id, habit_type, pattern_key);
  END IF;
END $$;
