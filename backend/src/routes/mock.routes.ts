import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { generateMockAccounts, generateMockTransactions } from '../seeds/mockData';

const router = Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * POST /api/mock/seed
 * Seed the database with mock data (development only)
 */
router.post('/seed', async (req: Request, res: Response) => {
  // Safety check - only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      message: 'Mock data seeding is disabled in production',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create test user with Teller enrollment
    const userId = randomUUID();
    const userEmail = `demo-${Date.now()}@vera.com`;
    await client.query(
      `INSERT INTO users (id, email, password_hash, teller_access_token, teller_enrollment_id, teller_institution_id, teller_institution_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        userEmail,
        '$2b$10$mockhashedpassword', // Mock password hash
        'mock_access_token_' + randomUUID(),
        'enrollment_mock_' + randomUUID().slice(0, 8),
        'ins_110000',
        'Chase Bank',
      ]
    );

    // Create mock accounts
    const mockAccounts = generateMockAccounts(userId);
    const accounts = [];

    for (const account of mockAccounts) {
      const accountId = randomUUID();
      await client.query(
        `INSERT INTO accounts (
          id, user_id, teller_account_id, name, type,
          institution_name, balance, last_synced_at, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          accountId,
          userId,
          account.teller_account_id,
          account.name,
          account.type,
          account.institution_name,
          account.balance,
          new Date(),
          true,
        ]
      );
      accounts.push({
        id: accountId,
        ...account,
      });
    }

    // Create mock transactions
    let transactionCount = 0;
    for (const account of accounts) {
      const mockTransactions = generateMockTransactions(account.id, 60);

      for (const tx of mockTransactions) {
        await client.query(
          `INSERT INTO transactions (
            id, account_id, teller_transaction_id, amount, date, name,
            category, merchant_name, is_pending
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            randomUUID(),
            account.id,
            tx.teller_transaction_id,
            tx.amount,
            tx.date,
            tx.name,
            tx.category,
            tx.merchant_name,
            tx.is_pending,
          ]
        );
      }
      transactionCount += mockTransactions.length;
    }

    await client.query('COMMIT');

    res.json({
      message: 'Mock data seeded successfully',
      user_id: userId,
      email: userEmail,
      accounts_created: accounts.length,
      transactions_created: transactionCount,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding mock data:', error);
    res.status(500).json({
      message: 'Failed to seed mock data',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/mock/clear
 * Clear all mock data (development only)
 */
router.post('/clear', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      message: 'Mock data clearing is disabled in production',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete in correct order to respect foreign keys
    await client.query('TRUNCATE TABLE spending_summaries CASCADE');
    await client.query('TRUNCATE TABLE transactions CASCADE');
    await client.query('TRUNCATE TABLE accounts CASCADE');
    await client.query('TRUNCATE TABLE users CASCADE');

    await client.query('COMMIT');

    res.json({ message: 'All data cleared successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error clearing data:', error);
    res.status(500).json({
      message: 'Failed to clear data',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    client.release();
  }
});

export default router;
