import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';
import {
  getTransactionsMissingTime,
  selectTransactionsForPrompt,
  TransactionCluster,
} from '../services/timeClusterService';
import { TimeInferenceService } from '../services/timeInferenceService';

const VALID_TIMES = ['morning', 'midday', 'evening', 'night'] as const;

export function createTimePromptsRoutes(pool: Pool): Router {
  const router = Router();
  const inferenceService = new TimeInferenceService(pool);

  /**
   * GET /api/time-prompts/pending
   *
   * Returns up to 2 transaction prompts for the authenticated user.
   * Selects representative transactions from clusters of un-timed transactions,
   * stores the full cluster membership in time_prompt_targets for downstream
   * inference, and avoids re-surfacing already-prompted transactions.
   *
   * Response shape:
   *   { prompts: PromptItem[], total: number }
   */
  router.get(
    '/pending',
    authMiddleware(pool),
    async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;

        // IDs already prompted or answered — skip these
        const seenResult = await pool.query(
          `SELECT transaction_id
           FROM time_prompt_targets
           WHERE user_id = $1 AND (prompted = true OR answered = true)`,
          [userId]
        );
        const skipIds = new Set<string>(
          seenResult.rows.map((r: any) => r.transaction_id)
        );

        const clusters = await getTransactionsMissingTime(pool, userId);

        const prompts: {
          transaction_id: string;
          cluster_id: string;
          merchant: string;
          amount: number;
          date: string;
        }[] = [];

        for (const cluster of clusters) {
          if (prompts.length >= 2) break;

          // Store ALL cluster members in time_prompt_targets (prompted = false)
          // so we can fetch them during inference without re-running cluster detection.
          for (const tx of cluster.transactions) {
            await pool.query(
              `INSERT INTO time_prompt_targets
                 (user_id, transaction_id, cluster_id, prompted)
               VALUES ($1, $2, $3, false)
               ON CONFLICT (user_id, transaction_id) DO NOTHING`,
              [userId, tx.id, cluster.cluster_id]
            );
          }

          // Select 1–2 representative transactions for prompting
          const selected = selectTransactionsForPrompt(cluster).filter(
            (tx) => !skipIds.has(tx.id)
          );

          for (const tx of selected) {
            if (prompts.length >= 2) break;

            // Mark selected transactions as prompted
            await pool.query(
              `UPDATE time_prompt_targets
               SET prompted = true
               WHERE user_id = $1 AND transaction_id = $2`,
              [userId, tx.id]
            );

            prompts.push({
              transaction_id: tx.id,
              cluster_id: cluster.cluster_id,
              merchant: tx.merchant_name || tx.name,
              amount: Math.abs(tx.amount),
              date: String(tx.date).split('T')[0],
            });
          }
        }

        res.json({ prompts, total: prompts.length });
      } catch (error) {
        console.error('[time-prompts] GET /pending error:', error);
        res.status(500).json({ message: 'Failed to fetch time prompts' });
      }
    }
  );

  /**
   * POST /api/time-prompts/:transactionId/answer
   *
   * Records user's time-of-day for a prompted transaction, then triggers
   * cluster inference to fill in the remaining un-timed members.
   *
   * Body: { time_of_day: 'morning' | 'midday' | 'evening' | 'night' }
   *
   * Response: { success: true, inferred: number }
   */
  router.post(
    '/:transactionId/answer',
    authMiddleware(pool),
    async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        const { transactionId } = req.params;
        const { time_of_day } = req.body;

        if (!time_of_day || !(VALID_TIMES as readonly string[]).includes(time_of_day)) {
          return res.status(400).json({
            message: 'time_of_day must be morning, midday, evening, or night',
          });
        }

        // Verify the transaction belongs to this user
        const ownerCheck = await pool.query(
          `SELECT t.id
           FROM transactions t
           JOIN accounts a ON t.account_id = a.id
           WHERE t.id = $1 AND a.user_id = $2`,
          [transactionId, userId]
        );
        if (ownerCheck.rows.length === 0) {
          return res.status(404).json({ message: 'Transaction not found' });
        }

        // Write the user-provided time (only if no prior user answer)
        await pool.query(
          `UPDATE transactions
           SET user_time_of_day = $1,
               time_source      = 'user',
               time_confidence  = 'high'
           WHERE id = $2
             AND user_time_of_day IS NULL`,
          [time_of_day, transactionId]
        );

        // Mark this target as answered and retrieve cluster_id
        const targetResult = await pool.query(
          `UPDATE time_prompt_targets
           SET answered = true
           WHERE user_id = $1 AND transaction_id = $2
           RETURNING cluster_id`,
          [userId, transactionId]
        );

        const clusterId: string | null =
          targetResult.rows[0]?.cluster_id ?? null;

        // ── Cluster inference ────────────────────────────────────────────────
        // Fetch all cluster member IDs from time_prompt_targets.
        // These were stored when the pending endpoint was first called.
        let inferred = 0;

        if (clusterId) {
          const memberResult = await pool.query(
            `SELECT transaction_id
             FROM time_prompt_targets
             WHERE user_id = $1 AND cluster_id = $2`,
            [userId, clusterId]
          );

          const memberIds: string[] = [
            transactionId, // ensure the anchor is included
            ...memberResult.rows.map((r: any) => r.transaction_id),
          ];

          // Deduplicate
          const uniqueIds = [...new Set(memberIds)];
          inferred = await inferenceService.inferClusterTimes(uniqueIds);
        }

        res.json({ success: true, inferred });
      } catch (error) {
        console.error('[time-prompts] POST answer error:', error);
        res.status(500).json({ message: 'Failed to record answer' });
      }
    }
  );

  return router;
}
