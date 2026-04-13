import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
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
const COACH_SYSTEM_PROMPT = `You are writing a behavioral spending analysis for a financial intelligence app called Vera.

ROLE: Observer, not advisor. You describe what you see — you do not prescribe what to do.

TONE:
- Calm and neutral
- Observational and interpretive
- Human, not clinical
- Never alarming, never cheerleading

STRICT RULES:
- Do NOT give advice or suggestions
- Do NOT say "you should", "try to", "consider", "I recommend"
- Do NOT use words like: "alert", "warning", "concerning", "significantly", "great job"
- Do NOT moralize about spending
- Reference specific merchants by name when available (e.g., "Starbucks appeared 8 times")

PREFERRED PHRASES:
- "It looks like..."
- "There's a pattern here..."
- "This tends to happen when..."
- "Most of the activity..."
- "This week..."

GOOD EXAMPLE for a pattern description:
"Starbucks appeared 8 times this month — most of them before 9am. This tends to be a morning anchor, not just a coffee habit."

BAD EXAMPLE:
"You spend too much on coffee. You should consider making coffee at home to save money."

Return valid JSON matching this structure exactly:
{
  "greeting": "One sentence interpreting the overall shape of their month — specific, not generic",
  "spending_summary": {
    "total_this_month": <number>,
    "top_merchants": [{"name": "Merchant", "amount": <number>, "count": <number>}],
    "insight": "One sentence describing the dominant behavioral pattern this month"
  },
  "patterns_found": [
    {
      "title": "Short pattern name (3–5 words)",
      "description": "What you observed — specific numbers, merchants, timing. No advice.",
      "impact": "Monthly cost as a number only, e.g. '$140/month'",
      "suggestion": ""
    }
  ],
  "wins": ["One observation of something consistent or stable — not praise, just a neutral note"],
  "focus_area": {
    "title": "The most prominent behavior this month",
    "why": "Why this pattern tends to emerge — behavioral context, not judgment",
    "action": ""
  },
  "encouragement": "One quiet closing observation about what the data says overall"
}`;

/** Build a fingerprint from the current data state so we know when to regenerate */
function buildFingerprint(transactions: Transaction[], habits: DetectedHabit[]): string {
  const latestTxDate = transactions[0]?.date ?? 'none';
  const habitState = habits.map((h) => `${h.id}:${h.trend}`).sort().join('|');
  return createHash('md5')
    .update(`${transactions.length}:${latestTxDate}:${habitState}`)
    .digest('hex');
}

/**
 * GET /api/analysis
 * Returns cached analysis if data hasn't changed; calls Claude only when needed.
 */
