import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import {
  Transaction,
  TransactionCategory,
  TransactionSummary,
  AIAnalysisResponse,
  AIInsight,
  LearnedPattern,
  CoachingRecord,
  SpendingPattern,
  AnalysisContext,
} from '../models/types';

/**
 * AIAnalysisService - Claude-powered spending behavior analysis
 *
 * This service replaces rule-based personality detection with dynamic AI analysis.
 * It maintains memory of past insights to build context over time.
 */
export class AIAnalysisService {
  private pool: Pool;
  private anthropic: Anthropic;

  constructor(pool: Pool) {
    this.pool = pool;
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Main entry point: Analyze user's spending behavior
   */
  async analyzeSpendingBehavior(userId: string): Promise<{
    insight: AIInsight;
    patterns: LearnedPattern[];
  }> {
    // 1. Gather all context
    const context = await this.buildAnalysisContext(userId);

    // 2. Call Claude for analysis
    const claudeResponse = await this.callClaude(context);

    // 3. Store the insight
    const insight = await this.storeInsight(userId, context.transactions, claudeResponse);

    // 4. Update learned patterns
    const patterns = await this.updateLearnedPatterns(userId, claudeResponse.patterns);

    // 5. Store coaching record
    await this.storeCoachingRecord(userId, insight.id, claudeResponse);

    return { insight, patterns };
  }

  /**
   * Get the latest analysis or run a new one if stale
   */
  async getLatestAnalysis(userId: string): Promise<{
    insight: AIInsight;
    patterns: LearnedPattern[];
    is_fresh: boolean;
  }> {
    // Check for recent insight (less than 7 days old)
    const recentInsight = await this.getRecentInsight(userId, 7);

    if (recentInsight) {
      const patterns = await this.getLearnedPatterns(userId);
      return { insight: recentInsight, patterns, is_fresh: false };
    }

    // Run new analysis
    const result = await this.analyzeSpendingBehavior(userId);
    return { ...result, is_fresh: true };
  }

  /**
   * Get pattern history to see evolution over time
   */
  async getPatternHistory(userId: string): Promise<{
    patterns: LearnedPattern[];
    insights_count: number;
    first_analysis: string | null;
  }> {
    const patterns = await this.getLearnedPatterns(userId);

    const countResult = await this.pool.query(
      'SELECT COUNT(*) as count, MIN(analysis_date) as first FROM ai_insights WHERE user_id = $1',
      [userId]
    );

    return {
      patterns,
      insights_count: parseInt(countResult.rows[0].count),
      first_analysis: countResult.rows[0].first,
    };
  }

  /**
   * Record user feedback on coaching
   */
  async recordFeedback(
    userId: string,
    insightId: string,
    action: 'followed' | 'dismissed' | 'partial'
  ): Promise<void> {
    await this.pool.query(
      `UPDATE coaching_history
       SET user_action = $1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2 AND insight_id = $3`,
      [action, userId, insightId]
    );
  }

  // ============================================
  // Private methods
  // ============================================

  /**
   * Build complete context for Claude analysis
   */
  private async buildAnalysisContext(userId: string): Promise<AnalysisContext> {
    const [transactions, previousInsight, learnedPatterns, recentCoaching] = await Promise.all([
      this.getTransactionSummary(userId),
      this.getRecentInsight(userId, 90),
      this.getLearnedPatterns(userId),
      this.getRecentCoaching(userId),
    ]);

    return {
      transactions,
      previous_insight: previousInsight,
      learned_patterns: learnedPatterns,
      recent_coaching: recentCoaching,
    };
  }

  /**
   * Get aggregated transaction data for the last 90 days
   */
  private async getTransactionSummary(userId: string): Promise<TransactionSummary> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    // Get raw transactions
    const result = await this.pool.query(
      `SELECT t.*
       FROM transactions t
       INNER JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1
         AND t.date >= $2
         AND t.is_pending = false
       ORDER BY t.date DESC`,
      [userId, startDate.toISOString().split('T')[0]]
    );

    const transactions: Transaction[] = result.rows.map(row => ({
      id: row.id,
      account_id: row.account_id,
      teller_transaction_id: row.teller_transaction_id,
      amount: Math.abs(parseFloat(row.amount)),
      date: row.date,
      name: row.name,
      category: row.category,
      merchant_name: row.merchant_name,
      is_pending: row.is_pending,
    }));

    // Aggregate by category
    const byCategory = new Map<TransactionCategory, { total: number; count: number }>();
    transactions.forEach(t => {
      const cat = t.category || TransactionCategory.OTHER;
      const existing = byCategory.get(cat) || { total: 0, count: 0 };
      byCategory.set(cat, {
        total: existing.total + t.amount,
        count: existing.count + 1,
      });
    });

    // Aggregate by merchant
    const byMerchant = new Map<string, { total: number; count: number }>();
    transactions.forEach(t => {
      const merchant = t.merchant_name || t.name;
      const existing = byMerchant.get(merchant) || { total: 0, count: 0 };
      byMerchant.set(merchant, {
        total: existing.total + t.amount,
        count: existing.count + 1,
      });
    });

    // Aggregate by day of week
    const byDayOfWeek = new Map<number, { total: number; count: number }>();
    transactions.forEach(t => {
      const day = new Date(t.date).getDay();
      const existing = byDayOfWeek.get(day) || { total: 0, count: 0 };
      byDayOfWeek.set(day, {
        total: existing.total + t.amount,
        count: existing.count + 1,
      });
    });

    // Find largest transactions
    const sorted = [...transactions].sort((a, b) => b.amount - a.amount);
    const largestTransactions = sorted.slice(0, 10).map(t => ({
      merchant: t.merchant_name || t.name,
      amount: t.amount,
      date: t.date,
      category: t.category || null,
    }));

    // Detect recurring charges (same merchant 2+ times with similar amounts)
    const recurringCharges: { merchant: string; avg_amount: number; frequency: 'weekly' | 'monthly' | 'annual' }[] = [];
    byMerchant.forEach((data, merchant) => {
      if (data.count >= 2) {
        const avgAmount = data.total / data.count;
        // Estimate frequency based on count over 90 days
        let frequency: 'weekly' | 'monthly' | 'annual' = 'monthly';
        if (data.count >= 12) frequency = 'weekly';
        else if (data.count === 1) frequency = 'annual';

        recurringCharges.push({ merchant, avg_amount: avgAmount, frequency });
      }
    });

    const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);

