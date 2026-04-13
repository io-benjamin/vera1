import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';
import { Pool } from 'pg';
import { DataQualityService } from './dataQualityService';

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
    ...(process.env.PLAID_WEBHOOK_URL && { webhook: process.env.PLAID_WEBHOOK_URL }),
    ...(process.env.PLAID_REDIRECT_URI && { redirect_uri: process.env.PLAID_REDIRECT_URI }),
  };

  try {
    console.log('Creating link token with redirect_uri:', process.env.PLAID_REDIRECT_URI ?? '(none)');
    const response = await plaidClient.linkTokenCreate(request);
    return response.data.link_token;
  } catch (error: any) {
    const plaidError = error?.response?.data;
    console.error('Error creating link token:', plaidError ?? error);
    throw new Error(plaidError?.error_message ?? 'Failed to create link token');
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

    // Validate user exists before writing plaid item (avoids FK violation)
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new Error(`User not found: ${userId}. Create user before linking Plaid.`);
    }

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
): Promise<number> {
  const dqService = new DataQualityService(pool);

  try {
    const itemResult = await pool.query(
      'SELECT access_token, transactions_cursor FROM plaid_items WHERE item_id = $1 AND user_id = $2',
      [itemId, userId]
    );

    if (itemResult.rows.length === 0) {
      throw new Error('Plaid item not found');
    }

    const { access_token: accessToken, transactions_cursor: savedCursor } = itemResult.rows[0];

    // Get account mappings up front
    const accountsResult = await pool.query(
      'SELECT id, plaid_account_id FROM accounts WHERE plaid_item_id = $1',
      [itemId]
    );
    const accountMap = new Map(
      accountsResult.rows.map((row) => [row.plaid_account_id, row.id])
    );
    console.log(`Account map has ${accountMap.size} accounts for item ${itemId}`);

    let cursor: string | undefined = savedCursor ?? undefined;
    let added: any[] = [];
    let modified: any[] = [];
    let removed: any[] = [];
    let hasMore = true;

    // Paginate through all changes since last cursor
    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor,
        count: 500,
        options: { include_personal_finance_category: true },
      });

      added = added.concat(response.data.added);
      modified = modified.concat(response.data.modified);
      removed = removed.concat(response.data.removed);
      hasMore = response.data.has_more;
      cursor = response.data.next_cursor;

      console.log(
        `Sync page: +${response.data.added.length} added, ~${response.data.modified.length} modified, -${response.data.removed.length} removed, has_more=${response.data.has_more}`
      );
    }

    const pendingAdded = added.filter(tx => tx.pending);
    console.log(`Total: +${added.length} added (${pendingAdded.length} pending), ~${modified.length} modified, -${removed.length} removed`);
    if (pendingAdded.length > 0) {
      console.log('Pending transactions from Plaid:', JSON.stringify(pendingAdded.map(tx => ({
        id: tx.transaction_id,
        name: tx.name,
        amount: tx.amount,
        date: tx.date,
        account_id: tx.account_id,
      })), null, 2));
    } else {
      console.log('No pending transactions returned by Plaid for item', itemId);
    }

    let insertedCount = 0;
    let skippedNoAccount = 0;

    // Upsert added and modified transactions
    for (const tx of [...added, ...modified]) {
      const accountId = accountMap.get(tx.account_id);
      if (!accountId) {
        skippedNoAccount++;
        continue;
      }

      const rawCategory = mapCategory(tx.personal_finance_category?.primary || tx.category?.[0]);
      const category = rawCategory === 'OTHER'
        ? (inferCategoryFromMerchant(tx.merchant_name || tx.name) ?? 'OTHER')
        : rawCategory;

      const qualityScore = dqService.scoreSingleTransaction({
        is_pending: tx.pending,
        pending_captured_at: tx.pending ? new Date() : null, // will be set by SQL CASE below
      });

      try {
        await pool.query(
          `INSERT INTO transactions (account_id, plaid_transaction_id, amount, date, name, category, merchant_name, merchant_id, is_pending, pending_captured_at, data_quality_score)
           VALUES ($1, $2, $3, $4, $5, $6::transaction_category, $7, $8, $9, CASE WHEN $9 THEN CURRENT_TIMESTAMP ELSE NULL END, $10)
           ON CONFLICT (plaid_transaction_id) DO UPDATE SET
             amount = EXCLUDED.amount,
             date = EXCLUDED.date,
             name = EXCLUDED.name,
             category = EXCLUDED.category,
             merchant_name = EXCLUDED.merchant_name,
             is_pending = EXCLUDED.is_pending,
             data_quality_score = EXCLUDED.data_quality_score,
             updated_at = CURRENT_TIMESTAMP`,
          [
            accountId,
            tx.transaction_id,
            tx.amount,
            tx.date,
            tx.merchant_name || tx.name,
            category,
            tx.merchant_name || tx.name,
            tx.merchant_id,
            tx.pending,
            qualityScore,
          ]
        );
        insertedCount++;
      } catch (error: any) {
        if (error.message?.includes('invalid input value for enum')) {
          try {
            await pool.query(
              `INSERT INTO transactions (account_id, plaid_transaction_id, amount, date, name, category, merchant_name, merchant_id, is_pending, pending_captured_at, data_quality_score)
               VALUES ($1, $2, $3, $4, $5, 'OTHER'::transaction_category, $6, $7, $8, CASE WHEN $8 THEN CURRENT_TIMESTAMP ELSE NULL END, $9)
               ON CONFLICT (plaid_transaction_id) DO UPDATE SET
                 amount = EXCLUDED.amount,
                 date = EXCLUDED.date,
                 name = EXCLUDED.name,
                 merchant_name = EXCLUDED.merchant_name,
                 is_pending = EXCLUDED.is_pending,
                 data_quality_score = EXCLUDED.data_quality_score,
                 updated_at = CURRENT_TIMESTAMP`,
              [accountId, tx.transaction_id, tx.amount, tx.date, tx.merchant_name || tx.name, tx.merchant_name || tx.name, tx.merchant_id, tx.pending, qualityScore]
            );
            insertedCount++;
          } catch (retryError) {
            console.error(`Failed to insert transaction ${tx.transaction_id} even with fallback:`, retryError);
          }
        } else if (error.message?.includes('transactions_account_id_date_name_amount_key')) {
          // Duplicate natural key — same transaction appeared under a different Plaid ID (re-issued after
          // pending→posted transition). Safe to skip; the existing row is already correct.
        } else {
          console.error(`Error inserting transaction ${tx.transaction_id}:`, error.message);
        }
      }
    }

    // Delete removed transactions (pending transactions that were cancelled or superseded)
    for (const tx of removed) {
      await pool.query(
        'DELETE FROM transactions WHERE plaid_transaction_id = $1',
        [tx.transaction_id]
      );
    }

    console.log(`Sync complete: ${insertedCount} upserted, ${removed.length} removed, ${skippedNoAccount} skipped (no account match)`);

    // Save the new cursor and update last sync time
    await pool.query(
      'UPDATE plaid_items SET transactions_cursor = $1, last_synced_at = CURRENT_TIMESTAMP WHERE item_id = $2',
      [cursor, itemId]
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

/**
 * Infer a meaningful category from merchant name when Plaid returns OTHER.
 * Returns null if no match — caller keeps 'OTHER'.
 */
export function inferCategoryFromMerchant(merchantName: string | undefined): string | null {
  if (!merchantName) return null;
  const m = merchantName.toLowerCase();

  if (/starbucks|dunkin|tim hortons|peet|coffee|boba|tea house/.test(m)) return 'FOOD';
  if (/mcdonald|chick-fil|burger king|wendy|taco bell|chipotle|subway|domino|pizza|kfc|popeyes|shake shack|five guys|whataburger/.test(m)) return 'FOOD';
  if (/uber eats|doordash|grubhub|postmates|instacart|gopuff|caviar|seamless|door dash/.test(m)) return 'FOOD';
  if (/whole foods|trader joe|safeway|kroger|publix|aldi|sprouts|heb|wegmans|food lion|giant|stop.?shop|market basket/.test(m)) return 'FOOD';
  if (/lyft|uber(?! eats)|bird|lime|citibike|metro|transit|bart|mta|cta|caltra|amtrak|greyhound/.test(m)) return 'TRANSPORTATION';
  if (/netflix|hulu|disney\+|hbo|max|peacock|paramount|apple tv|youtube premium|crunchyroll|twitch/.test(m)) return 'ENTERTAINMENT';
  if (/spotify|apple music|tidal|pandora|soundcloud/.test(m)) return 'ENTERTAINMENT';
  if (/steam|playstation|xbox|nintendo|epic games|riot games|blizzard|ea games/.test(m)) return 'ENTERTAINMENT';
  if (/capcut|adobe|figma|canva|notion|sketch|invision|miro|loom|grammarly/.test(m)) return 'SHOPPING';
  if (/amazon|target|walmart|costco|best buy|home depot|lowes|ikea|wayfair|overstock/.test(m)) return 'SHOPPING';
  if (/zara|h&m|forever 21|gap|old navy|uniqlo|nordstrom|macy|tjmaxx|marshalls|ross/.test(m)) return 'SHOPPING';
  if (/cvs|walgreens|rite aid|duane reade|boots|vitamin shoppe/.test(m)) return 'HEALTHCARE';
  if (/planet fitness|equinox|la fitness|crunch|orange theory|anytime fitness|ymca/.test(m)) return 'HEALTHCARE';
  if (/at&t|verizon|t-mobile|sprint|comcast|xfinity|spectrum|cox|directv|dish/.test(m)) return 'BILLS';
  if (/electric|gas company|water utility|pg&e|con ed|duke energy/.test(m)) return 'BILLS';
  if (/airbnb|vrbo|marriott|hilton|hyatt|wyndham|holiday inn|expedia|hotels\.com|booking\.com/.test(m)) return 'TRAVEL';
  if (/venmo|zelle|cash ?app|paypal|wire transfer|bank transfer/.test(m)) return 'TRANSFER';

  return null;
}
