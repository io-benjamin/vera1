import { Transaction, TransactionCategory, SpendingCheckup } from '../models/types';

/**
 * Analyze spending for weekly checkup
 */
export function generateWeeklyCheckup(
  transactions: Transaction[],
  weekStartDate: Date,
  weekEndDate: Date,
  previousWeekTransactions?: Transaction[]
): SpendingCheckup {
  // Filter transactions for the current week
  const weekTransactions = transactions.filter((tx) => {
    const txDate = new Date(tx.date);
    return txDate >= weekStartDate && txDate <= weekEndDate && !tx.is_pending && tx.amount > 0;
  });

  // Calculate totals
  const totalSpent = weekTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const transactionCount = weekTransactions.length;
  const dailyAverage = totalSpent / 7;

  // Categorize spending
  const categoryTotals = new Map<TransactionCategory, number>();
  weekTransactions.forEach((tx) => {
    const category = tx.category || TransactionCategory.OTHER;
    const current = categoryTotals.get(category) || 0;
    categoryTotals.set(category, current + Math.abs(tx.amount));
  });

  // Get top categories
  const topCategories = Array.from(categoryTotals.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: (amount / totalSpent) * 100,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Generate insights
  const insights = generateInsights(weekTransactions, totalSpent, dailyAverage, topCategories);

  // Compare to previous week if available
  let comparison;
  if (previousWeekTransactions) {
    const previousWeekTotal = previousWeekTransactions
      .filter((tx) => {
        const txDate = new Date(tx.date);
        const prevWeekStart = new Date(weekStartDate);
        prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        const prevWeekEnd = new Date(weekEndDate);
        prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);
        return txDate >= prevWeekStart && txDate <= prevWeekEnd && !tx.is_pending && tx.amount > 0;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const changeAmount = totalSpent - previousWeekTotal;
    const changePercentage = previousWeekTotal > 0 ? (changeAmount / previousWeekTotal) * 100 : 0;

    comparison = {
      change_amount: changeAmount,
      change_percentage: changePercentage,
    };
  }

  return {
    week_start_date: weekStartDate.toISOString(),
    week_end_date: weekEndDate.toISOString(),
    total_spent: totalSpent,
    transaction_count: transactionCount,
    top_categories: topCategories,
    daily_average: dailyAverage,
    insights,
    comparison_to_previous_week: comparison,
  };
}

/**
 * Generate insights based on spending patterns
 */
function generateInsights(
  transactions: Transaction[],
  totalSpent: number,
  dailyAverage: number,
  topCategories: { category: TransactionCategory; amount: number; percentage: number }[]
): string[] {
  const insights: string[] = [];

  // Daily average insight
  if (dailyAverage > 100) {
    insights.push(`You're spending an average of $${dailyAverage.toFixed(2)} per day this week.`);
  } else {
    insights.push(`Great job keeping daily spending under $${dailyAverage.toFixed(2)} per day!`);
  }

  // Top category insight
  if (topCategories.length > 0) {
    const topCategory = topCategories[0];
    insights.push(
      `${formatCategoryName(topCategory.category)} is your biggest spending category at ${topCategory.percentage.toFixed(1)}% of total.`
    );
  }

  // Transaction count insight
  if (transactions.length > 20) {
    insights.push(`You made ${transactions.length} transactions this week. Consider reviewing smaller purchases.`);
  }

  // Multiple categories insight
  if (topCategories.length >= 3) {
    insights.push(
      `Your spending is spread across ${topCategories.length} main categories, showing diverse spending patterns.`
    );
  }

  return insights;
}

/**
 * Format category name for display
 */
function formatCategoryName(category: TransactionCategory): string {
  return category.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Get current week start and end dates
 */
export function getCurrentWeekDates(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}
