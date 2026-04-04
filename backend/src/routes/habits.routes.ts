import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';
import { HabitDetectionService } from '../services/habitDetectionService';
import { AIInsightsService } from '../services/aiInsightsService';
import { PatternLearningService } from '../services/patternLearningService';
import { ReflectionService } from '../services/reflectionService';
import { DetectedHabit } from '../models/types';

const router = Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const habitService = new HabitDetectionService(pool);
const aiInsightsService = new AIInsightsService(pool);
const patternLearningService = new PatternLearningService(pool);
const reflectionService = new ReflectionService(pool);

/**
 * Parse habit rows from database (DECIMAL fields come as strings)
 */
function parseHabitRows(rows: any[]): DetectedHabit[] {
  return rows.map((row) => ({
    ...row,
    monthly_impact: parseFloat(row.monthly_impact) || 0,
    annual_impact: parseFloat(row.annual_impact) || 0,
    avg_amount: parseFloat(row.avg_amount) || 0,
    trigger_conditions: row.trigger_conditions || {},
    sample_transactions: row.sample_transactions || [],
  }));
}

/**
 * GET /api/habits
 * Get all detected habits for the user with AI insights
 */
router.get('/', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    // First check if we have existing habits
    const existingResult = await pool.query(
      `SELECT * FROM detected_habits
       WHERE user_id = $1
       ORDER BY monthly_impact DESC`,
      [userId]
    );

    let habits = parseHabitRows(existingResult.rows);

    // If no habits exist or force refresh requested, detect new ones
    if (habits.length === 0 || req.query.refresh === 'true') {
      habits = await habitService.detectHabits(userId, 90);
      // Auto-generate reflection questions for newly detected habits
      await Promise.all(
        habits.map((h) =>
          h.id ? reflectionService.generateQuestionsForHabit(userId, h.id, h).catch(() => {}) : Promise.resolve()
        )
      );
    }

    // Get summary
    const summary = await habitService.getHabitSummary(userId);

    // Generate AI insights
    const response = await aiInsightsService.generateHabitInsights(userId, habits, summary);

    res.json(response);
  } catch (error) {
    console.error('Error getting habits:', error);
    res.status(500).json({
      message: 'Failed to get habits',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/habits/detect
 * Force re-detection of habits
 */
router.post('/detect', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const days = parseInt(req.query.days as string) || 90;

    const habits = await habitService.detectHabits(userId, days);

    // Auto-generate reflection questions for detected habits
    await Promise.all(
      habits.map((h) =>
        h.id ? reflectionService.generateQuestionsForHabit(userId, h.id, h).catch(() => {}) : Promise.resolve()
      )
    );

    const summary = await habitService.getHabitSummary(userId);
    const response = await aiInsightsService.generateHabitInsights(userId, habits, summary);

    res.json({
      message: `Detected ${habits.length} habits`,
      ...response,
    });
  } catch (error) {
    console.error('Error detecting habits:', error);
    res.status(500).json({
      message: 'Failed to detect habits',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/habits/summary
 * Get habit summary for dashboard
 */
router.get('/summary', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const summary = await habitService.getHabitSummary(userId);

    res.json({ summary });
  } catch (error) {
    console.error('Error getting habit summary:', error);
    res.status(500).json({
      message: 'Failed to get habit summary',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/habits/:id
 * Get detailed analysis of a specific habit
 */
router.get('/:id', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Get habit
    const result = await pool.query(
      'SELECT * FROM detected_habits WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    const habit = result.rows[0];

    // Get deep AI analysis
    const aiInsight = await aiInsightsService.analyzeHabitDeep(userId, id);

    res.json({
      habit,
      ai_insight: aiInsight,
    });
  } catch (error) {
    console.error('Error getting habit:', error);
    res.status(500).json({
      message: 'Failed to get habit',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/habits/:id/acknowledge
 * Mark a habit as acknowledged (user has seen it)
 */
router.post('/:id/acknowledge', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE detected_habits
       SET is_acknowledged = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    res.json({
      message: 'Habit acknowledged',
      habit: result.rows[0],
    });
  } catch (error) {
    console.error('Error acknowledging habit:', error);
    res.status(500).json({
      message: 'Failed to acknowledge habit',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/habits/insights/weekly
 * Get weekly AI-generated insight
 */
router.get('/insights/weekly', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const insight = await aiInsightsService.generateWeeklyInsight(userId);

    res.json({ insight });
  } catch (error) {
    console.error('Error getting weekly insight:', error);
    res.status(500).json({
      message: 'Failed to get weekly insight',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/habits/coaching/:context
 * Get coaching message for specific context
 */
router.get('/coaching/:context', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const context = req.params.context as 'weekly' | 'habit_detected' | 'improvement' | 'setback';

    if (!['weekly', 'habit_detected', 'improvement', 'setback'].includes(context)) {
      return res.status(400).json({ message: 'Invalid context' });
    }

    const message = await aiInsightsService.generateCoachingMessage(userId, context);

    res.json({ coaching_message: message });
  } catch (error) {
    console.error('Error getting coaching message:', error);
    res.status(500).json({
      message: 'Failed to get coaching message',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/habits/transactions/:habitId
 * Get transactions that match a specific habit
 */
router.get('/transactions/:habitId', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { habitId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Get habit to understand triggers
    const habitResult = await pool.query(
      'SELECT * FROM detected_habits WHERE id = $1 AND user_id = $2',
      [habitId, userId]
    );

    if (habitResult.rows.length === 0) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    const habit = habitResult.rows[0];
    const triggers = habit.trigger_conditions || {};

    // Build query based on triggers
    let query = `
      SELECT t.*, a.name as account_name, a.institution_name
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.user_id = $1
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    // Add merchant filter if applicable
    if (triggers.merchants && triggers.merchants.length > 0) {
      const merchantConditions = triggers.merchants.map((_: string, i: number) =>
        `LOWER(t.merchant_name) LIKE $${paramIndex + i} OR LOWER(t.name) LIKE $${paramIndex + i}`
      );
      query += ` AND (${merchantConditions.join(' OR ')})`;
      params.push(...triggers.merchants.map((m: string) => `%${m.toLowerCase()}%`));
      paramIndex += triggers.merchants.length;
    }

    // Add category filter if applicable
    if (triggers.categories && triggers.categories.length > 0) {
      query += ` AND t.category = ANY($${paramIndex})`;
      params.push(triggers.categories);
      paramIndex++;
    }

    // Add day of week filter if applicable
    if (triggers.day_of_week && triggers.day_of_week.length > 0) {
      query += ` AND EXTRACT(DOW FROM t.date) = ANY($${paramIndex})`;
      params.push(triggers.day_of_week);
      paramIndex++;
    }

    query += ` ORDER BY t.date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM').replace(/ORDER BY.*$/, '');
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    res.json({
      habit_id: habitId,
      habit_title: habit.title,
      transactions: result.rows.map((row: any) => ({
        id: row.id,
        date: row.date,
        amount: parseFloat(row.amount),
        name: row.name,
        merchant_name: row.merchant_name,
        category: row.category,
        account_name: row.account_name,
        institution_name: row.institution_name,
      })),
      pagination: {
        total,
        page,
        limit,
        has_more: page * limit < total,
      },
    });
  } catch (error) {
    console.error('Error getting habit transactions:', error);
    res.status(500).json({
      message: 'Failed to get habit transactions',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// Insight Feedback Routes
// ============================================

/**
 * POST /api/habits/insights/:id/feedback
 * Submit thumbs up/down feedback on a generated AI insight.
 *
 * Body: { is_helpful: boolean }
 */
router.post('/insights/:id/feedback', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { is_helpful } = req.body;

    if (typeof is_helpful !== 'boolean') {
      return res.status(400).json({ message: 'is_helpful must be a boolean' });
    }

    const result = await pool.query(
      `UPDATE ai_insights
       SET is_helpful = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, insight_type, is_helpful`,
      [is_helpful, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Insight not found' });
    }

    res.json({ feedback: result.rows[0] });
  } catch (error) {
    console.error('Error saving insight feedback:', error);
    res.status(500).json({ message: 'Failed to save feedback' });
  }
});

// ============================================
// Historical Pattern Learning Routes
// ============================================

/**
 * GET /api/habits/patterns/learned
 * Get all learned patterns with historical tracking data
 */
router.get('/patterns/learned', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const patterns = await patternLearningService.getUserPatterns(userId);

    res.json({
      patterns,
      total_patterns: patterns.length,
      total_monthly_cost: patterns.reduce((sum, p) => sum + p.estimated_monthly_cost, 0),
    });
  } catch (error) {
    console.error('Error getting learned patterns:', error);
    res.status(500).json({
      message: 'Failed to get learned patterns',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/habits/patterns/:patternKey/history
 * Get historical data for a specific pattern
 */
router.get('/patterns/:patternKey/history', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { patternKey } = req.params;
    const months = parseInt(req.query.months as string) || 12;

    const pattern = await patternLearningService.getPattern(userId, patternKey);
    if (!pattern) {
      return res.status(404).json({ message: 'Pattern not found' });
    }

    const history = await patternLearningService.getPatternHistory(userId, patternKey, months);

    res.json({
      pattern,
      history,
      trend: pattern.trend_direction,
      months_tracked: pattern.months_tracked,
    });
  } catch (error) {
    console.error('Error getting pattern history:', error);
    res.status(500).json({
      message: 'Failed to get pattern history',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/habits/ai/context
 * Get the full AI context built from historical patterns
 * Useful for debugging or showing what the AI "knows" about the user
 */
router.get('/ai/context', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const context = await patternLearningService.buildAIContext(userId);

    res.json({ context });
  } catch (error) {
    console.error('Error getting AI context:', error);
    res.status(500).json({
      message: 'Failed to get AI context',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/habits/ai/reply
 * Get a personalized AI reply based on historical patterns
 */
router.get('/ai/reply', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const response = await aiInsightsService.generatePersonalizedReply(userId);

    res.json(response);
  } catch (error) {
    console.error('Error getting personalized reply:', error);
    res.status(500).json({
      message: 'Failed to get personalized reply',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/habits/ai/ask
 * Ask a question about spending and get an AI answer using historical context
 */
router.post('/ai/ask', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ message: 'Question is required' });
    }

    const response = await aiInsightsService.generatePersonalizedReply(userId, question);

    res.json(response);
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(500).json({
      message: 'Failed to answer question',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/habits/ai/progress
 * Get monthly progress report based on historical patterns
 */
router.get('/ai/progress', authMiddleware(pool), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const report = await aiInsightsService.getMonthlyProgressReport(userId);

    res.json(report);
  } catch (error) {
    console.error('Error getting progress report:', error);
    res.status(500).json({
      message: 'Failed to get progress report',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
