import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Clean merchant name to show only the business name
 */
function cleanMerchantName(name: string, merchantName?: string): string {
  let cleanName = merchantName || name || 'Unknown';

  const patternsToRemove = [
    /\s*#\d+/g,
    /\s*\d{5,}/g,
    /\s*\*+\d+/g,
    /\s+\d{2}\/\d{2}/g,
    /\s+[A-Z]{2}\s*$/,
    /\s+\d{5}(-\d{4})?$/,
    /\s*-\s*thank you/gi,
    /\s*thank you/gi,
    /\s*autopay(ment)?/gi,
    /\s*online payment/gi,
    /\s*mobile payment/gi,
    /\s*purchase/gi,
    /\s*pos\s*/gi,
    /\s*debit\s*/gi,
    /\s*checkcard\s*/gi,
    /\s*sq\s*\*/gi,
    /\s*tst\s*\*/gi,
    /\s*pp\s*\*/gi,
    /\s*amzn\s*/gi,
    /\s*mktp\s*/gi,
    /\s+in\s*$/i,
    /\s+ca\s*$/i,
    /\s+ny\s*$/i,
    /\s+tx\s*$/i,
    /\s+fl\s*$/i,
    /[^\w\s&'-]/g,
  ];

  for (const pattern of patternsToRemove) {
    cleanName = cleanName.replace(pattern, '');
  }

  cleanName = cleanName.replace(/\s+/g, ' ').trim();
  cleanName = cleanName
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const merchantMappings: Record<string, string> = {
    'amazon': 'Amazon',
    'amzn': 'Amazon',
    'uber': 'Uber',
    'uber eats': 'Uber Eats',
    'ubereats': 'Uber Eats',
    'doordash': 'DoorDash',
    'grubhub': 'Grubhub',
    'netflix': 'Netflix',
    'spotify': 'Spotify',
    'apple': 'Apple',
    'google': 'Google',
    'walmart': 'Walmart',
    'target': 'Target',
    'costco': 'Costco',
    'starbucks': 'Starbucks',
    'mcdonalds': "McDonald's",
    'mcdonald': "McDonald's",
    'chipotle': 'Chipotle',
    'venmo': 'Venmo',
    'zelle': 'Zelle',
    'cashapp': 'Cash App',
    'paypal': 'PayPal',
  };

  const lowerName = cleanName.toLowerCase();
  for (const [key, value] of Object.entries(merchantMappings)) {
    if (lowerName.includes(key)) {
      return value;
    }
  }

  return cleanName || 'Unknown';
}

/**
 * GET /api/accounts
 * Get all accounts for the authenticated user
 */
router.get('/', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await pool.query(
      `SELECT id, name, type, institution_name, balance, is_active, created_at,
              plaid_item_id, plaid_account_id, last_four
       FROM accounts
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [userId]
    );

    const accounts = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      institution_name: row.institution_name,
      balance: parseFloat(row.balance),
      is_active: row.is_active,
      plaid_item_id: row.plaid_item_id,
      last_four: row.last_four || '',
    }));

    res.json({ accounts });
  } catch (error) {
    console.error('Error getting accounts:', error);
    res.status(500).json({
      message: 'Failed to get accounts',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/accounts
 * Create a new account manually
 */
router.post('/', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { name, type, institution_name, balance } = req.body;

    if (!name || !type || !institution_name) {
      return res.status(400).json({
        message: 'name, type, and institution_name are required',
      });
    }

    const result = await pool.query(
      `INSERT INTO accounts (user_id, name, type, institution_name, balance)
       VALUES ($1, $2, $3::account_type, $4, $5)
       ON CONFLICT (user_id, name, institution_name)
       DO UPDATE SET balance = $5, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, name, type, institution_name, balance || 0]
    );

    res.json({
      message: 'Account created successfully',
      account: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({
      message: 'Failed to create account',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/accounts/:accountId
 * Update an account
 */
router.put('/:accountId', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { accountId } = req.params;
    const { name, type, institution_name, balance } = req.body;

    const result = await pool.query(
      `UPDATE accounts
       SET name = COALESCE($1, name),
           type = COALESCE($2::account_type, type),
           institution_name = COALESCE($3, institution_name),
           balance = COALESCE($4, balance),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name, type, institution_name, balance, accountId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Account not found',
      });
    }

    res.json({
      message: 'Account updated successfully',
      account: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({
      message: 'Failed to update account',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/accounts/:accountId
 * Delete an account
 */
router.delete('/:accountId', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { accountId } = req.params;

    const result = await pool.query(
      'DELETE FROM accounts WHERE id = $1 AND user_id = $2 RETURNING id',
      [accountId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Account not found',
      });
    }

    res.json({
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({
      message: 'Failed to delete account',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/accounts/:accountId/transactions
 * Get transactions for a specific account
 */
router.get('/:accountId/transactions', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { accountId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    // Verify ownership
    const accountResult = await pool.query(
      'SELECT id, name, type, institution_name, balance FROM accounts WHERE id = $1 AND user_id = $2',
      [accountId, userId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const account = accountResult.rows[0];

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM transactions WHERE account_id = $1',
      [accountId]
    );
    const total = parseInt(countResult.rows[0].count);

    // Get transactions
    const result = await pool.query(
      `SELECT id, account_id, amount, date, name, category, merchant_name, is_pending
       FROM transactions
       WHERE account_id = $1
       ORDER BY date DESC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [accountId, limit, offset]
    );

    const transactions = result.rows.map(row => ({
      id: row.id,
      account_id: row.account_id,
      amount: parseFloat(row.amount),
      date: row.date,
      name: cleanMerchantName(row.name, row.merchant_name),
      category: row.category,
      is_pending: row.is_pending,
    }));

    res.json({
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        institution_name: account.institution_name,
        balance: parseFloat(account.balance),
      },
      transactions,
      pagination: {
        total,
        page,
        limit,
        has_more: page * limit < total,
      },
    });
  } catch (error) {
    console.error('Error getting account transactions:', error);
    res.status(500).json({
      message: 'Failed to get transactions',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