    return {
      period_days: 90,
      total_transactions: transactions.length,
      total_spent: Math.round(totalSpent * 100) / 100,
      by_category: Array.from(byCategory.entries()).map(([category, data]) => ({
        category,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
        avg_transaction: Math.round((data.total / data.count) * 100) / 100,
      })),
      by_merchant: Array.from(byMerchant.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 20)
        .map(([merchant, data]) => ({
          merchant,
          total: Math.round(data.total * 100) / 100,
          count: data.count,
          is_recurring: data.count >= 2,
        })),
      by_day_of_week: Array.from(byDayOfWeek.entries()).map(([day, data]) => ({
        day,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
      })),
      largest_transactions: largestTransactions,
      recurring_charges: recurringCharges.slice(0, 15),
    };
  }

  /**
   * Get most recent AI insight
   */
  private async getRecentInsight(userId: string, withinDays: number): Promise<AIInsight | null> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - withinDays);

    const result = await this.pool.query(
      `SELECT * FROM ai_insights
       WHERE user_id = $1 AND analysis_date >= $2
       ORDER BY analysis_date DESC LIMIT 1`,
      [userId, cutoff.toISOString().split('T')[0]]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      analysis_date: row.analysis_date,
      transaction_summary: row.transaction_summary,
      claude_response: row.claude_response,
      identified_patterns: row.identified_patterns,
      personality_summary: row.personality_summary,
      damage_estimate: parseFloat(row.damage_estimate),
      created_at: row.created_at,
    };
  }

  /**
   * Get all learned patterns for user
   */
  private async getLearnedPatterns(userId: string): Promise<LearnedPattern[]> {
    const result = await this.pool.query(
      `SELECT * FROM learned_patterns
       WHERE user_id = $1
       ORDER BY occurrence_count DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      pattern_key: row.pattern_key,
      description: row.description,
      first_detected: row.first_detected,
      last_detected: row.last_detected,
      occurrence_count: row.occurrence_count,
      estimated_monthly_cost: parseFloat(row.estimated_monthly_cost || 0),
      is_improving: row.is_improving,
      claude_notes: row.claude_notes ?? null,
      trend_direction: row.trend_direction ?? null,
      trend_percentage: row.trend_percentage ? parseFloat(row.trend_percentage) : null,
      months_tracked: row.months_tracked ?? 0,
      best_month_amount: row.best_month_amount ? parseFloat(row.best_month_amount) : null,
      worst_month_amount: row.worst_month_amount ? parseFloat(row.worst_month_amount) : null,
      ai_context: row.ai_context ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  /**
   * Get recent coaching history
   */
  private async getRecentCoaching(userId: string): Promise<CoachingRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM coaching_history
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      insight_id: row.insight_id,
      coaching_type: row.coaching_type,
      message_given: row.message_given,
      actions_suggested: row.actions_suggested,
      user_action: row.user_action,
      behavior_changed: row.behavior_changed,
      created_at: row.created_at,
    }));
  }

  /**
   * Call Claude API for analysis
   */
  private async callClaude(context: AnalysisContext): Promise<AIAnalysisResponse> {
    const prompt = this.buildPrompt(context);

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text content from response
    const textContent = message.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse JSON from response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from Claude response');
    }

    const response = JSON.parse(jsonMatch[0]) as AIAnalysisResponse;
    return response;
  }

  /**
   * Build the prompt for Claude
   */
  private buildPrompt(context: AnalysisContext): string {
    const { transactions, previous_insight, learned_patterns, recent_coaching } = context;

    let prompt = `You are a financial behavior analyst for vera, a behavior coaching app (NOT a budgeting app).
Your job is to identify spending PATTERNS and BEHAVIORS, not just track expenses.

CRITICAL RULES:
1. Be blunt and specific. Say "$340 on food delivery" not "high discretionary spending"
2. No finance jargon. Talk like a friend who's good with money
3. Focus on WHY they spend, not just WHAT they spend on
4. Discover unique patterns - don't force them into categories
5. Every insight should suggest a specific action

`;

    // Add previous context if available
    if (previous_insight) {
      prompt += `\n## PREVIOUS ANALYSIS (${previous_insight.analysis_date})
${previous_insight.personality_summary}

Patterns found last time:
${previous_insight.identified_patterns.map(p => `- ${p}`).join('\n')}

`;
    }

    // Add learned patterns
    if (learned_patterns.length > 0) {
      prompt += `\n## KNOWN PATTERNS (detected over time)
${learned_patterns.map(p =>
  `- ${p.pattern_key}: ${p.description} (~$${p.estimated_monthly_cost}/mo, seen ${p.occurrence_count}x${p.is_improving ? ', improving' : ''})`
).join('\n')}

`;
    }

    // Add recent coaching
    if (recent_coaching.length > 0) {
      prompt += `\n## RECENT COACHING GIVEN
${recent_coaching.map(c =>
  `- "${c.message_given.substring(0, 100)}..." ${c.user_action ? `(user: ${c.user_action})` : ''}`
).join('\n')}

`;
    }

    // Add current transaction data
    prompt += `\n## CURRENT TRANSACTION DATA (last ${transactions.period_days} days)

Total spent: $${transactions.total_spent.toLocaleString()}
Transactions: ${transactions.total_transactions}

### By Category:
${transactions.by_category.map(c =>
  `${c.category}: $${c.total.toLocaleString()} (${c.count} transactions, avg $${c.avg_transaction})`
).join('\n')}

### Top Merchants:
${transactions.by_merchant.slice(0, 10).map(m =>
  `${m.merchant}: $${m.total.toLocaleString()} (${m.count}x${m.is_recurring ? ', recurring' : ''})`
).join('\n')}

### By Day of Week:
${transactions.by_day_of_week.map(d => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.day]}: $${d.total.toLocaleString()} (${d.count} transactions)`;
}).join('\n')}

### Largest Single Transactions:
${transactions.largest_transactions.slice(0, 5).map(t =>
  `$${t.amount.toLocaleString()} at ${t.merchant} (${t.date})`
).join('\n')}

### Recurring Charges Detected:
${transactions.recurring_charges.map(r =>
  `${r.merchant}: ~$${r.avg_amount.toFixed(2)} (${r.frequency})`
).join('\n')}
`;

    // Add instructions
    prompt += `

## YOUR TASK

Analyze this spending data and respond with a JSON object in this exact format:

{
  "personality_summary": "2-3 sentences describing their spending personality in plain language. Be specific with numbers.",
  "patterns": [
    {
      "pattern_key": "kebab-case-identifier",
      "name": "Human Readable Name",
      "description": "What this pattern means and why it matters",
      "estimated_monthly_cost": 123.45,
      "is_improving": null,
      "severity": "low|medium|high",
      "suggested_action": "One specific thing they can do about it"
    }
  ],
  "total_damage_estimate": 500.00,
  "actions": [
    "First specific action",
    "Second specific action",
    "Third specific action"
  ],
  "changes_since_last": ${previous_insight ? '{ "improved": [], "worsened": [], "new": [] }' : 'null'},
  "coaching_message": "A blunt, supportive message about their overall financial behavior. Be real with them."
}

Identify 3-5 patterns. Be creative - discover what's unique about THIS person's spending, don't just apply generic categories.
${previous_insight ? 'Compare to the previous analysis and note what has changed.' : 'This is their first analysis.'}

Respond ONLY with the JSON object, no additional text.`;

    return prompt;
  }

  /**
   * Store the AI insight in the database
   */
  private async storeInsight(
    userId: string,
    transactionSummary: TransactionSummary,
    claudeResponse: AIAnalysisResponse
  ): Promise<AIInsight> {
    const result = await this.pool.query(
      `INSERT INTO ai_insights (
        user_id, insight_type, title, content, analysis_date, transaction_summary, claude_response,
        identified_patterns, personality_summary, damage_estimate
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        userId,
        'spending_analysis',
        'Spending Behavior Analysis',
        claudeResponse.coaching_message || claudeResponse.personality_summary,
        new Date().toISOString().split('T')[0],
        JSON.stringify(transactionSummary),
        JSON.stringify(claudeResponse),
        claudeResponse.patterns.map(p => p.pattern_key),
        claudeResponse.personality_summary,
        claudeResponse.total_damage_estimate,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      analysis_date: row.analysis_date,
      transaction_summary: transactionSummary,
      claude_response: claudeResponse,
      identified_patterns: row.identified_patterns,
      personality_summary: row.personality_summary,
      damage_estimate: parseFloat(row.damage_estimate),
      created_at: row.created_at,
    };
  }

  /**
   * Update learned patterns based on new analysis
   */
  private async updateLearnedPatterns(
    userId: string,
    patterns: SpendingPattern[]
  ): Promise<LearnedPattern[]> {
    const today = new Date().toISOString().split('T')[0];
    const results: LearnedPattern[] = [];

    for (const pattern of patterns) {
      // Upsert pattern
      const result = await this.pool.query(
        `INSERT INTO learned_patterns (
          user_id, pattern_key, description, first_detected, last_detected,
          occurrence_count, estimated_monthly_cost, is_improving, claude_notes
        ) VALUES ($1, $2, $3, $4, $4, 1, $5, $6, $7)
        ON CONFLICT (user_id, pattern_key) DO UPDATE SET
          description = $3,
          last_detected = $4,
          occurrence_count = learned_patterns.occurrence_count + 1,
          estimated_monthly_cost = $5,
          is_improving = $6,
          claude_notes = $7,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          userId,
          pattern.pattern_key,
          pattern.description,
          today,
          pattern.estimated_monthly_cost,
          pattern.is_improving,
          pattern.suggested_action,
        ]
      );

      const row = result.rows[0];
      results.push({
        id: row.id,
        user_id: row.user_id,
        pattern_key: row.pattern_key,
        description: row.description,
        first_detected: row.first_detected,
        last_detected: row.last_detected,
        occurrence_count: row.occurrence_count,
        estimated_monthly_cost: parseFloat(row.estimated_monthly_cost || 0),
        is_improving: row.is_improving,
        claude_notes: row.claude_notes ?? null,
        trend_direction: row.trend_direction ?? null,
        trend_percentage: row.trend_percentage ? parseFloat(row.trend_percentage) : null,
        months_tracked: row.months_tracked ?? 0,
        best_month_amount: row.best_month_amount ? parseFloat(row.best_month_amount) : null,
        worst_month_amount: row.worst_month_amount ? parseFloat(row.worst_month_amount) : null,
        ai_context: row.ai_context ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    return results;
  }

  /**
   * Store coaching record for tracking effectiveness
   */
  private async storeCoachingRecord(
    userId: string,
    insightId: string,
    response: AIAnalysisResponse
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO coaching_history (
        user_id, insight_id, coaching_type, message_given, actions_suggested
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        insightId,
        'personality',
        response.coaching_message,
        response.actions,
      ]
    );
  }
}
