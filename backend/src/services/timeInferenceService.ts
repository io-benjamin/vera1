import { Pool } from 'pg';
import { Transaction, TimeOfDay } from '../models/types';
import { resolveTransactionTime, hourToTimeOfDay } from './timeResolver';

// Minimum weight required to assign an inferred time
const MIN_INFERENCE_WEIGHT = 0.3;
// Weight decays by this amount per transaction of distance from a known anchor
const WEIGHT_DECAY_PER_STEP = 0.25;
// Maximum neighbor distance to consider for inference
const MAX_SEARCH_DISTANCE = 5;

interface InferenceResult {
  transaction_id: string;
  inferred_time_of_day: TimeOfDay;
  weight: number; // 0–1, represents confidence of this inference
}

/**
 * TimeInferenceService
 *
 * Infers time-of-day for transactions that have no direct time signal
 * by looking at neighbouring transactions with known times.
 *
 * The farther the anchor, the lower the confidence weight.
 * Only inferences above MIN_INFERENCE_WEIGHT are written.
 */
export class TimeInferenceService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Infer time-of-day for all transactions of a user that currently
   * have no time signal. Writes inferred_time_of_day back to the DB.
   *
   * Call this after syncing new transactions.
   */
  async inferForUser(userId: string): Promise<number> {
    const rows = await this.pool.query(
      `SELECT t.id, t.date, t.is_pending, t.pending_captured_at,
              t.user_time_of_day, t.inferred_time_of_day,
              t.time_source, t.time_confidence, t.first_seen_at
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1
       ORDER BY t.date DESC, t.id`,
      [userId]
    );

    const txs: Transaction[] = rows.rows.map(mapRow);

    const results = this.inferBatch(txs);

    let updated = 0;
    for (const r of results) {
      await this.pool.query(
        `UPDATE transactions
         SET inferred_time_of_day = $1
         WHERE id = $2 AND inferred_time_of_day IS NULL`,
        [r.inferred_time_of_day, r.transaction_id]
      );
      updated++;
    }

    return updated;
  }

  /**
   * Infer time-of-day for a single transaction given a pre-loaded
   * sorted array of that user's transactions (most-recent first).
   *
   * Returns null if no suitable anchor is nearby.
   */
  inferSingle(
    target: Transaction,
    sortedTxs: Transaction[]
  ): InferenceResult | null {
    // Skip if target already has a time signal
    if (resolveTransactionTime(target) !== null) return null;

    const idx = sortedTxs.findIndex((t) => t.id === target.id);
    if (idx === -1) return null;

    // Collect anchor candidates before and after the target
    const anchors: { time_of_day: TimeOfDay; distance: number }[] = [];

    for (let d = 1; d <= MAX_SEARCH_DISTANCE; d++) {
      // Look before (earlier index = more recent)
      if (idx - d >= 0) {
        const before = sortedTxs[idx - d];
        const resolved = resolveTransactionTime(before);
        if (resolved && resolved.source !== 'inferred') {
          anchors.push({ time_of_day: resolved.time_of_day, distance: d });
          break; // take the nearest anchor only
        }
      }
    }

    for (let d = 1; d <= MAX_SEARCH_DISTANCE; d++) {
      // Look after (higher index = older)
      if (idx + d < sortedTxs.length) {
        const after = sortedTxs[idx + d];
        const resolved = resolveTransactionTime(after);
        if (resolved && resolved.source !== 'inferred') {
          anchors.push({ time_of_day: resolved.time_of_day, distance: d });
          break;
        }
      }
    }

    if (anchors.length === 0) return null;

    // Weight each anchor by distance decay
    const weighted = anchors.map((a) => ({
      time_of_day: a.time_of_day,
      weight: Math.max(0, 1 - a.distance * WEIGHT_DECAY_PER_STEP),
    }));

    // Pick the anchor with the highest weight
    const best = weighted.reduce((a, b) => (a.weight >= b.weight ? a : b));

    if (best.weight < MIN_INFERENCE_WEIGHT) return null;

    return {
      transaction_id: target.id,
      inferred_time_of_day: best.time_of_day,
      weight: best.weight,
    };
  }

  /**
   * Run batch inference across a sorted transaction list.
   * Returns one result per transaction that can be inferred.
   */
  inferBatch(sortedTxs: Transaction[]): InferenceResult[] {
    const results: InferenceResult[] = [];

    for (const tx of sortedTxs) {
      // Skip if already has a reliable time signal
      if (resolveTransactionTime(tx) !== null) continue;

      const result = this.inferSingle(tx, sortedTxs);
      if (result) results.push(result);
    }

    return results;
  }

  /**
   * After a user answers 1–2 transactions in a cluster, infer time-of-day
   * for all remaining un-timed members of the same cluster.
   *
   * Uses the user-provided time(s) as anchors and propagates the majority
   * time to all cluster members that still have no signal.
   * Never overwrites user-provided time.
   *
   * @param clusterTransactionIds All transaction IDs in the cluster
   *   (including the just-answered anchor)
   * @returns Number of transactions updated
   */
  async inferClusterTimes(clusterTransactionIds: string[]): Promise<number> {
    if (clusterTransactionIds.length === 0) return 0;

    // Fetch all cluster members (including anchors that were just answered)
    const result = await this.pool.query(
      `SELECT id, account_id, amount, date, name, is_pending,
              pending_captured_at, user_time_of_day, inferred_time_of_day,
              time_source, time_confidence, first_seen_at
       FROM transactions
       WHERE id = ANY($1)
       ORDER BY date DESC`,
      [clusterTransactionIds]
    );

    const txs: Transaction[] = result.rows.map(mapRow);

    // Collect all user-provided anchor times
    const anchors = txs.filter(
      (tx) => tx.user_time_of_day !== null && tx.user_time_of_day !== undefined
    );

    if (anchors.length === 0) return 0;

    // Majority vote: pick the most common anchor time
    // If there's a conflict (e.g. morning vs evening), majority wins.
    // Single anchor → it wins by default.
    const tally = new Map<TimeOfDay, number>();
    for (const a of anchors) {
      const t = a.user_time_of_day!;
      tally.set(t, (tally.get(t) ?? 0) + 1);
    }
    const dominantTime = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // Targets: truly un-timed (no user or inferred or pending signal)
    const targets = txs.filter(
      (tx) =>
        tx.user_time_of_day === null &&
        tx.inferred_time_of_day === null &&
        !tx.pending_captured_at
    );

    if (targets.length === 0) return 0;

    // Batch update
    const targetIds = targets.map((tx) => tx.id);
    await this.pool.query(
      `UPDATE transactions
       SET inferred_time_of_day = $1,
           time_source          = 'inferred',
           time_confidence      = 'low'
       WHERE id = ANY($2)
         AND user_time_of_day IS NULL`,
      [dominantTime, targetIds]
    );

    return targets.length;
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function mapRow(row: any): Transaction {
  return {
    id: row.id,
    account_id: row.account_id ?? '',
    amount: parseFloat(row.amount) || 0,
    date: row.date,
    name: row.name ?? '',
    is_pending: row.is_pending,
    pending_captured_at: row.pending_captured_at ?? null,
    user_time_of_day: row.user_time_of_day ?? null,
    inferred_time_of_day: row.inferred_time_of_day ?? null,
    time_source: row.time_source ?? null,
    time_confidence: row.time_confidence ?? null,
    first_seen_at: row.first_seen_at ?? null,
  };
}
