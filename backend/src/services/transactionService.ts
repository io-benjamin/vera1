import { Pool } from 'pg';
import {
  Transaction,
  TransactionDetail,
  TransactionEvidence,
  TransactionCategory,
} from '../models/types';

/**
 * TransactionService provides utilities for fetching transactions
 *
 * Used by:
 * - LeakDetectionService (to get evidence transactions for leaks)
 * - PersonalityAnalysisService (to get transactions that drove personality classification)
 */
export class TransactionService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get transactions by IDs array
   */
  async getTransactionsByIds(transactionIds: string[], limit?: number): Promise<Transaction[]> {
    if (transactionIds.length === 0) return [];

    const query = `
      SELECT id, account_id, amount, date,
             name, category, merchant_name, is_pending
      FROM transactions
      WHERE id = ANY($1)
      ORDER BY date DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const result = await this.pool.query(query, [transactionIds]);
    return result.rows.map(this.mapTransaction);
  }

  /**
   * Get transactions by IDs with full account details (for drill-down views)
   */
  async getTransactionDetailsById(
    transactionIds: string[],
    page: number = 1,
    limit: number = 20
  ): Promise<{ transactions: TransactionDetail[]; total: number }> {
    if (transactionIds.length === 0) {
      return { transactions: [], total: 0 };
    }

    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await this.pool.query(
      'SELECT COUNT(*) FROM transactions WHERE id = ANY($1)',
      [transactionIds]
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated transactions with account info
    const query = `
      SELECT t.*, a.name as account_name, a.institution_name
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ANY($1)
      ORDER BY t.date DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.pool.query(query, [transactionIds, limit, offset]);

    const transactions = result.rows.map((row) => ({
      ...this.mapTransaction(row),
      account_name: row.account_name,
      institution_name: row.institution_name,
    }));

    return { transactions, total };
  }

  /**
   * Convert transactions to lightweight evidence format
   */
  toEvidenceFormat(transactions: Transaction[], limit: number = 5): TransactionEvidence[] {
    return transactions.slice(0, limit).map((t) => ({
      transaction_id: t.id,
      date: t.date,
      amount: t.amount,
      merchant_name: t.merchant_name || null,
      category: t.category || null,
    }));
  }

  /**
   * Get transactions for a user by pattern matching
   * Used for personality evidence detection
   */
  async getTransactionsByPattern(
    userId: string,
    options: {
      startDate: Date;
      endDate: Date;
      merchantPatterns?: string[];
      categories?: TransactionCategory[];
      minAmount?: number;
      maxAmount?: number;
    }
  ): Promise<Transaction[]> {
    let query = `
      SELECT t.*
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.user_id = $1
        AND t.date >= $2
        AND t.date <= $3
        AND t.is_pending = false
    `;
    const params: (string | number | Date | TransactionCategory[])[] = [
      userId,
      options.startDate,
      options.endDate,
    ];
    let paramIndex = 4;

    if (options.merchantPatterns && options.merchantPatterns.length > 0) {
      const patterns = options.merchantPatterns.map((p) => `%${p.toLowerCase()}%`);
      query += ` AND (${patterns.map((_, i) => `LOWER(t.merchant_name) LIKE $${paramIndex + i}`).join(' OR ')})`;
      params.push(...patterns);
      paramIndex += patterns.length;
    }

    if (options.categories && options.categories.length > 0) {
      query += ` AND t.category = ANY($${paramIndex})`;
      params.push(options.categories);
      paramIndex++;
    }

    if (options.minAmount !== undefined) {
      query += ` AND t.amount >= $${paramIndex}`;
      params.push(options.minAmount);
      paramIndex++;
    }

    if (options.maxAmount !== undefined) {
      query += ` AND t.amount <= $${paramIndex}`;
      params.push(options.maxAmount);
      paramIndex++;
    }

    query += ' ORDER BY t.date DESC';

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapTransaction);
  }

  /**
   * Get user transactions within a date range
   */
  async getUserTransactions(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Transaction[]> {
    const result = await this.pool.query(
      `SELECT t.*
       FROM transactions t
       INNER JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1
         AND t.date >= $2
         AND t.date <= $3
         AND t.is_pending = false
         AND t.amount > 0
       ORDER BY t.date DESC`,
      [userId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    return result.rows.map(this.mapTransaction);
  }

  /**
   * Map database row to Transaction
   */
  private mapTransaction(row: any): Transaction {
    return {
      id: row.id,
      account_id: row.account_id,
      statement_id: row.statement_id,
      amount: parseFloat(row.amount),
      date: row.date,
      name: row.name,
      category: row.category,
      merchant_name: row.merchant_name,
      is_pending: row.is_pending,
    };
  }
}
