import { Pool } from 'pg';
import { NarrativeUnit } from '../models/types';

/**
 * Composes a behavioral narrative timeline for a user.
 *
 * All data is fetched in 4 batch queries — no per-row DB calls:
 *   1. Recent transactions (last 50, joined to accounts)
 *   2. Detected habits (with sample_transactions, trend, confidence)
 *   3. Answered reflections for those patterns
 *   4. Pending reflection questions for those patterns
 *
 * Context signals and continuity are computed in-process from the batch data.
 */
export class NarrativeTimelineService {
  constructor(private pool: Pool) {}

  async buildTimeline(userId: string, limit = 50): Promise<NarrativeUnit[]> {
    // ── 1. Transactions ────────────────────────────────────────────────────────
    const txResult = await this.pool.query(
      `SELECT t.id, TO_CHAR(t.date, 'YYYY-MM-DD') as date,
              t.amount, t.name, t.merchant_name, t.category,
              t.user_time_of_day, t.inferred_time_of_day, t.time_source,
              t.pending_captured_at
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    const transactions = txResult.rows;
    if (transactions.length === 0) return [];

    // ── 2. Habits ──────────────────────────────────────────────────────────────
    const habitResult = await this.pool.query(
      `SELECT id, habit_type, title, trend, data_quality_score,
              trigger_conditions, sample_transactions, first_detected,
              monthly_impact
       FROM detected_habits
       WHERE user_id = $1`,
      [userId]
    );
    const habits = habitResult.rows.map((h) => ({
      ...h,
      monthly_impact: parseFloat(h.monthly_impact) || 0,
      data_quality_score: parseFloat(h.data_quality_score) || 0,
      sample_transactions: h.sample_transactions || [],
      trigger_conditions: h.trigger_conditions || {},
    }));

    // Build tx_id → habit map from sample_transactions
    const txToHabit = new Map<string, typeof habits[0]>();
    for (const habit of habits) {
      for (const s of habit.sample_transactions) {
        txToHabit.set(s.transaction_id, habit);
      }
    }

    // ── 3. Answered reflections ────────────────────────────────────────────────
    const patternIds = habits.map((h) => h.id);
    const answeredMap = new Map<string, { answer: string; question: string }>();
    const pendingMap = new Map<string, { id: string; question: string }>();

    if (patternIds.length > 0) {
      const answeredResult = await this.pool.query(
        `SELECT pattern_id, answer, question
         FROM user_responses
         WHERE user_id = $1
           AND pattern_id = ANY($2)
           AND answered_at IS NOT NULL
         ORDER BY answered_at DESC`,
        [userId, patternIds]
      );
      for (const row of answeredResult.rows) {
        if (!answeredMap.has(row.pattern_id)) {
          answeredMap.set(row.pattern_id, { answer: row.answer, question: row.question });
        }
      }

      // ── 4. Pending reflection questions ───────────────────────────────────────
      const pendingResult = await this.pool.query(
        `SELECT pattern_id, id, question
         FROM user_responses
         WHERE user_id = $1
           AND pattern_id = ANY($2)
           AND answered_at IS NULL
         ORDER BY created_at ASC`,
        [userId, patternIds]
      );
      for (const row of pendingResult.rows) {
        if (!pendingMap.has(row.pattern_id)) {
          pendingMap.set(row.pattern_id, { id: row.id, question: row.question });
        }
      }
    }

    // ── Context helpers ────────────────────────────────────────────────────────

    // Merchant visit counts per 7-day window, and per-merchant avg amount
    const merchantCounts7d = new Map<string, number>();
    const merchantAmounts = new Map<string, number[]>();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const tx of transactions) {
      const key = this.normalizeMerchant(tx.merchant_name || tx.name);
      const txDate = new Date(tx.date + 'T00:00:00');
      if (txDate >= sevenDaysAgo) {
        merchantCounts7d.set(key, (merchantCounts7d.get(key) || 0) + 1);
      }
      if (!merchantAmounts.has(key)) merchantAmounts.set(key, []);
      merchantAmounts.get(key)!.push(Math.abs(parseFloat(tx.amount)));
    }

    // ── Continuity tracking ────────────────────────────────────────────────────
    // Walk transactions in chronological order to detect pattern runs
    const chronological = [...transactions].reverse();
    const lastPatternId = new Map<string, string>(); // habit_id → prev tx id
    const continuityMap = new Map<string, 'continuing' | 'new'>();

    for (const tx of chronological) {
      const habit = txToHabit.get(tx.id);
      if (!habit) continue;
      const prev = lastPatternId.get(habit.id);
      continuityMap.set(tx.id, prev ? 'continuing' : 'new');
      lastPatternId.set(habit.id, tx.id);
    }

    // ── Compose units ──────────────────────────────────────────────────────────
    const units: NarrativeUnit[] = [];

    for (const tx of transactions) {
      const habit = txToHabit.get(tx.id);
      const merchantKey = this.normalizeMerchant(tx.merchant_name || tx.name);
      const displayName = tx.merchant_name || tx.name;
      const rawAmount = parseFloat(tx.amount);
      const amount = Math.abs(rawAmount);
      const isCredit = rawAmount < 0;

      // ── Pattern ──────────────────────────────────────────────────────────────
      let pattern: NarrativeUnit['pattern'] | undefined;
      if (habit) {
        const score = habit.data_quality_score;
        const confidence: 'low' | 'medium' | 'high' =
          score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';
        const firstDetected = new Date(habit.first_detected);
        const isNew = (now.getTime() - firstDetected.getTime()) < 7 * 24 * 60 * 60 * 1000;
        const state: NonNullable<NarrativeUnit['pattern']>['state'] =
          isNew ? 'New'
          : habit.trend === 'increasing' ? 'Increasing'
          : habit.trend === 'stable' ? 'Stable'
          : 'Active';
        const trend = (habit.trend as NonNullable<NarrativeUnit['pattern']>['trend']) || 'stable';

        pattern = { id: habit.id, title: habit.title, trend, state, confidence };
      }

      // ── Context ───────────────────────────────────────────────────────────────
      let context: NarrativeUnit['context'] | undefined;
      const signals: string[] = [];
      const count7d = merchantCounts7d.get(merchantKey) || 0;
      const allAmounts = merchantAmounts.get(merchantKey) || [];
      const avgAmount = allAmounts.length > 0
        ? allAmounts.reduce((a, b) => a + b, 0) / allAmounts.length
        : 0;

      const patternLabel = habit
        ? habit.title.toLowerCase().replace(/recurring\s+/i, '').replace(/\s+(payments|habit|spending)$/i, '')
        : null;

      if (count7d >= 2) {
        const noun = patternLabel ?? 'purchase';
        const ordinal = this.ordinal(count7d);
        signals.push(`${ordinal} ${noun} this week`);
      }

      if (avgAmount > 0 && amount > avgAmount * 1.25) {
        const diff = ((amount - avgAmount) / avgAmount * 100).toFixed(0);
        signals.push(`${diff}% above your usual amount`);
      } else if (avgAmount > 0 && amount < avgAmount * 0.75) {
        signals.push('lower than usual');
      }

      const continuityType = continuityMap.get(tx.id);
      if (continuityType === 'continuing' && signals.length === 0) {
        signals.push('continuing recent pattern');
      }

      if (signals.length > 0) {
        context = {
          summary: signals[0],
          signals,
        };
      }

      // ── Continuity ────────────────────────────────────────────────────────────
      let continuity: NarrativeUnit['continuity'] | undefined;
      if (habit && continuityType) {
        continuity = { type: continuityType };
      }

      // ── Time context ──────────────────────────────────────────────────────────
      let time_context: NarrativeUnit['time_context'] | undefined;
      const timeLabel = tx.user_time_of_day || tx.inferred_time_of_day;
      const timeSource: 'user' | 'pending' | 'inferred' =
        tx.time_source === 'user' ? 'user'
        : tx.pending_captured_at ? 'pending'
        : 'inferred';

      if (timeLabel && ['morning', 'midday', 'evening', 'night'].includes(timeLabel)) {
        time_context = {
          label: timeLabel as NonNullable<NarrativeUnit['time_context']>['label'],
          source: timeSource,
        };
      }

      // ── Reflection ────────────────────────────────────────────────────────────
      let reflection: NarrativeUnit['reflection'] | undefined;
      if (habit) {
        const answered = answeredMap.get(habit.id);
        const pending = pendingMap.get(habit.id);

        if (answered) {
          reflection = {
            status: 'answered',
            answer: answered.answer,
            question: answered.question,
            source_pattern_id: habit.id,
          };
        } else if (pending) {
          // Only gate on medium/high confidence — don't spam low-confidence patterns
          const score = habit.data_quality_score;
          const confidence = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';
          if (confidence !== 'low') {
            // Only show prompt on top-3 transactions by amount for this pattern
            const patternAmounts = habit.sample_transactions
              .map((s: any) => Math.abs(s.amount))
              .sort((a: number, b: number) => b - a)
              .slice(0, 3);
            const threshold = patternAmounts.length > 0 ? patternAmounts[patternAmounts.length - 1] : 0;

            if (amount >= threshold) {
              reflection = {
                status: 'ask',
                question: pending.question,
                source_pattern_id: habit.id,
              };
            } else {
              reflection = { status: 'none', source_pattern_id: habit.id };
            }
          } else {
            reflection = { status: 'none', source_pattern_id: habit.id };
          }
        } else {
          reflection = { status: 'none', source_pattern_id: habit.id };
        }
      }

      units.push({
        id: tx.id,
        date: String(tx.date).split('T')[0],
        transaction: {
          id: tx.id,
          merchant: displayName,
          amount,
          isCredit,
          category: tx.category || '',
        },
        pattern,
        context,
        continuity,
        time_context,
        reflection,
      });
    }

    return units;
  }

  private normalizeMerchant(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+(#\d+|store|inc\.?|llc\.?|co\.?)$/i, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }

  private ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
}
