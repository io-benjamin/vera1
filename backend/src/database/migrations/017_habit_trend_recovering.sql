-- Migration 017: add 'recovering' value to habit_trend enum
ALTER TYPE habit_trend ADD VALUE IF NOT EXISTS 'recovering';
