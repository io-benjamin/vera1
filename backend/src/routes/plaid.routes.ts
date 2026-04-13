import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  exchangeTokenSchema,
  syncAccountsSchema,
  syncTransactionsSchema,
} from '../validators/plaid.validators';
import {
  createLinkToken,
  exchangePublicToken,
  syncAccountsForItem,
  syncTransactions,
  removeItem,
} from '../services/plaidService';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
    }
  }
}

export function createPlaidRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * POST /api/plaid/webhook
   * Receives Plaid event notifications — NO auth middleware (Plaid calls this directly).
   * Triggers an immediate transaction sync for the affected item.
   *
   * Key events:
   *   TRANSACTIONS / SYNC_UPDATES_AVAILABLE → new transactions ready
   *   TRANSACTIONS / DEFAULT_UPDATE          → legacy, treat same way
   */
  router.post('/webhook', async (req: Request, res: Response) => {
    // Acknowledge immediately — Plaid will retry if we don't respond within 10s
    res.status(200).json({ received: true });

    const { webhook_type, webhook_code, item_id } = req.body;
    console.log(`Plaid webhook: ${webhook_type}/${webhook_code} for item ${item_id}`);

    const isTransactionEvent =
      webhook_type === 'TRANSACTIONS' &&
      (webhook_code === 'SYNC_UPDATES_AVAILABLE' || webhook_code === 'DEFAULT_UPDATE');

    if (!isTransactionEvent || !item_id) return;

    try {
      // Look up which user owns this item
      const itemResult = await pool.query(
        'SELECT user_id FROM plaid_items WHERE item_id = $1',
        [item_id]
      );
      if (itemResult.rows.length === 0) {
        console.warn(`Webhook: unknown item_id ${item_id}`);
        return;
      }

      const userId = itemResult.rows[0].user_id;
      console.log(`Auto-syncing transactions for user ${userId} item ${item_id}`);
      const count = await syncTransactions(pool, userId, item_id);
      console.log(`Webhook sync complete: ${count} transactions upserted`);
    } catch (err) {
      console.error('Webhook sync failed:', err);
    }
  });

  // Apply auth middleware to all remaining routes
  router.use(authMiddleware(pool));

  /**
   * POST /api/plaid/link-token
   * Create a link token for the Plaid Link flow
   */
  router.post('/link-token', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const linkToken = await createLinkToken(pool, userId);
      res.json({ linkToken });
    } catch (error: any) {
      console.error('Error creating link token:', error?.message ?? error);
      res.status(500).json({ error: error?.message ?? 'Failed to create link token' });
    }
  });

  /**
   * POST /api/plaid/exchange-token
   * Exchange public token for access token and save Plaid item
   */
  router.post('/exchange-token', validateBody(exchangeTokenSchema), async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { publicToken } = req.body;

      console.log('Exchanging public token for user:', userId);
      const result = await exchangePublicToken(pool, userId, publicToken);
      console.log('Exchange successful, itemId:', result.itemId);

      // Sync accounts
      console.log('Syncing accounts for item:', result.itemId);
      const accountCount = await syncAccountsForItem(pool, userId, result.itemId);
      console.log('Synced', accountCount, 'accounts');

      // Note: transactions are NOT synced here because Plaid returns PRODUCT_NOT_READY
      // immediately after linking. The user syncs manually after a short wait.
      res.json({ ...result, accountsSynced: accountCount, transactionsSynced: 0 });
    } catch (error: any) {
      const plaidError = error?.response?.data;
      console.error('Error exchanging token:', plaidError ?? error?.message ?? error);
      res.status(500).json({ error: plaidError?.error_message ?? 'Failed to exchange token' });
    }
  });

  /**
   * POST /api/plaid/sync-accounts
   * Sync accounts for all Plaid items (or a specific one if itemId provided)
   */
  router.post('/sync-accounts', validateBody(syncAccountsSchema), async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { itemId } = req.body;

      let totalSynced = 0;

      if (itemId) {
        // Sync specific item
        totalSynced = await syncAccountsForItem(pool, userId, itemId);
      } else {
        // Sync all items for user
        const itemsResult = await pool.query(
          'SELECT item_id FROM plaid_items WHERE user_id = $1',
          [userId]
        );

        for (const item of itemsResult.rows) {
          const count = await syncAccountsForItem(pool, userId, item.item_id);
          totalSynced += count;
        }
      }

      res.json({ accountsSynced: totalSynced });
    } catch (error) {
      console.error('Error syncing accounts:', error);
      res.status(500).json({ error: 'Failed to sync accounts' });
    }
  });

  /**
   * POST /api/plaid/sync-transactions
   * Sync transactions for all of a user's Plaid items
   */
  router.post('/sync-transactions', validateBody(syncTransactionsSchema), async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { force } = req.body;

      // Get all plaid items for user
      const itemsResult = await pool.query(
        'SELECT item_id FROM plaid_items WHERE user_id = $1',
        [userId]
      );

      // force=true resets the cursor so the next sync is a full re-fetch
      // This picks up pending transactions that may have been missed
      if (force) {
        await pool.query(
          'UPDATE plaid_items SET transactions_cursor = NULL WHERE user_id = $1',
          [userId]
        );
        console.log(`Force sync: cleared cursor for user ${userId}`);
      }

      let totalSynced = 0;
      for (const item of itemsResult.rows) {
        const count = await syncTransactions(pool, userId, item.item_id);
        totalSynced += count;
      }

      res.json({ transactionsSynced: totalSynced });
    } catch (error) {
      console.error('Error syncing transactions:', error);
      res.status(500).json({ error: 'Failed to sync transactions' });
    }
  });

  /**
   * DELETE /api/plaid/items/:itemId
   * Remove a Plaid item and associated data
   */
  router.delete('/items/:itemId', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { itemId } = req.params;

      await removeItem(pool, userId, itemId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing item:', error);
      res.status(500).json({ error: 'Failed to remove item' });
    }
  });

  return router;
}