router.get('/', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

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

    const fingerprint = buildFingerprint(transactions, habits);

    // Return cached analysis if the data state hasn't changed
    const cached = await pool.query<{ analysis_json: any }>(
      `SELECT analysis_json FROM analysis_cache
       WHERE user_id = $1 AND fingerprint = $2
       ORDER BY created_at DESC LIMIT 1`,
      [userId, fingerprint]
    );

    if (cached.rows.length > 0) {
      return res.json({
        ...cached.rows[0].analysis_json,
        cached: true,
      });
    }

    // Nothing cached — call Claude
    const context = buildAnalysisContext(transactions, habits, personality);
    let analysis: any;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: COACH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Please analyze this spending data and provide insights:\n\n${context}` }],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      if (!textContent || textContent.type !== 'text') throw new Error('No text response from AI');
      analysis = parseAIResponse(textContent.text);
    } catch (aiError) {
      console.error('AI analysis error:', aiError);
      analysis = generateFallbackAnalysis(transactions, habits, personality);
    }

    const payload = {
      analysis,
      has_enough_data: true,
      data_points: {
        transaction_count: transactions.length,
        habits_detected: habits.length,
        personality_type: personality?.primary_type ?? null,
      },
    };

    // Persist so next load is instant
    await pool.query(
      `INSERT INTO analysis_cache (user_id, fingerprint, analysis_json) VALUES ($1, $2, $3)`,
      [userId, fingerprint, JSON.stringify(payload)]
    ).catch((err) => console.error('Failed to cache analysis:', err));

    res.json(payload);
  } catch (error) {
    console.error('Error in analysis route:', error);
    res.status(500).json({ message: 'Failed to generate analysis', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /api/analysis/refresh
 * Force-regenerate analysis and replace the cache.
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
      return res.json({ analysis: null, message: 'Not enough transaction data for analysis' });
    }

    const context = buildAnalysisContext(transactions, habits, personality);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: COACH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Please analyze this spending data and provide fresh insights:\n\n${context}` }],
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') throw new Error('No text response from AI');

    const analysis = parseAIResponse(textContent.text);
    const fingerprint = buildFingerprint(transactions, habits);
    const payload = {
      analysis,
      has_enough_data: true,
      refreshed_at: new Date().toISOString(),
      data_points: {
        transaction_count: transactions.length,
        habits_detected: habits.length,
        personality_type: personality?.primary_type ?? null,
      },
    };

    // Delete old cache entries and write the fresh one
    await pool.query(`DELETE FROM analysis_cache WHERE user_id = $1`, [userId]);
    await pool.query(
      `INSERT INTO analysis_cache (user_id, fingerprint, analysis_json) VALUES ($1, $2, $3)`,
      [userId, fingerprint, JSON.stringify(payload)]
    );

    res.json(payload);
  } catch (error) {
    console.error('Error refreshing analysis:', error);
    res.status(500).json({ message: 'Failed to refresh analysis', error: error instanceof Error ? error.message : 'Unknown error' });
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
  const spending = transactions.filter((t) => t.amount > 0);
  const totalSpent = spending.reduce((s, t) => s + t.amount, 0);

  // Merchant breakdown
  const merchantMap = new Map<string, { amount: number; count: number }>();
  const categoryMap = new Map<string, { amount: number; count: number }>();

  for (const tx of spending) {
    const merchant = tx.merchant_name || tx.name;
    const m = merchantMap.get(merchant) ?? { amount: 0, count: 0 };
    merchantMap.set(merchant, { amount: m.amount + tx.amount, count: m.count + 1 });

    const cat = tx.category || 'Other';
    const c = categoryMap.get(cat) ?? { amount: 0, count: 0 };
    categoryMap.set(cat, { amount: c.amount + tx.amount, count: c.count + 1 });
  }

  const topMerchants = [...merchantMap.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 8);

  const topCategories = [...categoryMap.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 5)
    .map(([cat, d]) => ({
      cat,
      pct: Math.round((d.amount / totalSpent) * 100),
      count: d.count,
    }));

  // Time patterns
  const { weekendPercent: weekendPct, lateNightPercent: lateNightPct, highestDay } = analyzeTimePatterns(transactions);

  // Habit signals
  const habitSignals = habits.map((h) => ({
    name: h.title,
    monthly: `$${h.monthly_impact.toFixed(0)}/mo`,
    trend: h.trend,
    occurrences: h.occurrence_count,
  }));

  return `PERIOD: Last 30 days
TOTAL SPENT: $${totalSpent.toFixed(0)} across ${spending.length} transactions

TOP MERCHANTS:
${topMerchants.map(([name, d]) => `  ${name} — $${d.amount.toFixed(0)} (${d.count}×)`).join('\n')}

CATEGORY BREAKDOWN:
${topCategories.map((c) => `  ${c.cat} — ${c.pct}% of spend (${c.count} transactions)`).join('\n')}

TIME SIGNALS:
  Weekend activity: ${weekendPct}% of transactions
  Late-night activity (after 9pm): ${lateNightPct}% of transactions
  Highest-spend day: ${highestDay}

DETECTED BEHAVIORAL PATTERNS:
${habitSignals.length > 0
  ? habitSignals.map((h) => `  ${h.name} — ${h.monthly} — ${h.trend} — ${h.occurrences} occurrences`).join('\n')
  : '  None detected yet'}

SPENDING PERSONALITY TYPE: ${personality?.primary_type ?? 'Not yet classified'}`;
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
  _personality: SpendingPersonality | null
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
