import { Pool } from 'pg';
import {
  LearnedPattern,
  PatternHistory,
  PatternHistoryContext,
  DetectedHabit,
} from '../models/types';

/**
 * PatternLearningService - Tracks spending patterns over time for cumulative AI learning
 *
 * Instead of wiping and recreating patterns each analysis, this service:
 * 1. Upserts patterns to track them across months
 * 2. Stores monthly snapshots for trend analysis
 * 3. Builds rich historical context for AI-powered insights
 */
export class PatternLearningService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Convert a detected habit into a learned pattern with history tracking
   */
  async trackPattern(
    userId: string,
    habit: DetectedHabit
  ): Promise<LearnedPattern> {
    const patternKey = this.generatePatternKey(habit);
    const now = new Date();
    const periodStart = this.getMonthStart(now);
    const periodEnd = this.getMonthEnd(now);

    // Get existing pattern to calculate trends
    const existing = await this.getPattern(userId, patternKey);

    // Calculate trend if we have history
    let trendDirection: 'improving' | 'worsening' | 'stable' | null = null;
    let trendPercentage: number | null = null;

    if (existing) {
      const previousCost = existing.estimated_monthly_cost;
      const currentCost = habit.monthly_impact;

      if (previousCost > 0) {
        const change = ((currentCost - previousCost) / previousCost) * 100;
        trendPercentage = Math.round(change * 100) / 100;

        if (change < -5) {
          trendDirection = 'improving';
        } else if (change > 5) {
          trendDirection = 'worsening';
        } else {
          trendDirection = 'stable';
        }
      }
    }

    // Upsert the learned pattern
    const result = await this.pool.query(
      `INSERT INTO learned_patterns
        (user_id, pattern_key, description, first_detected, last_detected,
         occurrence_count, estimated_monthly_cost, is_improving,
         trend_direction, trend_percentage, months_tracked,
         best_month_amount, worst_month_amount)
       VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE, $4, $5, $6, $7, $8, 1, $5, $5)
       ON CONFLICT (user_id, pattern_key) DO UPDATE SET
         last_detected = CURRENT_DATE,
         occurrence_count = learned_patterns.occurrence_count + EXCLUDED.occurrence_count,
         estimated_monthly_cost = EXCLUDED.estimated_monthly_cost,
         is_improving = CASE
           WHEN EXCLUDED.estimated_monthly_cost < learned_patterns.estimated_monthly_cost THEN true
           WHEN EXCLUDED.estimated_monthly_cost > learned_patterns.estimated_monthly_cost THEN false
           ELSE learned_patterns.is_improving
         END,
         trend_direction = EXCLUDED.trend_direction,
         trend_percentage = EXCLUDED.trend_percentage,
         months_tracked = (
           SELECT COUNT(DISTINCT DATE_TRUNC('month', period_start))
           FROM pattern_history
           WHERE user_id = EXCLUDED.user_id AND pattern_key = EXCLUDED.pattern_key
         ) + 1,
         best_month_amount = LEAST(
           COALESCE(learned_patterns.best_month_amount, EXCLUDED.estimated_monthly_cost),
           EXCLUDED.estimated_monthly_cost
         ),
         worst_month_amount = GREATEST(
           COALESCE(learned_patterns.worst_month_amount, EXCLUDED.estimated_monthly_cost),
           EXCLUDED.estimated_monthly_cost
         ),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        userId,
        patternKey,
        habit.description,
        habit.occurrence_count,
        habit.monthly_impact,
        trendDirection === 'improving' ? true : trendDirection === 'worsening' ? false : null,
        trendDirection,
        trendPercentage,
      ]
    );

    // Store monthly snapshot
    await this.storeMonthlySnapshot(userId, patternKey, {
      monthlyAmount: habit.monthly_impact,
      occurrenceCount: habit.occurrence_count,
      avgAmount: habit.avg_amount,
      metadata: {
        habit_type: habit.habit_type,
        title: habit.title,
        trigger_conditions: habit.trigger_conditions,
        sample_transactions: habit.sample_transactions?.slice(0, 3),
      },
      periodStart,
      periodEnd,
    });

    return this.mapToLearnedPattern(result.rows[0]);
  }

  /**
   * Store a monthly snapshot for historical tracking
   */
  private async storeMonthlySnapshot(
    userId: string,
    patternKey: string,
    data: {
      monthlyAmount: number;
      occurrenceCount: number;
      avgAmount: number;
      metadata: Record<string, unknown>;
      periodStart: Date;
      periodEnd: Date;
    }
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO pattern_history
        (user_id, pattern_key, period_start, period_end, monthly_amount,
         occurrence_count, avg_amount, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, pattern_key, period_start) DO UPDATE SET
         monthly_amount = EXCLUDED.monthly_amount,
         occurrence_count = EXCLUDED.occurrence_count,
         avg_amount = EXCLUDED.avg_amount,
         metadata = EXCLUDED.metadata`,
      [
        userId,
        patternKey,
        data.periodStart.toISOString().split('T')[0],
        data.periodEnd.toISOString().split('T')[0],
        data.monthlyAmount,
        data.occurrenceCount,
        data.avgAmount,
        JSON.stringify(data.metadata),
      ]
    );
  }

  /**
   * Get a specific pattern for a user
   */
  async getPattern(userId: string, patternKey: string): Promise<LearnedPattern | null> {
    const result = await this.pool.query(
      `SELECT * FROM learned_patterns WHERE user_id = $1 AND pattern_key = $2`,
      [userId, patternKey]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToLearnedPattern(result.rows[0]);
  }

  /**
   * Get all learned patterns for a user
   */
  async getUserPatterns(userId: string): Promise<LearnedPattern[]> {
    const result = await this.pool.query(
      `SELECT * FROM learned_patterns
       WHERE user_id = $1
       ORDER BY estimated_monthly_cost DESC`,
      [userId]
    );

    return result.rows.map(this.mapToLearnedPattern);
  }

  /**
   * Get pattern history for trend analysis
   */
  async getPatternHistory(
    userId: string,
    patternKey: string,
    months: number = 12
  ): Promise<PatternHistory[]> {
    const result = await this.pool.query(
      `SELECT * FROM pattern_history
       WHERE user_id = $1 AND pattern_key = $2
       ORDER BY period_start DESC
       LIMIT $3`,
      [userId, patternKey, months]
    );

    return result.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      pattern_key: row.pattern_key,
      period_start: row.period_start,
      period_end: row.period_end,
      monthly_amount: parseFloat(row.monthly_amount) || 0,
      occurrence_count: parseInt(row.occurrence_count) || 0,
      avg_amount: parseFloat(row.avg_amount) || 0,
      metadata: row.metadata || {},
      created_at: row.created_at,
    }));
  }

  /**
   * Build comprehensive AI context from all user patterns and history
   * This is the key method for cumulative learning
   */
  async buildAIContext(userId: string): Promise<string> {
    const patterns = await this.getPatternsWithHistory(userId);

    if (patterns.length === 0) {
      return 'No spending patterns detected yet. This appears to be a new user.';
    }

    const lines: string[] = [
      `LEARNED SPENDING PATTERNS (${patterns.length} patterns tracked):`,
      '',
    ];

    for (const pattern of patterns) {
      const trendEmoji = pattern.trend === 'improving' ? '📉' :
                         pattern.trend === 'worsening' ? '📈' : '➡️';

      lines.push(`${trendEmoji} ${pattern.description}`);
      lines.push(`   • Tracked for ${pattern.months_tracked} month(s)`);
      lines.push(`   • Current: $${pattern.current_monthly_cost.toFixed(0)}/month`);

      if (pattern.trend_percentage !== 0) {
        const direction = pattern.trend_percentage > 0 ? 'up' : 'down';
        lines.push(`   • Trend: ${Math.abs(pattern.trend_percentage).toFixed(0)}% ${direction} from last period`);
      }

      if (pattern.best_month && pattern.worst_month) {
        lines.push(`   • Best month: $${pattern.best_month.amount.toFixed(0)} (${pattern.best_month.period})`);
        lines.push(`   • Worst month: $${pattern.worst_month.amount.toFixed(0)} (${pattern.worst_month.period})`);
      }

      if (pattern.history.length > 1) {
        const historyStr = pattern.history
          .slice(0, 6)
          .map((h) => `${h.period}: $${h.amount.toFixed(0)}`)
          .join(' → ');
        lines.push(`   • History: ${historyStr}`);
      }

      lines.push('');
    }

    // Add summary statistics
    const totalMonthly = patterns.reduce((sum, p) => sum + p.current_monthly_cost, 0);
    const improvingCount = patterns.filter((p) => p.trend === 'improving').length;
    const worseningCount = patterns.filter((p) => p.trend === 'worsening').length;

    lines.push('SUMMARY:');
    lines.push(`• Total tracked spending: $${totalMonthly.toFixed(0)}/month`);
    lines.push(`• Improving habits: ${improvingCount}`);
    lines.push(`• Worsening habits: ${worseningCount}`);
    lines.push(`• Stable habits: ${patterns.length - improvingCount - worseningCount}`);

    return lines.join('\n');
  }

  /**
   * Get patterns with their full history for AI context building
   */
  private async getPatternsWithHistory(userId: string): Promise<PatternHistoryContext[]> {
    const result = await this.pool.query(
      `SELECT
        lp.*,
        COALESCE(
          json_agg(
            json_build_object(
              'period', to_char(ph.period_start, 'YYYY-MM'),
              'amount', ph.monthly_amount,
              'count', ph.occurrence_count
            ) ORDER BY ph.period_start DESC
          ) FILTER (WHERE ph.id IS NOT NULL),
          '[]'
        ) as history
       FROM learned_patterns lp
       LEFT JOIN pattern_history ph
         ON lp.user_id = ph.user_id AND lp.pattern_key = ph.pattern_key
       WHERE lp.user_id = $1
       GROUP BY lp.id
       ORDER BY lp.estimated_monthly_cost DESC`,
      [userId]
    );

    return result.rows.map((row) => {
      const history = Array.isArray(row.history) ? row.history : [];

      // Find best and worst months from history
      let bestMonth: { period: string; amount: number } | null = null;
      let worstMonth: { period: string; amount: number } | null = null;

      if (history.length > 0) {
        const sorted = [...history].sort((a, b) => a.amount - b.amount);
        bestMonth = { period: sorted[0].period, amount: parseFloat(sorted[0].amount) };
        worstMonth = { period: sorted[sorted.length - 1].period, amount: parseFloat(sorted[sorted.length - 1].amount) };
      }

      return {
        pattern_key: row.pattern_key,
        description: row.description,
        months_tracked: parseInt(row.months_tracked) || 1,
        current_monthly_cost: parseFloat(row.estimated_monthly_cost) || 0,
        trend: (row.trend_direction as 'improving' | 'worsening' | 'stable' | 'recovering') || 'stable',
        trend_percentage: parseFloat(row.trend_percentage) || 0,
        best_month: bestMonth,
        worst_month: worstMonth,
        history: history.map((h: { period: string; amount: string | number; count: string | number }) => ({
          period: h.period,
          amount: parseFloat(String(h.amount)) || 0,
          count: parseInt(String(h.count)) || 0,
        })),
      };
    });
  }

  /**
   * Update AI notes for a pattern (called after Claude provides insights)
   */
  async updatePatternNotes(
    userId: string,
    patternKey: string,
    notes: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE learned_patterns
       SET claude_notes = $3, ai_context = $3, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND pattern_key = $2`,
      [userId, patternKey, notes]
    );
  }

  /**
   * Generate a unique pattern key from a detected habit
   */
  private generatePatternKey(habit: DetectedHabit): string {
    const base = habit.habit_type.toLowerCase();

    // Add merchant info if available for more specific tracking
    if (habit.trigger_conditions?.merchants?.length) {
      const merchant = habit.trigger_conditions.merchants[0]
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
        .slice(0, 20);
      return `${base}_${merchant}`;
    }

    // Add day info for day-specific patterns
    if (habit.trigger_conditions?.day_of_week?.length === 1) {
      const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      return `${base}_${days[habit.trigger_conditions.day_of_week[0]]}`;
    }

    return base;
  }

  /**
   * Get first day of month
   */
  private getMonthStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  /**
   * Get last day of month
   */
  private getMonthEnd(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  /**
   * Map database row to LearnedPattern interface
   */
  private mapToLearnedPattern(row: Record<string, unknown>): LearnedPattern {
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      pattern_key: row.pattern_key as string,
      description: row.description as string,
      first_detected: row.first_detected as string,
      last_detected: row.last_detected as string,
      occurrence_count: parseInt(String(row.occurrence_count)) || 0,
      estimated_monthly_cost: parseFloat(String(row.estimated_monthly_cost)) || 0,
      is_improving: row.is_improving as boolean | null,
      claude_notes: row.claude_notes as string | null,
      trend_direction: row.trend_direction as 'improving' | 'worsening' | 'stable' | null,
      trend_percentage: row.trend_percentage ? parseFloat(String(row.trend_percentage)) : null,
      months_tracked: parseInt(String(row.months_tracked)) || 1,
      best_month_amount: row.best_month_amount ? parseFloat(String(row.best_month_amount)) : null,
      worst_month_amount: row.worst_month_amount ? parseFloat(String(row.worst_month_amount)) : null,
      ai_context: row.ai_context as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
