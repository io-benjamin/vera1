import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import { authMiddleware } from '../middleware/auth';
import { Transaction, DetectedHabit, SpendingPersonality } from '../models/types';

const router = Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * AI Coach System Prompt - Supportive Friend Persona
 *
 * The AI should:
 * - Be encouraging and non-judgmental
 * - Celebrate wins, be gentle with setbacks
 * - Reference specific merchants by name
 * - Provide actionable advice
 * - Focus on patterns, not individual purchases
 */
const COACH_SYSTEM_PROMPT = `You are a supportive financial friend helping someone understand their spending.

Your personality:
- Warm and encouraging, like a good friend who happens to be great with money
- Non-judgmental - you understand that life happens and spending isn't always perfect
- Celebrate wins genuinely, no matter how small
- Gentle with setbacks - acknowledge them without making the person feel bad
- Direct but kind - you tell the truth, but with empathy

Your analysis approach:
- Reference specific merchants by name (e.g., "You spent $47 at Starbucks 8 times this month")
- Focus on patterns, not individual purchases
- Identify spending triggers (time of day, day of week, emotional states)
- Suggest practical alternatives, not just "stop spending"
- Frame savings in terms of goals they might have

Response format (JSON):
{
  "greeting": "A warm, personalized greeting acknowledging something specific from their data",
  "spending_summary": {
    "total_this_month": <number>,
    "top_merchants": [{"name": "Merchant", "amount": <number>, "count": <number>}],
    "insight": "One sentence about their overall spending pattern"
  },
  "patterns_found": [
    {
      "title": "Short title for the pattern",
      "description": "What you noticed, with specific numbers and merchant names",
      "impact": "How much this costs them monthly/yearly",
      "suggestion": "A friendly, practical suggestion"
    }
  ],
  "wins": ["List any positive patterns or improvements you notice"],
  "focus_area": {
    "title": "One thing to focus on this week",
    "why": "Why this matters",
    "action": "Specific action to take"
  },
  "encouragement": "A warm closing message that motivates without being cheesy"
}`;

/**
 * GET /api/analysis
 * Get comprehensive AI analysis of spending patterns
 */
