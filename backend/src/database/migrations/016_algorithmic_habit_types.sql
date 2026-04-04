-- Migration 016: add algorithmic pattern habit types to the habit_type enum
ALTER TYPE habit_type ADD VALUE IF NOT EXISTS 'RECURRING_SPEND';
ALTER TYPE habit_type ADD VALUE IF NOT EXISTS 'MERCHANT_DEPENDENCY';
ALTER TYPE habit_type ADD VALUE IF NOT EXISTS 'ESCALATING_SPEND';
