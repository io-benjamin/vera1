import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';
import { Pool } from 'pg';

// Initialize Plaid client
const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

/**
 * Create a Plaid Link token for the frontend
 */
export async function createLinkToken(pool: Pool, userId: string): Promise<string> {
  const request: any = {
    user: {
      client_user_id: userId,
    },
    client_name: 'vera',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
    webhook: process.env.PLAID_WEBHOOK_URL,
  };

  try {
    const response = await plaidClient.linkTokenCreate(request);
    return response.data.link_token;
  } catch (error) {
    console.error('Error creating link token:', error);
    throw error;
  }
}

/**
 * Exchange public token for access token
 */
export async function exchangePublicToken(
  pool: Pool,
  userId: string,
  publicToken: string
): Promise<{ itemId: string; accessToken: string }> {
  try {
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const itemId = response.data.item_id;
    const accessToken = response.data.access_token;

    // For now, use a generic institution name
    // The actual institution info can be fetched from accounts
    const institutionName = 'Bank Account';
    const institutionId = 'unknown';

    // Save to database
    await pool.query(
      `INSERT INTO plaid_items (item_id, user_id, access_token, institution_id, institution_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, item_id) DO UPDATE SET
         access_token = $3,
         updated_at = CURRENT_TIMESTAMP`,
      [itemId, userId, accessToken, institutionId, institutionName]
    );

    return { itemId, accessToken };
  } catch (error) {
    console.error('Error exchanging public token:', error);
    throw error;
  }
}

/**
 * Get and sync accounts from Plaid for an item
 */
