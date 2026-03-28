import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';
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

  // Apply auth middleware to all routes
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
    } catch (error) {
      console.error('Error creating link token:', error);
      res.status(500).json({ error: 'Failed to create link token' });
    }
  });

  /**
   * POST /api/plaid/exchange-token
   * Exchange public token for access token and save Plaid item
   */
  router.post('/exchange-token', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { publicToken } = req.body;
      if (!publicToken) {
        return res.status(400).json({ error: 'Public token required' });
      }

      console.log('Exchanging public token for user:', userId);
      const result = await exchangePublicToken(pool, userId, publicToken);
      console.log('Exchange successful, itemId:', result.itemId);

      // Automatically sync accounts after exchange
      console.log('Syncing accounts for item:', result.itemId);
      const accountCount = await syncAccountsForItem(pool, userId, result.itemId);
      console.log('Synced', accountCount, 'accounts');

      res.json({ ...result, accountsSynced: accountCount });
    } catch (error) {
      console.error('Error exchanging token:', error);
      res.status(500).json({ error: 'Failed to exchange token' });
    }
  });

  /**
   * POST /api/plaid/sync-accounts
   * Sync accounts for all Plaid items (or a specific one if itemId provided)
   */
  router.post('/sync-accounts', async (req: Request, res: Response) => {
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
  router.post('/sync-transactions', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { days = 30 } = req.body;

      // Get all plaid items for user
      const itemsResult = await pool.query(
        'SELECT item_id FROM plaid_items WHERE user_id = $1',
        [userId]
      );

      let totalSynced = 0;
      for (const item of itemsResult.rows) {
        const count = await syncTransactions(pool, userId, item.item_id, days);
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
