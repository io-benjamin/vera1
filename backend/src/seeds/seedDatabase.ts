import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { generateMockAccounts, generateMockTransactions } from './mockData';

/**
 * Seed the database with mock data for testing/development
 * Usage: npx ts-node src/seeds/seedDatabase.ts
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seedDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create test user with Teller enrollment
    const userId = randomUUID();
    await client.query(
      `INSERT INTO users (id, email, password_hash, teller_access_token, teller_enrollment_id, teller_institution_id, teller_institution_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        'demo@vera.com',
        '$2b$10$mockhashedpassword', // Mock password hash
        'mock_access_token_' + randomUUID(),
        'enrollment_mock_123',
        'ins_110000',
        'Chase Bank',
      ]
    );
    console.log('✓ Created test user:', userId);

    // Create mock accounts
    const mockAccounts = generateMockAccounts(userId);
    const accountIds: string[] = [];

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
      accountIds.push(accountId);
      console.log(`✓ Created account: ${account.name}`);
    }

    // Create mock transactions
    for (const accountId of accountIds) {
      const mockTransactions = generateMockTransactions(accountId, 60);

      for (const tx of mockTransactions) {
        await client.query(
          `INSERT INTO transactions (
            id, account_id, teller_transaction_id, amount, date, name,
            category, merchant_name, is_pending
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            randomUUID(),
            accountId,
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

      console.log(`✓ Created 80 mock transactions for account ${accountId}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Database seeded successfully!');
    console.log(`\nTest user email: demo@vera.com`);
    console.log(`User ID: ${userId}`);
    console.log(`\nYou can now login and see mock accounts and transactions.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedDatabase();
