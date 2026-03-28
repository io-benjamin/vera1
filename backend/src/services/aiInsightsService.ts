import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import {
  DetectedHabit,
  HabitType,
  AIHabitInsight,
  HabitsResponse,
  Transaction,
  TransactionCategory,
  HabitSummary,
  LearnedPattern,
  InsightLearning,
} from '../models/types';
import { PatternLearningService } from './patternLearningService';
import { ReflectionService } from './reflectionService';

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

  constructor(pool: Pool) {
    this.pool = pool;
    this.patternLearningService = new PatternLearningService(pool);
    this.reflectionService = new ReflectionService(pool);
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
        coaching_message: "We need more transaction data to identify your spending patterns. Upload a few more statements and we'll give you personalized insights.",
      };
    }

    // Get all context in parallel
    const [transactions, reflectionContext, feedbackContext, learningsContext] = await Promise.all([
      this.getRecentTransactions(userId, 30),
      this.reflectionService.buildReflectionContext(userId),
      this.getFeedbackContext(userId),
      this.getInsightLearningsContext(userId),
    ]);

    const habitContext = this.buildHabitContext(
      habits,
      transactions,
      reflectionContext,
      feedbackContext,
      learningsContext
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
        action: 'Upload more statements to unlock insights',
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
    return `You are a behavioral financial analyst building a cumulative understanding of a user's financial behavior.

You are given:
1. Detected spending patterns (from transaction data)
2. User reflections — their own words about why they spend the way they do
3. What you've previously learned about this user (if available)
4. Feedback on past insights — which conclusions were helpful vs. not

Your job:
- Identify recurring behavioral themes by connecting patterns AND reflections
- Do NOT treat a single reflection as absolute truth — look for themes across multiple responses
- When a user's reflections explain a pattern, weight that explanation heavily
- When confidence is low, say so explicitly and ask a question instead of stating a conclusion
- Do NOT repeat insights the user has marked as not helpful
- Build on insights the user marked as helpful — go deeper into those patterns

Rules:
- Never assume user intent as fact
- Be direct but non-judgmental — curious, not critical
- If you don't have enough information, say what you'd want to know
- Prefer a precise low-confidence insight over a vague high-confidence one

Response format (JSON):
{
  "insights": [
    {
      "habit_type": "HABIT_TYPE",
      "psychological_trigger": "What drives this behavior, using their own words where available",
      "behavioral_pattern": "The underlying pattern connecting transactions and reflections",
      "recommended_intervention": "Specific action, grounded in what they told you",
      "difficulty_to_change": "easy" | "moderate" | "hard",
      "potential_savings": <number>,
      "confidence": <0.0 to 1.0>,
      "alternative_suggestions": ["alternative 1", "alternative 2", "alternative 3"]
    }
  ],
  "learnings": [
    {
      "insight_summary": "One sentence: what you now know about this user",
      "learned_behavior": "The specific behavioral tendency identified",
      "confidence": <0.0 to 1.0>
    }
  ],
  "coaching_message": "2-3 sentence direct message using what you know about this user specifically"
}`;
  }

  private buildHabitContext(
    habits: DetectedHabit[],
    transactions: Transaction[],
    reflectionContext?: string,
    feedbackContext?: string,
    learningsContext?: string
  ): string {
    const habitSummary = habits.map((h) => `
- ${h.title} (${h.habit_type})
  Monthly Impact: $${h.monthly_impact.toFixed(2)}
  Frequency: ${h.frequency}
  Occurrences: ${h.occurrence_count}
  Avg Amount: $${h.avg_amount.toFixed(2)}
  Triggers: ${JSON.stringify(h.trigger_conditions)}
`).join('\n');

    const totalImpact = habits.reduce((sum, h) => sum + h.monthly_impact, 0);
    const recentSpend = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const sections = [
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
        psychological_trigger: insight.psychological_trigger || 'Unknown trigger',
        behavioral_pattern: insight.behavioral_pattern || 'Pattern detected',
        recommended_intervention: insight.recommended_intervention || 'Review this habit',
        difficulty_to_change: insight.difficulty_to_change || 'moderate',
        potential_savings: insight.potential_savings || 0,
        alternative_suggestions: insight.alternative_suggestions || [],
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
        coaching_message: 'Focus on your biggest habit first. Small changes add up.',
        learnings: [],
      };
    }
  }

  private generateFallbackInsights(habits: DetectedHabit[]): AIHabitInsight[] {
    return habits.slice(0, 5).map((habit) => this.generateFallbackInsight(habit));
  }

  private generateFallbackInsight(habit: DetectedHabit): AIHabitInsight {
    const insights: Record<HabitType, Partial<AIHabitInsight>> = {
      [HabitType.LATE_NIGHT_SPENDING]: {
        psychological_trigger: 'Fatigue and lowered impulse control',
        behavioral_pattern: 'Decision fatigue makes late-night purchases feel justified',
        recommended_intervention: 'Remove saved payment methods from apps you browse at night',
        difficulty_to_change: 'moderate',
        alternative_suggestions: ['Make a "sleep on it" rule for purchases after 9pm', 'Set app timers', 'Keep a wishlist instead of buying'],
      },
      [HabitType.WEEKEND_SPLURGE]: {
        psychological_trigger: 'Reward-seeking after a week of work',
        behavioral_pattern: 'Weekend = freedom mindset leads to looser spending',
        recommended_intervention: 'Set a specific weekend fun budget in cash',
        difficulty_to_change: 'moderate',
        alternative_suggestions: ['Plan free activities', 'Use a separate weekend card with a limit', 'Find rewards that don\'t cost money'],
      },
      [HabitType.WEEKLY_RITUAL]: {
        psychological_trigger: 'Comfort and routine-seeking',
        behavioral_pattern: 'The ritual itself provides comfort, not just the purchase',
        recommended_intervention: 'Keep the ritual, reduce the cost - make coffee at home before going',
        difficulty_to_change: 'easy',
        alternative_suggestions: ['Reduce frequency by one day', 'Downsize your usual order', 'Bring your own and just enjoy the atmosphere'],
      },
      [HabitType.IMPULSE_PURCHASE]: {
        psychological_trigger: 'Dopamine hit from buying, not from owning',
        behavioral_pattern: 'The excitement fades quickly, leading to more purchases',
        recommended_intervention: '24-hour rule for any purchase over $30',
        difficulty_to_change: 'hard',
        alternative_suggestions: ['Add to cart but don\'t buy for 24h', 'Unsubscribe from retail emails', 'Delete shopping apps from phone'],
      },
      [HabitType.POST_PAYDAY_SURGE]: {
        psychological_trigger: 'Scarcity mindset followed by abundance feeling',
        behavioral_pattern: 'Money feels "available" right after payday',
        recommended_intervention: 'Set up automatic transfers on payday before you can spend',
        difficulty_to_change: 'moderate',
        alternative_suggestions: ['Pay yourself first with auto-savings', 'Use envelope budgeting', 'Pretend payday is 3 days later'],
      },
      [HabitType.COMFORT_SPENDING]: {
        psychological_trigger: 'Using purchases to regulate emotions',
        behavioral_pattern: 'Shopping provides temporary relief from stress/boredom',
        recommended_intervention: 'Identify your top 3 non-purchase comfort activities',
        difficulty_to_change: 'hard',
        alternative_suggestions: ['Call a friend when tempted', 'Exercise instead', 'Set a "thinking" period before buying'],
      },
      [HabitType.RECURRING_INDULGENCE]: {
        psychological_trigger: 'Treating yourself has become automatic',
        behavioral_pattern: 'What started as occasional became expected',
        recommended_intervention: 'Make indulgences intentional - schedule them',
        difficulty_to_change: 'moderate',
        alternative_suggestions: ['Reduce frequency gradually', 'Find cheaper alternatives', 'Make it a real treat, not a habit'],
      },
      [HabitType.BINGE_SHOPPING]: {
        psychological_trigger: 'All-or-nothing thinking, emotional overwhelm',
        behavioral_pattern: 'One purchase opens the floodgates',
        recommended_intervention: 'Limit yourself to 3 items max per shopping session',
        difficulty_to_change: 'hard',
        alternative_suggestions: ['Shop with a list only', 'Leave cards at home', 'Wait a week between shopping trips'],
      },
      [HabitType.MEAL_DELIVERY_HABIT]: {
        psychological_trigger: 'Convenience addiction, decision fatigue around food',
        behavioral_pattern: 'Delivery feels "necessary" but costs 3x cooking',
        recommended_intervention: 'Meal prep on Sundays to remove the decision burden',
        difficulty_to_change: 'moderate',
        alternative_suggestions: ['Batch cook simple meals', 'Keep easy backup meals frozen', 'Delete delivery apps for a week'],
      },
      [HabitType.CAFFEINE_RITUAL]: {
        psychological_trigger: 'Social ritual, productivity cue, caffeine dependency',
        behavioral_pattern: 'The coffee shop trip is about more than coffee',
        recommended_intervention: 'Make great coffee at home, save shop visits for socializing',
        difficulty_to_change: 'easy',
        alternative_suggestions: ['Invest in good home coffee', 'Reduce visits by 2/week', 'Order smaller sizes'],
      },
    };

    const defaultInsight = insights[habit.habit_type] || {
      psychological_trigger: 'Habitual behavior pattern',
      behavioral_pattern: 'This has become automatic spending',
      recommended_intervention: 'Track this for a week consciously',
      difficulty_to_change: 'moderate' as const,
      alternative_suggestions: ['Pause before each purchase', 'Ask if you need it or want it', 'Find a free alternative'],
    };

    return {
      habit_type: habit.habit_type,
      psychological_trigger: defaultInsight.psychological_trigger!,
      behavioral_pattern: defaultInsight.behavioral_pattern!,
      recommended_intervention: defaultInsight.recommended_intervention!,
      difficulty_to_change: defaultInsight.difficulty_to_change as 'easy' | 'moderate' | 'hard',
      potential_savings: habit.monthly_impact * 0.5, // Assume 50% reduction possible
      alternative_suggestions: defaultInsight.alternative_suggestions!,
    };
  }

  private generateFallbackCoaching(habits: DetectedHabit[], summary: HabitSummary): string {
    if (habits.length === 0) {
      return 'Upload more statements to unlock personalized insights about your spending patterns.';
    }

    const topHabit = habits[0];
    const totalImpact = summary.total_monthly_impact;

    if (totalImpact > 500) {
      return `Your habits are costing you $${totalImpact.toFixed(0)}/month. That's real money. Start with ${topHabit.title.toLowerCase()} - it's your biggest leak.`;
    } else if (totalImpact > 200) {
      return `$${totalImpact.toFixed(0)}/month in habit spending. Not terrible, but there's room to improve. Your ${topHabit.title.toLowerCase()} is worth addressing first.`;
    } else {
      return `$${totalImpact.toFixed(0)}/month in detected habits. You're doing okay, but small improvements add up. Keep an eye on ${topHabit.title.toLowerCase()}.`;
    }
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

  private async saveInsights(userId: string, insights: AIHabitInsight[]): Promise<void> {
    for (const insight of insights) {
      await this.pool.query(
        `INSERT INTO ai_insights
         (user_id, insight_type, title, content, psychological_trigger,
          recommended_action, potential_savings, confidence_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          insight.habit_type,
          `${insight.habit_type} Insight`,
          insight.behavioral_pattern,
          insight.psychological_trigger,
          insight.recommended_intervention,
          insight.potential_savings,
          0.8,
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
