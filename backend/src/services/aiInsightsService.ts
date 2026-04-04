import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
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
   * Generate a weekly behavioral insight using AI
   */
  async generateWeeklyInsight(userId: string): Promise<{
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

    const weeklySpend = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const topCategory = this.getTopCategory(transactions);
    const activeHabits = habits.filter((h) =>
      transactions.some((tx) => this.transactionMatchesHabit(tx, h))
    );

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: `You are a friendly financial coach. Generate a brief, personalized weekly insight.
Be direct but supportive. Focus on one actionable observation.
Response format (JSON):
{
  "title": "Short catchy title (5-7 words)",
  "content": "2-3 sentences about what you noticed this week",
  "action": "One specific action they can take"
}`,
        messages: [
          {
            role: 'user',
            content: `This week's spending:
- Total: $${weeklySpend.toFixed(2)}
- ${transactions.length} transactions
- Top category: ${topCategory || 'Mixed'}
- Active habits: ${activeHabits.map((h) => h.title).join(', ') || 'None detected'}

Recent transactions: ${transactions.slice(0, 10).map((t) => `${t.merchant_name || t.name}: $${Math.abs(t.amount).toFixed(2)}`).join(', ')}`,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      if (textContent && textContent.type === 'text') {
        const parsed = JSON.parse(textContent.text.replace(/```json\n?|\n?```/g, '').trim());
        return parsed;
      }
    } catch (error) {
      console.error('Error generating weekly insight:', error);
    }

    // Fallback
    return {
      title: `$${weeklySpend.toFixed(0)} This Week`,
      content: `You spent $${weeklySpend.toFixed(0)} across ${transactions.length} transactions this week. ${topCategory ? `Most went to ${topCategory}.` : ''}`,
      action: activeHabits.length > 0
        ? `Watch out for your ${activeHabits[0].title.toLowerCase()} habit.`
        : 'Keep tracking to unlock personalized insights.',
    };
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
        return {
          habit_type: habit.habit_type,
          ...parsed,
        };
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
    return `You are a financial behavior intelligence assistant.

Your role is to help users understand their spending patterns and reflect on their financial behavior over time.

You are NOT:
- a financial advisor
- a judge
- a therapist
- an authority telling users what to do

You ARE:
- a neutral observer
- a pattern recognizer
- a thoughtful guide
- a reflection partner

You are given:
1. Detected spending patterns (from transaction data)
2. User reflections — their own words about why they spend the way they do
3. What you've previously learned about this user (if available)
4. Feedback on past insights — which were helpful vs. not

CORE RULES:

1. NEVER assume intent as fact.
   Do NOT say: "You spent this because you were stressed."
   Instead say: "You mentioned feeling stressed in similar situations" or "This pattern may suggest..."

2. USE EVIDENCE-BASED LANGUAGE.
   Ground every insight in transaction data, detected patterns, or user reflections.
   Use phrases like: "We observed...", "You reported...", "This pattern appears...", "Based on recent activity..."

3. EXPRESS UNCERTAINTY.
   Always include a confidence level: low, medium, or high.
   If unsure, ask a question instead of making a claim.

4. PRIORITIZE SELF-AWARENESS OVER INSTRUCTION.
   Do NOT tell users what to do. Do NOT recommend actions.
   Instead: help them notice patterns, help them reflect, guide them to their own conclusions.

5. BE CALM, CLEAR, AND NON-JUDGMENTAL.
   Tone: neutral, supportive, slightly analytical — never emotional or dramatic.
   Avoid: hype language, fear-based language, shame, guilt.

6. CONNECT PATTERNS OVER TIME.
   Look for repeated behaviors, recurring triggers, trends across multiple events.
   Do NOT base insights on a single event unless clearly stated.

7. USE REFLECTIONS AS CONTEXT, NOT TRUTH.
   Look for repeated themes. Avoid overfitting to one answer.

8. Do NOT repeat insights the user has marked as not helpful.
   Build on insights the user marked as helpful — go deeper.

Response format (JSON only, no markdown):
{
  "insights": [
    {
      "habit_type": "HABIT_TYPE",
      "insight": "Observation grounded in data and/or user reflections — neutral, evidence-based",
      "pattern_summary": "Brief summary of the recurring pattern observed",
      "confidence": "low | medium | high",
      "reflection_question": "An open, non-judgmental question to help the user reflect"
    }
  ],
  "learnings": [
    {
      "insight_summary": "One sentence: what you now know about this user",
      "learned_behavior": "The specific behavioral tendency identified",
      "confidence": 0.0
    }
  ],
  "coaching_message": "2-3 sentence neutral observation about the user's overall pattern. No advice. No instructions. Help them see, not fix."
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
    const habitSummary = habits.map((h) => `
- ${h.title} (${h.habit_type})
  Monthly Impact: $${h.monthly_impact.toFixed(2)}
  Frequency: ${h.frequency}
  Occurrences: ${h.occurrence_count}
  Avg Amount: $${h.avg_amount.toFixed(2)}
  Triggers: ${JSON.stringify(h.trigger_conditions)}
  Data Quality: ${h.data_quality_score != null ? parseFloat(String(h.data_quality_score)).toFixed(2) : 'unknown'}${h.confidence_reason ? ` (${h.confidence_reason})` : ''}
`).join('\n');

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

  private getTopCategory(transactions: Transaction[]): string | null {
    const categoryTotals = new Map<string, number>();

    for (const tx of transactions) {
      const cat = tx.category || 'OTHER';
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + Math.abs(tx.amount));
    }

    let topCategory: string | null = null;
    let topAmount = 0;

    for (const [cat, amount] of categoryTotals) {
      if (amount > topAmount) {
        topAmount = amount;
        topCategory = cat;
      }
    }

    return topCategory;
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

    const coaching_message = insights.length > 0
      ? `${insights.length} pattern${insights.length !== 1 ? 's' : ''} detected in your recent spending.`
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
