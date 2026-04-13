import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import {
  DetectedHabit,
  HabitType,
  AIHabitInsight,
  HabitsResponse,
  Transaction,
  HabitSummary,
  LearnedPattern,
} from '../models/types';
import { PatternLearningService } from './patternLearningService';
import { ReflectionService } from './reflectionService';
import { DataQualityService } from './dataQualityService';
import { buildTimeSummaryContext } from './dataReliabilityService';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * AIInsightsService - Uses Claude to generate psychological insights about spending habits
 *
 * Provides:
 * - Deep behavioral analysis of detected habits
 * - Psychological triggers identification
 * - Personalized intervention recommendations
 * - Coaching messages that are direct but non-judgmental
 */
export class AIInsightsService {
  private pool: Pool;
  private patternLearningService: PatternLearningService;
  private reflectionService: ReflectionService;
  private dataQualityService: DataQualityService;

  constructor(pool: Pool) {
    this.pool = pool;
    this.patternLearningService = new PatternLearningService(pool);
    this.reflectionService = new ReflectionService(pool);
    this.dataQualityService = new DataQualityService(pool);
  }

  /**
   * Generate AI insights for detected habits
   */
  async generateHabitInsights(
    userId: string,
    habits: DetectedHabit[],
    summary: HabitSummary
  ): Promise<HabitsResponse> {
    if (habits.length === 0) {
      return {
        habits,
        summary,
        ai_insights: [],
        coaching_message: "We need more transaction data to identify your spending patterns. Make sure your bank account is connected and synced.",
      };
    }

    // Check if cached insights are still fresh (no habit updated since last AI run)
    const cached = await this.getCachedInsightsIfFresh(userId, habits);
    if (cached) {
      return { habits, summary, ai_insights: cached.insights, coaching_message: cached.coaching_message };
    }

    // Get all context in parallel
    const [transactions, reflectionContext, feedbackContext, learningsContext, dataQualityContext] = await Promise.all([
      this.getRecentTransactions(userId, 30),
      this.reflectionService.buildReflectionContext(userId),
      this.getFeedbackContext(userId),
      this.getInsightLearningsContext(userId),
      this.dataQualityService.buildDataQualityContext(userId),
    ]);

    const habitContext = this.buildHabitContext(
      habits,
      transactions,
      reflectionContext,
      feedbackContext,
      learningsContext,
      dataQualityContext
    );

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: this.getSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: `Analyze these spending habits and provide insights:\n\n${habitContext}`,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from AI');
      }

      const parsed = this.parseAIResponse(textContent.text, habits);

      // Get IDs of reflections that were answered (for sourcing learnings)
      const answeredReflections = await this.reflectionService.getAnsweredResponses(userId, 15);
      const reflectionIds = answeredReflections.map((r) => r.id);

      // Save insights and learnings to database
      await Promise.all([
        this.saveInsights(userId, parsed.ai_insights),
        parsed.learnings.length > 0
          ? this.saveInsightLearnings(userId, parsed.learnings, reflectionIds)
          : Promise.resolve(),
      ]);

