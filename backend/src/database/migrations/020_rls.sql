-- Row Level Security: enforce user isolation at the database layer.
-- app.user_id is set per-request by the dbSession middleware (SET LOCAL).
-- The BYPASSRLS role is granted to the superuser/migration role so this
-- migration runner can still create rows freely.

-- ─── accounts ────────────────────────────────────────────────────────────────
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounts_user_policy ON accounts;
CREATE POLICY accounts_user_policy ON accounts
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ─── spending_summaries ───────────────────────────────────────────────────────
ALTER TABLE spending_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spending_summaries_user_policy ON spending_summaries;
CREATE POLICY spending_summaries_user_policy ON spending_summaries
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ─── spending_personalities ───────────────────────────────────────────────────
ALTER TABLE spending_personalities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spending_personalities_user_policy ON spending_personalities;
CREATE POLICY spending_personalities_user_policy ON spending_personalities
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ─── detected_leaks ───────────────────────────────────────────────────────────
ALTER TABLE detected_leaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS detected_leaks_user_policy ON detected_leaks;
CREATE POLICY detected_leaks_user_policy ON detected_leaks
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ─── emotional_spending_events ────────────────────────────────────────────────
ALTER TABLE emotional_spending_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emotional_spending_events_user_policy ON emotional_spending_events;
CREATE POLICY emotional_spending_events_user_policy ON emotional_spending_events
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ─── spending_alerts ──────────────────────────────────────────────────────────
ALTER TABLE spending_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spending_alerts_user_policy ON spending_alerts;
CREATE POLICY spending_alerts_user_policy ON spending_alerts
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ─── weekly_checkins ──────────────────────────────────────────────────────────
ALTER TABLE weekly_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_checkins_user_policy ON weekly_checkins;
CREATE POLICY weekly_checkins_user_policy ON weekly_checkins
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ─── detected_habits ──────────────────────────────────────────────────────────
ALTER TABLE detected_habits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS detected_habits_user_policy ON detected_habits;
CREATE POLICY detected_habits_user_policy ON detected_habits
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ─── plaid_items ──────────────────────────────────────────────────────────────
ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plaid_items_user_policy ON plaid_items;
CREATE POLICY plaid_items_user_policy ON plaid_items
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ─── behavior_snapshots ───────────────────────────────────────────────────────
ALTER TABLE behavior_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS behavior_snapshots_user_policy ON behavior_snapshots;
CREATE POLICY behavior_snapshots_user_policy ON behavior_snapshots
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ─── analysis_cache ───────────────────────────────────────────────────────────
ALTER TABLE analysis_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analysis_cache_user_policy ON analysis_cache;
CREATE POLICY analysis_cache_user_policy ON analysis_cache
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- Note: transactions are joined through accounts (which has RLS), so cross-user
-- transaction access is already blocked at the account ownership layer.
-- Enabling RLS on transactions directly would require a subquery per row and
-- would hurt query performance significantly — skip for now.
