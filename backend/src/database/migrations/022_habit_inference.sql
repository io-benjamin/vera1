-- Migration 022: behavior inference enhancements
-- Adds is_emerging flag and sequence_context to detected_habits

ALTER TABLE detected_habits
  ADD COLUMN IF NOT EXISTS is_emerging BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sequence_context JSONB;

-- New habit type enum values for sequence patterns
DO $$ BEGIN
  ALTER TYPE habit_type ADD VALUE IF NOT EXISTS 'SEQUENCE_PATTERN';
EXCEPTION WHEN others THEN NULL;
END $$;