      return {
        habits,
        summary,
        ai_insights: parsed.ai_insights,
        coaching_message: parsed.coaching_message,
      };
    } catch (error) {
      console.error('Error generating AI insights:', error);

      // Return fallback insights
      return {
        habits,
        summary,
        ai_insights: this.generateFallbackInsights(habits),
        coaching_message: this.generateFallbackCoaching(habits, summary),
      };
    }
  }

  /**
   * Generate a weekly behavioral insight using AI.
   * Returns a cached snapshot if the habit state hasn't changed since the last
   * generation (or the snapshot is less than 24 hours old). Only calls Claude
   * when something meaningful has actually changed.
   */
  async generateWeeklyInsight(userId: string, force = false): Promise<{
    title: string;
    content: string;
    action: string;
  }> {
    const transactions = await this.getRecentTransactions(userId, 7);
    const habits = await this.getUserHabits(userId);

    if (transactions.length < 5) {
      return {
        title: 'Not Enough Data',
        content: 'We need more transactions to generate weekly insights. Keep tracking!',
        action: 'Sync your bank account to unlock insights',
      };
    }

    // ── Pre-compute structured signals ───────────────────────────────────────
    const weeklySpend = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const activeHabits = habits.filter((h) =>
      transactions.some((tx) => this.transactionMatchesHabit(tx, h))
    );

    // Top merchants by spend (skip generic/blank names)
    const merchantSpend: Record<string, number> = {};
    for (const tx of transactions) {
      const name = tx.merchant_name || tx.name;
      if (!name || name.toLowerCase() === 'other') continue;
      merchantSpend[name] = (merchantSpend[name] ?? 0) + Math.abs(tx.amount);
    }
    const topMerchants = Object.entries(merchantSpend)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, amount]) => `${name} ($${amount.toFixed(0)})`);

    // Category breakdown — exclude OTHER so it never becomes the headline signal
    const categoryCounts: Record<string, { count: number; total: number }> = {};
    for (const tx of transactions) {
      const cat = tx.category;
      if (!cat || cat === 'OTHER') continue;
      if (!categoryCounts[cat]) categoryCounts[cat] = { count: 0, total: 0 };
      categoryCounts[cat].count++;
      categoryCounts[cat].total += Math.abs(tx.amount);
    }
    const topCategoryEntry = Object.entries(categoryCounts)
      .sort((a, b) => b[1].count - a[1].count)[0];
    const topCategory = topCategoryEntry?.[0] ?? null;
    const topCategoryCount = topCategoryEntry?.[1].count ?? 0;
    const topCategoryPct = transactions.length > 0
      ? Math.round((topCategoryCount / transactions.length) * 100)
      : 0;

    // Late-night ratio (evening or night time-of-day labels)
    const lateNightCount = transactions.filter(
      (tx) => tx.user_time_of_day === 'night' || tx.user_time_of_day === 'evening'
    ).length;
    const lateNightPct = transactions.length > 0
      ? Math.round((lateNightCount / transactions.length) * 100)
      : 0;

    // Pattern signals for Claude
    const patternSignals = activeHabits.map((h) => ({
      name: h.title,
      trend: h.trend,
      streak: h.streak_count ? `${h.streak_count} ${h.streak_unit ?? 'weeks'} in a row` : null,
    }));

    // ── Fingerprint: active habit ids + trends, stable sort ──────────────────
    const fingerprint = createHash('md5')
      .update(
        activeHabits
          .map((h) => `${h.id}:${h.trend}`)
          .sort()
          .join('|')
      )
      .digest('hex');

    // ── Return cached snapshot if nothing meaningful has changed (skip if force) ─
    if (force) {
      await this.pool.query(
        `DELETE FROM behavior_snapshots WHERE user_id = $1 AND habit_fingerprint = $2`,
        [userId, fingerprint]
      );
    }
    const cached = await this.pool.query<{
      insight_title: string;
      insight_content: string;
      insight_action: string;
    }>(
      `SELECT insight_title, insight_content, insight_action
       FROM behavior_snapshots
       WHERE user_id = $1
         AND habit_fingerprint = $2
         AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, fingerprint]
    );

    if (cached.rows.length > 0) {
      const row = cached.rows[0];
      return { title: row.insight_title, content: row.insight_content, action: row.insight_action };
    }

    // ── Generate new insight ──────────────────────────────────────────────────
    let insight: { title: string; content: string; action: string } | null = null;

    const systemPrompt = `You are writing behavioral insights for a financial intelligence app called Vera.

Your tone must be:
- Observational, not judgmental
- Calm and neutral
- Slightly reflective, not instructive
- Human, not robotic

STRICT RULES:
- Do NOT give advice
- Do NOT say "you should"
- Do NOT sound like an alert or warning
- Do NOT use words like: "significantly", "critical", "warning", "alert", "concerning"
- Do NOT start sentences with "I" (the app is observing, not an AI speaking)

PREFERRED PHRASES:
- "It looks like..."
- "This week..."
- "There's a pattern here..."
- "This can happen when..."
- "No judgment here."

WRITING STYLE:
Each insight must follow this structure:
1. Headline — short, human, slightly interpretive (e.g. "Food was on your mind this week")
2. Data-backed observation — specific numbers, clear and simple
3. Behavioral context — when or why this pattern tends to appear
4. Soft reflection — one quiet closing line (optional, e.g. "No judgment here.")

Keep sentences short. Be precise. Avoid filler.

GOOD EXAMPLE:
{
  "title": "Food was on your mind this week",
  "content": "4 out of 6 transactions were food-related, totaling $67 — about 76% of weekly spending.\\n\\nMany of these came late in the evening. When routines shift, ordering in can feel like the path of least resistance.\\n\\nNo judgment here.",
  "action": "Notice the next time the urge hits after 9pm."
}

BAD EXAMPLE:
{
  "title": "Alert: Food spending increased significantly",
  "content": "You should reduce your food spending. Your habits are concerning and you need to change your behavior immediately.",
  "action": "Stop ordering food late at night."
}

Return only valid JSON matching the structure above.`;

    const userMessage = `This week's spending signals:
- Total: $${weeklySpend.toFixed(2)} across ${transactions.length} transactions
- Top merchants: ${topMerchants.length > 0 ? topMerchants.join(', ') : 'no named merchants this week'}
${topCategory ? `- Top category: ${topCategory} (${topCategoryCount} of ${transactions.length} transactions, ${topCategoryPct}%)` : '- Categories: mixed / uncategorized'}
- Evening/late-night transactions: ${lateNightPct}%
- Active patterns: ${patternSignals.length > 0
      ? patternSignals.map((p) => `${p.name} (${p.trend}${p.streak ? `, ${p.streak}` : ''})`).join('; ')
      : 'none detected this week'}`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        temperature: 0.4,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      if (textContent && textContent.type === 'text') {
        insight = JSON.parse(textContent.text.replace(/```json\n?|\n?```/g, '').trim());
      }
    } catch (error) {
      console.error('Error generating weekly insight:', error);
    }

    // ── Deterministic fallback if Claude failed ───────────────────────────────
    if (!insight) {
      const fallbackTitle = topCategory
        ? `${topCategory.charAt(0) + topCategory.slice(1).toLowerCase()} was the theme this week`
        : topMerchants.length > 0
          ? `${topMerchants[0].split(' (')[0]} led spending this week`
          : 'This week at a glance';
      insight = {
        title: fallbackTitle,
        content: `${transactions.length} transactions totaling $${weeklySpend.toFixed(0)}.${
          topMerchants.length > 0 ? ` Most went to ${topMerchants.slice(0, 2).join(' and ')}.` : ''
        }${lateNightPct > 30 ? ` A fair amount happened in the evenings.` : ''}`,
        action: activeHabits.length > 0
          ? `Notice when ${activeHabits[0].title.toLowerCase()} tends to happen.`
          : 'Keep syncing — patterns will surface over time.',
      };
    }

    // ── Persist snapshot ──────────────────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];
    await this.pool.query(
      `INSERT INTO behavior_snapshots
         (user_id, period_start, period_end, insight_title, insight_content, insight_action, habit_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, today, today, insight.title, insight.content, insight.action, fingerprint]
    ).catch((err) => console.error('Failed to save behavior snapshot:', err));

    return insight;
  }

  /**
   * Analyze a specific habit in depth
   */
  async analyzeHabitDeep(userId: string, habitId: string): Promise<AIHabitInsight | null> {
    const result = await this.pool.query(
      'SELECT * FROM detected_habits WHERE id = $1 AND user_id = $2',
      [habitId, userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const habit: DetectedHabit = {
      ...row,
      monthly_impact: parseFloat(row.monthly_impact) || 0,
      annual_impact: parseFloat(row.annual_impact) || 0,
      avg_amount: parseFloat(row.avg_amount) || 0,
      trigger_conditions: row.trigger_conditions || {},
      sample_transactions: row.sample_transactions || [],
    };

    // Return cached deep analysis if it's newer than the habit's last update
    const cached = await this.pool.query(
      `SELECT content FROM ai_insights
       WHERE user_id = $1 AND insight_type = 'deep_analysis' AND title = $2
         AND created_at > $3
       ORDER BY created_at DESC LIMIT 1`,
      [userId, habitId, row.updated_at]
    );

    if (cached.rows.length > 0) {
      try {
        const parsed = JSON.parse(cached.rows[0].content);
        return { habit_type: habit.habit_type, ...parsed };
      } catch {}
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: `You are a behavioral psychologist specializing in financial habits.
Analyze this spending habit deeply and provide psychological insights.
Be direct and practical, not preachy.

Response format (JSON):
{
  "psychological_trigger": "What emotional/situational trigger drives this behavior",
  "behavioral_pattern": "The underlying pattern and why it's hard to break",
  "recommended_intervention": "A specific, actionable intervention",
  "difficulty_to_change": "easy" | "moderate" | "hard",
  "potential_savings": <number, monthly savings if addressed>,
  "alternative_suggestions": ["3 specific alternatives to satisfy the underlying need"]
}`,
        messages: [
          {
            role: 'user',
            content: `Analyze this habit:
Type: ${habit.habit_type}
Title: ${habit.title}
Description: ${habit.description}
Monthly Impact: $${habit.monthly_impact}
Frequency: ${habit.frequency}
Occurrence Count: ${habit.occurrence_count}
Average Amount: $${habit.avg_amount}
Trigger Conditions: ${JSON.stringify(habit.trigger_conditions)}`,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      if (textContent && textContent.type === 'text') {
        const parsed = JSON.parse(textContent.text.replace(/```json\n?|\n?```/g, '').trim());

        // Persist so repeat opens are instant
        await this.pool.query(
          `INSERT INTO ai_insights (user_id, insight_type, title, content, confidence_score)
           VALUES ($1, 'deep_analysis', $2, $3, 0.9)`,
          [userId, habitId, JSON.stringify(parsed)]
        ).catch((err) => console.error('Failed to cache deep analysis:', err));

        return { habit_type: habit.habit_type, ...parsed };
      }
    } catch (error) {
      console.error('Error analyzing habit:', error);
    }

    // Fallback insight
    return this.generateFallbackInsight(habit);
  }

  /**
   * Generate personalized coaching message
   */
  async generateCoachingMessage(
    userId: string,
    context: 'weekly' | 'habit_detected' | 'improvement' | 'setback'
  ): Promise<string> {
    const habits = await this.getUserHabits(userId);
    const totalImpact = habits.reduce((sum, h) => sum + h.monthly_impact, 0);

    const contextMessages: Record<string, string> = {
      weekly: `Generate a weekly check-in message. User has ${habits.length} active habits costing $${totalImpact.toFixed(0)}/month.`,
      habit_detected: `A new spending habit was detected. Be direct about it but supportive.`,
      improvement: `The user has improved their spending habits. Acknowledge progress without being over-the-top.`,
      setback: `The user had a setback this week. Be understanding but honest about getting back on track.`,
    };

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: `You are a direct, no-nonsense financial coach. Give brief, actionable advice.
No fluff, no excessive praise, no judgment. Just real talk.
Keep response under 3 sentences.`,
        messages: [
          {
            role: 'user',
            content: contextMessages[context] + `\n\nTop habits: ${habits.slice(0, 3).map((h) => h.title).join(', ')}`,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      if (textContent && textContent.type === 'text') {
        return textContent.text.trim();
      }
    } catch (error) {
      console.error('Error generating coaching message:', error);
    }

    // Fallback messages
    const fallbacks: Record<string, string> = {
      weekly: `You've got ${habits.length} habits costing you $${totalImpact.toFixed(0)}/month. Pick one to work on this week.`,
      habit_detected: `New pattern spotted. Awareness is the first step - now you can decide if you want to change it.`,
      improvement: `You're making progress. Keep the momentum going.`,
      setback: `Setbacks happen. What matters is what you do next. Pick one small thing to improve this week.`,
    };

    return fallbacks[context];
  }

  /**
   * Generate a personalized AI reply using cumulative historical pattern data
   * This is the key method that leverages months of learned user behavior
   */
  async generatePersonalizedReply(
    userId: string,
    userQuestion?: string
  ): Promise<{
    reply: string;
    patterns_referenced: string[];
    improvements_noted: string[];
    areas_of_concern: string[];
  }> {
    // Build historical context from pattern learning service and reflections
    const [historicalContext, reflectionContext, patterns, transactions] = await Promise.all([
      this.patternLearningService.buildAIContext(userId),
      this.reflectionService.buildReflectionContext(userId),
      this.patternLearningService.getUserPatterns(userId),
      this.getRecentTransactions(userId, 30),
    ]);
    const currentSpend = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    // Identify improvements and concerns
    const improving = patterns.filter((p) => p.trend_direction === 'improving');
    const worsening = patterns.filter((p) => p.trend_direction === 'worsening');

    const prompt = userQuestion
      ? `The user asks: "${userQuestion}"\n\nAnswer their question using your knowledge of their spending history.`
      : `Generate a personalized check-in message based on what you've learned about this user over time.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: `You are a personal financial coach who has been tracking this user's spending patterns for months.
You know their habits intimately and can reference their history.

Your style:
- Speak like you know them personally ("I've noticed over the last few months...")
- Reference specific patterns and trends you've observed
- Acknowledge improvements genuinely but briefly
- Address concerns directly but supportively
- Give ONE specific, actionable suggestion

Keep your response conversational and under 150 words.`,
        messages: [
          {
            role: 'user',
            content: `${historicalContext}

CURRENT MONTH:
- Spending so far: $${currentSpend.toFixed(0)}
- Transactions: ${transactions.length}
- Top merchants: ${this.getTopMerchants(transactions).join(', ')}

${reflectionContext}

${prompt}`,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      const reply = textContent && textContent.type === 'text'
        ? textContent.text.trim()
        : this.generateFallbackPersonalizedReply(patterns, improving, worsening);

      // Update pattern notes with this interaction
      for (const pattern of patterns.slice(0, 3)) {
        await this.patternLearningService.updatePatternNotes(
          userId,
          pattern.pattern_key,
          `Last discussed: ${new Date().toISOString().split('T')[0]}`
        );
      }

      return {
        reply,
        patterns_referenced: patterns.map((p) => p.pattern_key),
        improvements_noted: improving.map((p) => p.description),
        areas_of_concern: worsening.map((p) => p.description),
      };
    } catch (error) {
      console.error('Error generating personalized reply:', error);

      return {
        reply: this.generateFallbackPersonalizedReply(patterns, improving, worsening),
        patterns_referenced: patterns.map((p) => p.pattern_key),
        improvements_noted: improving.map((p) => p.description),
        areas_of_concern: worsening.map((p) => p.description),
      };
    }
  }

  /**
   * Answer a specific question about the user's spending using historical data
   */
  async answerSpendingQuestion(
    userId: string,
    question: string
  ): Promise<string> {
    const result = await this.generatePersonalizedReply(userId, question);
    return result.reply;
  }

  /**
   * Get a monthly progress report using historical patterns
   */
  async getMonthlyProgressReport(userId: string): Promise<{
    summary: string;
    total_tracked_spending: number;
    patterns_improving: number;
    patterns_worsening: number;
    biggest_win: string | null;
    biggest_concern: string | null;
    months_of_data: number;
  }> {
    const patterns = await this.patternLearningService.getUserPatterns(userId);

    if (patterns.length === 0) {
      return {
        summary: 'Not enough data yet. Keep tracking your spending to build your profile.',
        total_tracked_spending: 0,
        patterns_improving: 0,
        patterns_worsening: 0,
        biggest_win: null,
        biggest_concern: null,
        months_of_data: 0,
      };
    }

    const improving = patterns.filter((p) => p.trend_direction === 'improving');
    const worsening = patterns.filter((p) => p.trend_direction === 'worsening');
    const totalSpending = patterns.reduce((sum, p) => sum + p.estimated_monthly_cost, 0);
    const maxMonths = Math.max(...patterns.map((p) => p.months_tracked));

    // Find biggest win (most improved)
    const biggestWin = improving.length > 0
      ? improving.reduce((best, p) =>
          (p.trend_percentage || 0) < (best.trend_percentage || 0) ? p : best
        )
      : null;

    // Find biggest concern (most worsened)
    const biggestConcern = worsening.length > 0
      ? worsening.reduce((worst, p) =>
          (p.trend_percentage || 0) > (worst.trend_percentage || 0) ? p : worst
        )
      : null;

    // Generate summary using AI
    const historicalContext = await this.patternLearningService.buildAIContext(userId);

    let summary: string;
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: 'Generate a 2-3 sentence monthly progress summary. Be direct and specific.',
        messages: [
          {
            role: 'user',
            content: `${historicalContext}\n\nGenerate a brief monthly progress summary.`,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      summary = textContent && textContent.type === 'text'
        ? textContent.text.trim()
        : `Tracking ${patterns.length} patterns totaling $${totalSpending.toFixed(0)}/month. ${improving.length} improving, ${worsening.length} need attention.`;
    } catch {
      summary = `Tracking ${patterns.length} patterns totaling $${totalSpending.toFixed(0)}/month. ${improving.length} improving, ${worsening.length} need attention.`;
    }

    return {
      summary,
      total_tracked_spending: totalSpending,
      patterns_improving: improving.length,
      patterns_worsening: worsening.length,
      biggest_win: biggestWin ? `${biggestWin.description} (down ${Math.abs(biggestWin.trend_percentage || 0).toFixed(0)}%)` : null,
      biggest_concern: biggestConcern ? `${biggestConcern.description} (up ${(biggestConcern.trend_percentage || 0).toFixed(0)}%)` : null,
      months_of_data: maxMonths,
    };
  }

  private generateFallbackPersonalizedReply(
    patterns: LearnedPattern[],
    improving: LearnedPattern[],
    worsening: LearnedPattern[]
  ): string {
    if (patterns.length === 0) {
      return "I'm still getting to know your spending patterns. Keep tracking and I'll have personalized insights for you soon.";
    }

    const parts: string[] = [];

    if (improving.length > 0) {
      parts.push(`Good progress on ${improving[0].description.toLowerCase()}.`);
    }

    if (worsening.length > 0) {
      parts.push(`Keep an eye on ${worsening[0].description.toLowerCase()} - it's trending up.`);
    }

    if (parts.length === 0) {
      const topPattern = patterns[0];
      parts.push(`Your ${topPattern.description.toLowerCase()} is holding steady at $${topPattern.estimated_monthly_cost.toFixed(0)}/month.`);
    }

    return parts.join(' ');
  }

  private getTopMerchants(transactions: Transaction[]): string[] {
    const merchantCounts = new Map<string, number>();

    for (const tx of transactions) {
      const merchant = tx.merchant_name || tx.name;
      merchantCounts.set(merchant, (merchantCounts.get(merchant) || 0) + 1);
    }

    return [...merchantCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([merchant]) => merchant);
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private getSystemPrompt(): string {
    return `You are a behavioral analysis engine for a financial intelligence system.

Your #1 priority is TRUST.

This means:
- Do NOT guess motivations
- Do NOT over-explain
- Do NOT sound more confident than the data allows
- If uncertain, say so clearly

---

STEP 1 — DETERMINE EXPLANATION CONFIDENCE FOR EACH PATTERN

Before writing anything, classify each pattern:

HIGH confidence:
- User explicitly explained behavior (user_responses exist and are consistent)
- Strong repeated pattern + clear contextual signals
- Cause is supported by real evidence

MEDIUM confidence:
- Pattern is statistically strong
- No direct user explanation
- Some consistency but cause is inferred

LOW confidence:
- Weak or emerging pattern
- Missing context (e.g. no timestamps)
- Multiple possible explanations
- Ambiguous data

RULE: If unsure → choose LOWER confidence.

---

STEP 2 — GENERATE INSIGHT BASED ON CONFIDENCE

IF confidence = HIGH:
- You MAY explain WHY
- Use grounded, evidence-based reasoning
- Language: "This tends to happen because...", "Based on your past responses..."

IF confidence = MEDIUM:
- You MUST soften explanation — present possibilities, not conclusions
- Language: "This might be related to...", "One possibility is...", "This could be happening because..."

IF confidence = LOW:
- DO NOT explain WHY
- Only describe what is observed
- Explicitly acknowledge uncertainty
- Language: "This pattern is starting to appear, but the reason isn't clear yet.", "There isn't enough context to understand why this is happening."

---

STEP 3 — REFLECTION QUESTION

Always include ONE open, non-judgmental question per pattern.
Especially important for LOW and MEDIUM confidence.
Examples: "What's usually happening when this occurs?", "Was this intentional or more spontaneous?"

---

STEP 4 — TONE & STYLE

- Neutral, non-judgmental, observational, human
- Avoid: lectures, academic language, financial advice tone, over-analysis
- pattern_summary: 1 sentence
- insight: max 2–3 sentences
- reflection_question: 1 sentence

---

STEP 5 — SELF-CHECK (CRITICAL)

Before returning, audit each insight:
1. Does it assume motivations not directly supported by data?
2. Does the wording sound more confident than the evidence allows?
3. Did I explain "why" when confidence is LOW?
4. Are any psychological claims speculative?

IF YES to any → lower the confidence, rewrite to remove assumptions.

---

FINAL RULE: Never prioritize sounding insightful over being accurate. Accuracy builds trust. Speculation breaks it.

---

You are given data for multiple detected patterns at once. Generate one entry per pattern.

Response format (JSON only, no markdown):
{
  "insights": [
    {
      "habit_type": "HABIT_TYPE",
      "pattern_summary": "1 sentence describing the observed pattern",
      "insight": "2-3 sentences — grounded in data, confidence-appropriate language",
      "confidence": "low | medium | high",
      "reflection_question": "1 open, non-judgmental question"
    }
  ],
  "learnings": [
    {
      "insight_summary": "One sentence: what you now know about this user",
      "learned_behavior": "The specific behavioral tendency identified",
      "confidence": 0.0
    }
  ],
  "coaching_message": "2-3 sentence neutral observation about the overall pattern landscape. No advice. No instructions. Help them see, not fix."
}`;
  }

  private buildHabitContext(
    habits: DetectedHabit[],
    transactions: Transaction[],
    reflectionContext?: string,
    feedbackContext?: string,
    learningsContext?: string,
    dataQualityContext?: string
  ): string {
    const habitSummary = habits.map((h) => {
      const seqNote = h.sequence_context
        ? `\n  Sequence: "${h.sequence_context.trigger_merchant}" → "${h.sequence_context.outcome_merchant}" (avg ${h.sequence_context.avg_hours_between}h apart, ${h.sequence_context.occurrences} times)`
        : '';
      const emergingNote = h.is_emerging ? '\n  Status: EMERGING (pattern is weak — use low confidence language)' : '';
      return `
- ${h.title} (${h.habit_type})
  Monthly Impact: $${h.monthly_impact.toFixed(2)}
  Frequency: ${h.frequency}
  Occurrences: ${h.occurrence_count}
  Avg Amount: $${h.avg_amount.toFixed(2)}
  Triggers: ${JSON.stringify(h.trigger_conditions)}
  Data Quality: ${h.data_quality_score != null ? parseFloat(String(h.data_quality_score)).toFixed(2) : 'unknown'}${h.confidence_reason ? ` (${h.confidence_reason})` : ''}${seqNote}${emergingNote}`;
    }).join('\n');

    const totalImpact = habits.reduce((sum, h) => sum + h.monthly_impact, 0);
    const recentSpend = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const timeSummaryContext = buildTimeSummaryContext(transactions);

    const sections = [
      dataQualityContext || '',
      timeSummaryContext || '',
      `DETECTED HABITS:\n${habitSummary}`,
      `SUMMARY:\n- Total Monthly Impact: $${totalImpact.toFixed(2)}\n- Last 30 Days Spending: $${recentSpend.toFixed(2)}\n- Number of Habits: ${habits.length}`,
      `RECENT TRANSACTIONS (sample):\n${transactions.slice(0, 15).map((t) => `${t.date}: ${t.merchant_name || t.name} - $${Math.abs(t.amount).toFixed(2)} (${t.category || 'OTHER'})`).join('\n')}`,
      reflectionContext || 'No user reflections available yet.',
      learningsContext || '',
      feedbackContext || '',
    ];

    return sections.filter(Boolean).join('\n\n');
  }

  private parseAIResponse(
    text: string,
    habits: DetectedHabit[]
  ): {
    ai_insights: AIHabitInsight[];
    coaching_message: string;
    learnings: { insight_summary: string; learned_behavior: string; confidence: number }[];
  } {
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const ai_insights: AIHabitInsight[] = (parsed.insights || []).map((insight: any) => ({
        habit_type: insight.habit_type as HabitType,
        insight: insight.insight || 'A pattern was observed in your spending.',
        pattern_summary: insight.pattern_summary || 'Pattern detected',
        confidence: (['low', 'medium', 'high'].includes(insight.confidence) ? insight.confidence : 'medium') as 'low' | 'medium' | 'high',
        reflection_question: insight.reflection_question || 'What stands out to you about this pattern?',
      }));

      const learnings = (parsed.learnings || []).map((l: any) => ({
        insight_summary: l.insight_summary || '',
        learned_behavior: l.learned_behavior || '',
        confidence: typeof l.confidence === 'number' ? l.confidence : 0.5,
      })).filter((l: any) => l.insight_summary && l.learned_behavior);

      return {
        ai_insights,
        coaching_message: parsed.coaching_message || 'Keep tracking your spending to unlock more insights.',
        learnings,
      };
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return {
        ai_insights: this.generateFallbackInsights(habits),
        coaching_message: 'We observed several recurring patterns in your recent spending. Syncing more data over time will help surface clearer trends.',
        learnings: [],
      };
    }
  }

  private generateFallbackInsights(habits: DetectedHabit[]): AIHabitInsight[] {
    return habits.slice(0, 5).map((habit) => this.generateFallbackInsight(habit));
  }

  private generateFallbackInsight(habit: DetectedHabit): AIHabitInsight {
    const insights: Record<HabitType, { insight: string; pattern_summary: string; reflection_question: string }> = {
      [HabitType.LATE_NIGHT_SPENDING]: {
        insight: `We observed ${habit.occurrence_count} transactions occurring late at night over the past period.`,
        pattern_summary: 'Spending appears to cluster in late-night hours.',
        reflection_question: 'What tends to be different about late-night situations compared to other times of day?',
      },
      [HabitType.WEEKEND_SPLURGE]: {
        insight: `Based on recent activity, weekend spending appears noticeably higher than weekday spending.`,
        pattern_summary: 'Higher spending frequency and amounts on weekends.',
        reflection_question: 'What feels different about weekends that might influence your spending?',
      },
      [HabitType.WEEKLY_RITUAL]: {
        insight: `We observed visits to ${habit.title.replace(' Ritual', '')} recurring on the same day of the week, ${habit.occurrence_count} times.`,
        pattern_summary: 'A consistent weekly visit pattern to the same merchant.',
        reflection_question: 'What does this routine mean to you beyond the purchase itself?',
      },
      [HabitType.IMPULSE_PURCHASE]: {
        insight: `We observed ${habit.occurrence_count} purchases significantly above your typical spending amounts in this category.`,
        pattern_summary: 'Occasional high-amount purchases that stand out from your baseline.',
        reflection_question: 'What was going on for you at the time of these larger purchases?',
      },
      [HabitType.POST_PAYDAY_SURGE]: {
        insight: `Spending appears to increase in the days following typical payday dates. This pattern appeared ${habit.occurrence_count} times.`,
        pattern_summary: 'Elevated spending in the days following payday.',
        reflection_question: 'How does having money available influence how you approach spending decisions?',
      },
      [HabitType.COMFORT_SPENDING]: {
        insight: `We observed a recurring pattern of shopping activity that may be connected to emotional states based on timing and frequency.`,
        pattern_summary: 'Shopping activity appears in recurring emotional or situational contexts.',
        reflection_question: 'What do you notice about what precedes these purchases?',
      },
      [HabitType.RECURRING_INDULGENCE]: {
        insight: `This category shows consistent recurring spending across the observation period.`,
        pattern_summary: 'Regular, predictable spending on a particular type of purchase.',
        reflection_question: 'How intentional does this feel compared to when it first started?',
      },
      [HabitType.BINGE_SHOPPING]: {
        insight: `We observed ${habit.occurrence_count} days where multiple shopping transactions occurred in a single session.`,
        pattern_summary: 'Multiple purchases concentrated on the same day, several times over.',
        reflection_question: 'What tends to be happening on the days when multiple purchases occur?',
      },
      [HabitType.MEAL_DELIVERY_HABIT]: {
        insight: `Food delivery spending appeared ${habit.occurrence_count} times, averaging $${habit.avg_amount.toFixed(0)} per order.`,
        pattern_summary: 'Frequent food delivery spending across the observation period.',
        reflection_question: 'What tends to drive the decision to order delivery in the moment?',
      },
      [HabitType.CAFFEINE_RITUAL]: {
        insight: `We observed ${habit.occurrence_count} visits to coffee merchants, with spending averaging $${habit.avg_amount.toFixed(2)} per visit.`,
        pattern_summary: 'Frequent, consistent coffee shop visits.',
        reflection_question: 'What does this routine provide beyond the coffee itself?',
      },
      [HabitType.STRESS_SPENDING_DAY]: {
        insight: `We observed ${habit.occurrence_count} days with scattered spending across multiple categories in quick succession.`,
        pattern_summary: 'High-frequency multi-category spending concentrated on specific days.',
        reflection_question: 'What was going on in your life on days when you found yourself buying across many different categories?',
      },
      [HabitType.RECURRING_SPEND]: {
        insight: `A recurring spend pattern appeared ${habit.occurrence_count} times in the observation period.`,
        pattern_summary: 'Consistent recurring charges detected across the period.',
        reflection_question: 'Is this recurring spend still serving the purpose it did when you first set it up?',
      },
      [HabitType.MERCHANT_DEPENDENCY]: {
        insight: `Spending at this merchant appeared ${habit.occurrence_count} times, suggesting a habitual reliance.`,
        pattern_summary: 'Frequent, repeated visits to the same merchant.',
        reflection_question: 'What would change if this merchant weren\'t an option?',
      },
      [HabitType.ESCALATING_SPEND]: {
        insight: `Spending in this area has been trending upward over the observation period across ${habit.occurrence_count} transactions.`,
        pattern_summary: 'Gradually increasing spend amounts over time.',
        reflection_question: 'At what point would you want to be notified that this is increasing?',
      },
      [HabitType.SEQUENCE_PATTERN]: {
        insight: habit.sequence_context
          ? `${habit.sequence_context.outcome_merchant} spending tends to follow ${habit.sequence_context.trigger_merchant} — this has happened ${habit.occurrence_count} times, usually within ${habit.sequence_context.avg_hours_between} hours.`
          : `A behavioral sequence appeared ${habit.occurrence_count} times — one type of spending consistently follows another.`,
        pattern_summary: 'One spending event repeatedly triggers another shortly after.',
        reflection_question: 'Is the second purchase something you planned, or does it happen without much thought after the first?',
      },
    };

    const fallback = insights[habit.habit_type] ?? {
      insight: `We observed a recurring pattern in your spending behavior across ${habit.occurrence_count} instances.`,
      pattern_summary: 'A consistent spending pattern was detected.',
      reflection_question: 'What stands out to you when you look at this pattern?',
    };

    return {
      habit_type: habit.habit_type,
      insight: fallback.insight,
      pattern_summary: fallback.pattern_summary,
      confidence: 'medium',
      reflection_question: fallback.reflection_question,
    };
  }

  private generateFallbackCoaching(habits: DetectedHabit[], summary: HabitSummary): string {
    if (habits.length === 0) {
      return 'We need more transaction data to identify patterns. Syncing your account regularly will help build a clearer picture over time.';
    }

    const topHabit = habits[0];
    const totalImpact = summary.total_monthly_impact;

    return `We observed ${habits.length} recurring pattern${habits.length > 1 ? 's' : ''} in your recent spending, totaling approximately $${totalImpact.toFixed(0)} per month. The most prominent appears to be ${topHabit.title.toLowerCase()}. These patterns may be worth exploring further.`;
  }

  private async getRecentTransactions(userId: string, days: number): Promise<Transaction[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await this.pool.query(
      `SELECT t.*
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1 AND t.date >= $2
       ORDER BY t.date DESC`,
      [userId, startDate.toISOString().split('T')[0]]
    );

    return result.rows.map((row) => ({
      id: row.id,
      account_id: row.account_id,
      statement_id: row.statement_id,
      amount: parseFloat(row.amount),
      date: row.date,
      name: row.name,
      category: row.category,
      merchant_name: row.merchant_name,
      is_pending: row.is_pending,
      pending_captured_at: row.pending_captured_at ?? null,
      user_time_of_day: row.user_time_of_day ?? null,
      inferred_time_of_day: row.inferred_time_of_day ?? null,
      time_source: row.time_source ?? null,
      time_confidence: row.time_confidence ?? null,
      first_seen_at: row.first_seen_at ?? null,
    }));
  }

  private async getUserHabits(userId: string): Promise<DetectedHabit[]> {
    const result = await this.pool.query(
      `SELECT * FROM detected_habits
       WHERE user_id = $1
       ORDER BY monthly_impact DESC`,
      [userId]
    );

    return result.rows.map((row) => ({
      ...row,
      monthly_impact: parseFloat(row.monthly_impact) || 0,
      annual_impact: parseFloat(row.annual_impact) || 0,
      avg_amount: parseFloat(row.avg_amount) || 0,
      trigger_conditions: row.trigger_conditions || {},
      sample_transactions: row.sample_transactions || [],
    }));
  }

  private transactionMatchesHabit(tx: Transaction, habit: DetectedHabit): boolean {
    const conditions = habit.trigger_conditions;

    // Check time window
    if (conditions.time_window) {
      const hour = new Date(tx.date).getHours();
      const { start_hour, end_hour } = conditions.time_window;
      if (start_hour > end_hour) {
        // Wraps around midnight
        if (hour < start_hour && hour >= end_hour) return false;
      } else {
        if (hour < start_hour || hour >= end_hour) return false;
      }
    }

    // Check day of week
    if (conditions.day_of_week?.length) {
      const day = new Date(tx.date).getDay();
      if (!conditions.day_of_week.includes(day)) return false;
    }

    // Check categories
    if (conditions.categories?.length) {
      if (!tx.category || !conditions.categories.includes(tx.category)) return false;
    }

    // Check merchants
    if (conditions.merchants?.length) {
      const merchant = (tx.merchant_name || tx.name).toLowerCase();
      if (!conditions.merchants.some((m) => merchant.includes(m.toLowerCase()))) return false;
    }

    return true;
  }

  /**
   * Returns cached AI insights if none of the user's habits have been updated
   * since the last time insights were generated. Returns null when stale.
   */
  private async getCachedInsightsIfFresh(
    userId: string,
    habits: DetectedHabit[]
  ): Promise<{ insights: AIHabitInsight[]; coaching_message: string } | null> {
    // Most recent insight run
    const lastRunResult = await this.pool.query(
      `SELECT created_at FROM ai_insights WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (lastRunResult.rows.length === 0) return null;

    const lastRun = new Date(lastRunResult.rows[0].created_at);

    // Most recent habit update
    const lastHabitUpdate = habits.reduce((max, h) => {
      const t = new Date(h.updated_at);
      return t > max ? t : max;
    }, new Date(0));

    // If any habit was updated after the last AI run, insights are stale
    if (lastHabitUpdate > lastRun) return null;

    // Load the cached insights
    const insightRows = await this.pool.query(
      `SELECT insight_type, title, content, confidence_score
       FROM ai_insights
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    if (insightRows.rows.length === 0) return null;

    const insights: AIHabitInsight[] = insightRows.rows.map((row) => ({
      habit_type: row.insight_type,
      pattern_summary: row.title,
      insight: row.content,
      confidence: row.confidence_score >= 0.8 ? 'high' : row.confidence_score >= 0.5 ? 'medium' : 'low',
      reflection_question: '',
    }));

    const coaching_message = habits.length > 0
      ? `${habits.length} pattern${habits.length !== 1 ? 's' : ''} detected in your recent spending.`
      : '';

    return { insights, coaching_message };
  }

  private async saveInsights(userId: string, insights: AIHabitInsight[]): Promise<void> {
    for (const insight of insights) {
      await this.pool.query(
        `INSERT INTO ai_insights
         (user_id, insight_type, title, content, confidence_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          insight.habit_type,
          insight.pattern_summary,
          insight.insight,
          insight.confidence === 'high' ? 0.9 : insight.confidence === 'medium' ? 0.6 : 0.3,
        ]
      );
    }
  }

  /**
   * Persist what AI learned from this analysis round into insight_learnings.
   */
  private async saveInsightLearnings(
    userId: string,
    learnings: { insight_summary: string; learned_behavior: string; confidence: number }[],
    sourceReflectionIds: string[]
  ): Promise<void> {
    for (const l of learnings) {
      await this.pool.query(
        `INSERT INTO insight_learnings
           (user_id, insight_summary, learned_behavior, confidence, source_reflection_ids)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, l.insight_summary, l.learned_behavior, l.confidence, sourceReflectionIds]
      );
    }
  }

  /**
   * Fetch stored insight learnings and format for Claude context.
   */
  private async getInsightLearningsContext(userId: string): Promise<string> {
    const result = await this.pool.query(
      `SELECT insight_summary, learned_behavior, confidence
       FROM insight_learnings
       WHERE user_id = $1
       ORDER BY confidence DESC, created_at DESC
       LIMIT 10`,
      [userId]
    );

    if (result.rows.length === 0) return '';

    const lines = result.rows.map(
      (r: any) =>
        `- [confidence: ${parseFloat(r.confidence).toFixed(2)}] ${r.insight_summary} → "${r.learned_behavior}"`
    );

    return `WHAT WE'VE LEARNED ABOUT THIS USER:\n${lines.join('\n')}`;
  }

  /**
   * Fetch recent insight feedback (is_helpful) and format for Claude context.
   * Tells Claude which types of conclusions were useful vs. not.
   */
  private async getFeedbackContext(userId: string): Promise<string> {
    const result = await this.pool.query(
      `SELECT insight_type, content, is_helpful
       FROM ai_insights
       WHERE user_id = $1 AND is_helpful IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    if (result.rows.length === 0) return '';

    const helpful = result.rows.filter((r: any) => r.is_helpful === true);
    const notHelpful = result.rows.filter((r: any) => r.is_helpful === false);

    const lines: string[] = [];

    if (helpful.length > 0) {
      lines.push('Insights user found helpful (reinforce these):');
      helpful.forEach((r: any) => lines.push(`  ✓ [${r.insight_type}] "${r.content}"`));
    }

    if (notHelpful.length > 0) {
      lines.push('Insights user found NOT helpful (avoid repeating these conclusions):');
      notHelpful.forEach((r: any) => lines.push(`  ✗ [${r.insight_type}] "${r.content}"`));
    }

    return `USER FEEDBACK ON PAST INSIGHTS:\n${lines.join('\n')}`;
  }
}