export async function syncAccountsForItem(
  pool: Pool,
  userId: string,
  itemId: string
): Promise<number> {
  try {
    // Get access token
    const itemResult = await pool.query(
      'SELECT access_token, institution_name FROM plaid_items WHERE item_id = $1 AND user_id = $2',
      [itemId, userId]
    );

    if (itemResult.rows.length === 0) {
      throw new Error('Plaid item not found');
    }

    const { access_token: accessToken, institution_name: institutionName } = itemResult.rows[0];

    // Fetch accounts from Plaid
    const response = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const plaidAccounts = response.data.accounts;
    let syncedCount = 0;

    for (const plaidAccount of plaidAccounts) {
      const accountType = mapAccountType(plaidAccount.type, plaidAccount.subtype || null);

      // Upsert account
      await pool.query(
        `INSERT INTO accounts (user_id, plaid_account_id, plaid_item_id, name, type, subtype, institution_name, balance, last_four, last_synced_at)
         VALUES ($1, $2, $3, $4, $5::account_type, $6, $7, $8, $9, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, plaid_account_id) DO UPDATE SET
           balance = $8,
           last_synced_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          plaidAccount.account_id,
          itemId,
          plaidAccount.name,
          accountType,
          plaidAccount.subtype,
          institutionName,
          plaidAccount.balances.current || 0,
          plaidAccount.mask,
        ]
      );
      syncedCount++;
    }

    return syncedCount;
  } catch (error) {
    console.error('Error syncing accounts:', error);
    throw error;
  }
}

/**
 * Sync transactions for all accounts in an item
 */
export async function syncTransactions(
  pool: Pool,
  userId: string,
  itemId: string,
  days: number = 30
): Promise<number> {
  try {
    // Get access token
    const itemResult = await pool.query(
      'SELECT access_token FROM plaid_items WHERE item_id = $1 AND user_id = $2',
      [itemId, userId]
    );

    if (itemResult.rows.length === 0) {
      throw new Error('Plaid item not found');
    }

    const accessToken = itemResult.rows[0].access_token;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    const request = {
      access_token: accessToken,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      options: {
        count: 500,
        offset: 0,
      },
    };

    let allTransactions: any[] = [];
    let totalTransactions = 0;
    let hasMore = true;

    // Paginate through all transactions
    while (hasMore) {
      const response = await plaidClient.transactionsGet(request);
      const transactions = response.data.transactions;
      allTransactions = allTransactions.concat(transactions);
      totalTransactions = response.data.total_transactions;

      if (allTransactions.length >= totalTransactions) {
        hasMore = false;
      } else {
        request.options!.offset = allTransactions.length;
      }
    }

    // Get account mappings
    const accountsResult = await pool.query(
      'SELECT id, plaid_account_id FROM accounts WHERE plaid_item_id = $1',
      [itemId]
    );
    const accountMap = new Map(
      accountsResult.rows.map((row) => [row.plaid_account_id, row.id])
    );

    // Insert transactions
    let insertedCount = 0;
    for (const tx of allTransactions) {
      const accountId = accountMap.get(tx.account_id);
      if (!accountId) continue;

      try {
        await pool.query(
          `INSERT INTO transactions (account_id, plaid_transaction_id, amount, date, name, category, merchant_name, merchant_id, is_pending)
           VALUES ($1, $2, $3, $4, $5, $6::transaction_category, $7, $8, $9)
           ON CONFLICT (plaid_transaction_id) DO UPDATE SET
             amount = $3,
             is_pending = $9,
             updated_at = CURRENT_TIMESTAMP`,
          [
            accountId,
            tx.transaction_id,
            Math.abs(tx.amount), // Use absolute value
            tx.date,
            tx.merchant_name || tx.name,
            mapCategory(tx.personal_finance_category?.primary || tx.category?.[0]),
            tx.merchant_name || tx.name,
            tx.merchant_id,
            tx.pending,
          ]
        );
        insertedCount++;
      } catch (error) {
        console.error('Error inserting transaction:', error);
      }
    }

    // Update last sync time
    await pool.query(
      'UPDATE plaid_items SET last_synced_at = CURRENT_TIMESTAMP WHERE item_id = $1',
      [itemId]
    );

    return insertedCount;
  } catch (error) {
    console.error('Error syncing transactions:', error);
    throw error;
  }
}

/**
 * Remove a Plaid item
 */
export async function removeItem(pool: Pool, userId: string, itemId: string): Promise<void> {
  try {
    // Get access token to remove from Plaid
    const result = await pool.query(
      'SELECT access_token FROM plaid_items WHERE item_id = $1 AND user_id = $2',
      [itemId, userId]
    );

    if (result.rows.length > 0) {
      try {
        // Remove item from Plaid
        await plaidClient.itemRemove({
          access_token: result.rows[0].access_token,
        });
      } catch (error) {
        console.error('Error removing item from Plaid:', error);
      }
    }

    // Delete from our database (cascades to accounts and transactions)
    await pool.query(
      'DELETE FROM plaid_items WHERE item_id = $1 AND user_id = $2',
      [itemId, userId]
    );
  } catch (error) {
    console.error('Error removing item:', error);
    throw error;
  }
}

/**
 * Map Plaid account type to our account type
 */
function mapAccountType(type: string, subtype: string | null): string {
  if (type === 'depository') {
    if (subtype === 'checking') return 'CHECKING';
    if (subtype === 'savings') return 'SAVINGS';
    return 'CHECKING';
  }
  if (type === 'credit') return 'CREDIT';
  if (type === 'investment') return 'INVESTMENT';
  return 'OTHER';
}

/**
 * Map Plaid category to our transaction category
 */
function mapCategory(plaidCategory: string | undefined): string {
  if (!plaidCategory) return 'OTHER';

  const categoryMap: Record<string, string> = {
    'FOOD_AND_DRINK': 'FOOD',
    'TRANSPORTATION': 'TRANSPORTATION',
    'TRAVEL': 'TRAVEL',
    'SHOPPING': 'SHOPPING',
    'ENTERTAINMENT': 'ENTERTAINMENT',
    'MEDICAL': 'HEALTHCARE',
    'HEALTHCARE': 'HEALTHCARE',
    'RENT_AND_UTILITIES': 'BILLS',
    'UTILITIES': 'BILLS',
    'TRANSFER': 'TRANSFER',
    'PAYMENT': 'TRANSFER',
    // Legacy category mappings
    'Food and Drink': 'FOOD',
    'Travel': 'TRAVEL',
    'Shops': 'SHOPPING',
    'Recreation': 'ENTERTAINMENT',
    'Healthcare': 'HEALTHCARE',
    'Service': 'BILLS',
    'Transfer': 'TRANSFER',
    'Payment': 'TRANSFER',
  };

  return categoryMap[plaidCategory] || 'OTHER';
}
