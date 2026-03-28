import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { generateWeeklyCheckup, getCurrentWeekDates } from '../services/spendingAnalysisService';
import { authMiddleware } from '../middleware/auth';
import { Transaction } from '../models/types';

const router = Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * GET /api/spending/weekly-checkup
 * Get weekly spending checkup for the authenticated user
 */
router.get('/weekly-checkup', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await pool.query(
      `SELECT t.id, t.account_id, t.amount, t.date,
              t.name, t.category, t.merchant_name, t.is_pending
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1
       ORDER BY t.date DESC`,
      [userId]
    );

    const transactions: Transaction[] = result.rows.map(row => ({
      id: row.id,
      account_id: row.account_id,
      amount: parseFloat(row.amount),
      date: row.date,
      name: row.name,
      category: row.category,
      merchant_name: row.merchant_name,
      is_pending: row.is_pending,
    }));

    if (transactions.length === 0) {
      return res.status(404).json({ message: 'No spending data available' });
    }

    const { start, end } = getCurrentWeekDates();

    const prevWeekStart = new Date(start);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(end);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);

    const previousWeekTransactions = transactions.filter((tx) => {
      const txDate = new Date(tx.date);
      return txDate >= prevWeekStart && txDate <= prevWeekEnd;
    });

    const checkup = generateWeeklyCheckup(
      transactions,
      start,
      end,
      previousWeekTransactions.length > 0 ? previousWeekTransactions : undefined
    );

    res.json({ checkup });
  } catch (error) {
    console.error('Error getting weekly checkup:', error);
    res.status(500).json({
      message: 'Failed to get weekly checkup',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/spending/category/:category
 * Return all transactions filtered by category for the authenticated user
 */
router.get('/category/:category', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const categoryParam = (req.params.category || '').toUpperCase();

    const result = await pool.query(
      `SELECT t.id, t.account_id, t.amount, t.date,
              t.name, t.category, t.merchant_name, t.is_pending
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1 AND ($2::text IS NULL OR t.category = $2::transaction_category)
       ORDER BY t.date DESC`,
      [userId, categoryParam || null]
    );

    const transactions: Transaction[] = result.rows.map((row) => ({
      id: row.id,
      account_id: row.account_id,
      amount: parseFloat(row.amount),
      date: row.date,
      name: row.name,
      category: row.category,
      merchant_name: row.merchant_name,
      is_pending: row.is_pending,
    }));

    res.json({ transactions });
  } catch (error) {
    console.error('Error getting category transactions:', error);
    res.status(500).json({
      message: 'Failed to get category transactions',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/spending/category-summary
 * Get transaction counts and totals by category for current and previous month
 */
router.get('/category-summary', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const currentMonthResult = await pool.query(
      `SELECT
        t.category,
        COUNT(*)::int as transaction_count,
        SUM(ABS(t.amount))::numeric as total_spent
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1
         AND t.date >= $2
         AND t.date <= $3
         AND t.amount > 0
         AND t.category IS NOT NULL
       GROUP BY t.category
       ORDER BY transaction_count DESC`,
      [userId, currentMonthStart.toISOString(), currentMonthEnd.toISOString()]
    );

    const prevMonthResult = await pool.query(
      `SELECT
        t.category,
        COUNT(*)::int as transaction_count,
        SUM(ABS(t.amount))::numeric as total_spent
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1
         AND t.date >= $2
         AND t.date <= $3
         AND t.amount > 0
         AND t.category IS NOT NULL
       GROUP BY t.category`,
      [userId, prevMonthStart.toISOString(), prevMonthEnd.toISOString()]
    );

    const prevMonthMap = new Map<string, { count: number; total: number }>();
    prevMonthResult.rows.forEach((row) => {
      prevMonthMap.set(row.category, {
        count: row.transaction_count,
        total: parseFloat(row.total_spent),
      });
    });

    const categories = currentMonthResult.rows.map((row) => {
      const currentCount = row.transaction_count;
      const currentTotal = parseFloat(row.total_spent);
      const avgPerTransaction = currentCount > 0 ? currentTotal / currentCount : 0;

      return {
        category: row.category,
        transaction_count: currentCount,
        total_spent: Math.round(currentTotal * 100) / 100,
        avg_per_transaction: Math.round(avgPerTransaction * 100) / 100,
      };
    });

    const changes = currentMonthResult.rows.map((row) => {
      const prevData = prevMonthMap.get(row.category);
      const currentCount = row.transaction_count;
      const prevCount = prevData?.count || 0;
      const countChange = currentCount - prevCount;
      const countChangePercent = prevCount > 0
        ? Math.round((countChange / prevCount) * 100)
        : (currentCount > 0 ? 100 : 0);

      return {
        category: row.category,
        count_change: countChange,
        count_change_percent: countChangePercent,
      };
    });

    res.json({
      summary: {
        period: {
          start: currentMonthStart.toISOString().split('T')[0],
          end: currentMonthEnd.toISOString().split('T')[0],
        },
        categories,
        comparison: {
          previous_period: {
            start: prevMonthStart.toISOString().split('T')[0],
            end: prevMonthEnd.toISOString().split('T')[0],
          },
          changes,
        },
      },
    });
  } catch (error) {
    console.error('Error getting category summary:', error);
    res.status(500).json({
      message: 'Failed to get category summary',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