router.get('/', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    // Gather all data in parallel
    const [transactions, habits, personality] = await Promise.all([
      getRecentTransactions(userId, 30),
      getUserHabits(userId),
      getUserPersonality(userId),
    ]);

    if (transactions.length < 5) {
      return res.json({
        analysis: {
          greeting: "Hey! I don't have enough data to give you meaningful insights yet.",
          spending_summary: null,
          patterns_found: [],
          wins: [],
          focus_area: null,
          encouragement: "Keep tracking your spending and I'll have personalized insights for you soon!",
        },
        has_enough_data: false,
      });
    }

    // Build context for AI
    const context = buildAnalysisContext(transactions, habits, personality);

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: COACH_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Please analyze this spending data and provide insights:\n\n${context}`,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from AI');
      }

      const analysis = parseAIResponse(textContent.text);

      res.json({
        analysis,
        has_enough_data: true,
        data_points: {
          transaction_count: transactions.length,
          habits_detected: habits.length,
          personality_type: personality?.primary_type || null,
        },
      });
    } catch (aiError) {
      console.error('AI analysis error:', aiError);

      // Return fallback analysis
      res.json({
        analysis: generateFallbackAnalysis(transactions, habits, personality),
        has_enough_data: true,
        fallback: true,
      });
    }
  } catch (error) {
    console.error('Error in analysis route:', error);
    res.status(500).json({
      message: 'Failed to generate analysis',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/analysis/refresh
 * Force refresh AI analysis (regenerate)
 */
router.post('/refresh', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const [transactions, habits, personality] = await Promise.all([
      getRecentTransactions(userId, 30),
      getUserHabits(userId),
      getUserPersonality(userId),
    ]);

    if (transactions.length < 5) {
      return res.json({
        analysis: null,
        message: 'Not enough transaction data for analysis',
      });
    }

    const context = buildAnalysisContext(transactions, habits, personality);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: COACH_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please analyze this spending data and provide fresh insights:\n\n${context}`,
        },
      ],
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from AI');
    }

    const analysis = parseAIResponse(textContent.text);

    res.json({
      analysis,
      refreshed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error refreshing analysis:', error);
    res.status(500).json({
      message: 'Failed to refresh analysis',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// Helper Functions
// ============================================

async function getRecentTransactions(userId: string, days: number): Promise<Transaction[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await pool.query(
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
    amount: parseFloat(row.amount),
    date: row.date,
    name: row.name,
    category: row.category,
    merchant_name: row.merchant_name,
    is_pending: row.is_pending,
  }));
}

async function getUserHabits(userId: string): Promise<DetectedHabit[]> {
  const result = await pool.query(
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

async function getUserPersonality(userId: string): Promise<SpendingPersonality | null> {
  const result = await pool.query(
    `SELECT * FROM spending_personalities
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    ...row,
    confidence_score: parseFloat(row.confidence_score) || 0,
    damage_score: parseFloat(row.damage_score) || 0,
    behavior_patterns: row.behavior_patterns || {},
  };
}

function buildAnalysisContext(
  transactions: Transaction[],
  habits: DetectedHabit[],
  personality: SpendingPersonality | null
): string {
  // Calculate spending by merchant
  const merchantTotals = new Map<string, { amount: number; count: number }>();
  const categoryTotals = new Map<string, number>();
  let totalSpent = 0;

  for (const tx of transactions) {
    if (tx.amount > 0) {
      const amount = tx.amount;
      totalSpent += amount;

      const merchant = tx.merchant_name || tx.name;
      const existing = merchantTotals.get(merchant) || { amount: 0, count: 0 };
      merchantTotals.set(merchant, {
        amount: existing.amount + amount,
        count: existing.count + 1,
      });

      const cat = tx.category || 'OTHER';
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + amount);
    }
  }

  // Sort merchants by amount
  const topMerchants = Array.from(merchantTotals.entries())
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 10);

  // Sort categories by amount
  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Build time pattern analysis
  const timePatterns = analyzeTimePatterns(transactions);

  return `SPENDING OVERVIEW (Last 30 Days):
- Total Spent: $${totalSpent.toFixed(2)}
- Transaction Count: ${transactions.length}

TOP MERCHANTS (by spend):
${topMerchants.map(([name, data]) => `- ${name}: $${data.amount.toFixed(2)} (${data.count} transactions)`).join('\n')}

TOP CATEGORIES:
${topCategories.map(([cat, amount]) => `- ${cat}: $${amount.toFixed(2)}`).join('\n')}

TIME PATTERNS:
- Weekend spending: $${timePatterns.weekendSpend.toFixed(2)} (${timePatterns.weekendPercent.toFixed(0)}% of total)
- Late night (9pm-2am): $${timePatterns.lateNightSpend.toFixed(2)} (${timePatterns.lateNightPercent.toFixed(0)}% of total)
- Highest spend day: ${timePatterns.highestDay}

DETECTED HABITS:
${habits.length > 0 ? habits.map((h) => `- ${h.title}: $${h.monthly_impact.toFixed(2)}/month (${h.frequency})`).join('\n') : 'No habits detected yet'}

SPENDING PERSONALITY: ${personality ? personality.primary_type : 'Not analyzed yet'}

RECENT TRANSACTIONS (last 15):
${transactions.slice(0, 15).map((t) => `${t.date}: ${t.merchant_name || t.name} - $${Math.abs(t.amount).toFixed(2)} (${t.category || 'OTHER'})`).join('\n')}`;
}

function analyzeTimePatterns(transactions: Transaction[]): {
  weekendSpend: number;
  weekendPercent: number;
  lateNightSpend: number;
  lateNightPercent: number;
  highestDay: string;
} {
  let totalSpend = 0;
  let weekendSpend = 0;
  let lateNightSpend = 0;
  const dayTotals = new Map<number, number>();

  for (const tx of transactions) {
    if (tx.amount > 0) {
      const amount = tx.amount;
      totalSpend += amount;

      const date = new Date(tx.date);
      const day = date.getDay();
      const hour = date.getHours();

      // Weekend (Sat=6, Sun=0)
      if (day === 0 || day === 6) {
        weekendSpend += amount;
      }

      // Late night (9pm to 2am)
      if (hour >= 21 || hour < 2) {
        lateNightSpend += amount;
      }

      dayTotals.set(day, (dayTotals.get(day) || 0) + amount);
    }
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let highestDay = 'Monday';
  let highestAmount = 0;
  for (const [day, amount] of dayTotals) {
    if (amount > highestAmount) {
      highestAmount = amount;
      highestDay = dayNames[day];
    }
  }

  return {
    weekendSpend,
    weekendPercent: totalSpend > 0 ? (weekendSpend / totalSpend) * 100 : 0,
    lateNightSpend,
    lateNightPercent: totalSpend > 0 ? (lateNightSpend / totalSpend) * 100 : 0,
    highestDay,
  };
}

function parseAIResponse(text: string): any {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('Error parsing AI response:', error);
    return {
      greeting: "Hey! I analyzed your spending.",
      spending_summary: null,
      patterns_found: [],
      wins: ["You're tracking your spending - that's the first step!"],
      focus_area: null,
      encouragement: "Keep going! Every bit of awareness helps.",
    };
  }
}

function generateFallbackAnalysis(
  transactions: Transaction[],
  habits: DetectedHabit[],
  personality: SpendingPersonality | null
): any {
  const totalSpent = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  // Find top merchant
  const merchantTotals = new Map<string, { amount: number; count: number }>();
  for (const tx of transactions) {
    if (tx.amount > 0) {
      const merchant = tx.merchant_name || tx.name;
      const existing = merchantTotals.get(merchant) || { amount: 0, count: 0 };
      merchantTotals.set(merchant, {
        amount: existing.amount + tx.amount,
        count: existing.count + 1,
      });
    }
  }

  const topMerchants = Array.from(merchantTotals.entries())
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 3)
    .map(([name, data]) => ({ name, amount: data.amount, count: data.count }));

  return {
    greeting: `Hey! I looked at your spending from the last 30 days.`,
    spending_summary: {
      total_this_month: totalSpent,
      top_merchants: topMerchants,
      insight: topMerchants.length > 0
        ? `Your top spend is at ${topMerchants[0].name} with ${topMerchants[0].count} visits.`
        : 'Keep tracking to see your patterns.',
    },
    patterns_found: habits.slice(0, 3).map((h) => ({
      title: h.title,
      description: h.description,
      impact: `$${h.monthly_impact.toFixed(0)}/month`,
      suggestion: 'Try cutting back by one or two visits this week.',
    })),
    wins: ['You\'re tracking your spending - awareness is the first step!'],
    focus_area: habits.length > 0 ? {
      title: `Reduce ${habits[0].title}`,
      why: `This habit costs you $${habits[0].monthly_impact.toFixed(0)}/month`,
      action: 'Try going one extra day without this purchase this week',
    } : null,
    encouragement: 'You\'re doing great by paying attention to your money. Small steps lead to big changes!',
  };
}

export default router;
