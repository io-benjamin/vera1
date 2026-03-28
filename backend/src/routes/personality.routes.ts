import { Router } from 'express';
import { Pool } from 'pg';
import { AIAnalysisService } from '../services/aiAnalysisService';
import { PersonalityAnalysisService } from '../services/personalityAnalysisService';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const aiService = new AIAnalysisService(pool);
const personalityService = new PersonalityAnalysisService(pool);

/**
 * GET /api/personality
 * Get user's AI-powered spending analysis
 * Returns cached analysis if recent, or runs new analysis
 */
router.get('/', authMiddleware(pool), async (req, res) => {
  try {
    const userId = req.userId!;

    const result = await aiService.getLatestAnalysis(userId);

    // Format response for frontend (matching PersonalityResponse interface)
    res.json({
      personality: {
        primary_type: 'ANALYZER',
        secondary_type: null,
        confidence_score: 85,
        damage_score: result.insight.damage_estimate || 0,
        analysis_period_start: result.insight.analysis_date,
        analysis_period_end: result.insight.analysis_date,
        behavior_patterns: result.insight.claude_response.patterns || [],
      },
      message: {
        emoji: '🔍',
        title: 'Your Spending Analysis',
        description: result.insight.personality_summary || result.insight.claude_response.coaching_message || 'Analysis complete.',
      },
      actions: result.insight.claude_response.actions || [],
      // Also include raw AI data for advanced views
      raw: {
        patterns: result.insight.claude_response.patterns,
        coaching_message: result.insight.claude_response.coaching_message,
        changes_since_last: result.insight.claude_response.changes_since_last,
        is_fresh: result.is_fresh,
        learned_patterns: result.patterns,
      },
    });
  } catch (error: any) {
    console.error('Get personality error:', error);

    if (error.message.includes('No text response')) {
      return res.status(500).json({
        error: 'AI analysis failed. Please try again.',
      });
    }

    if (error.message.includes('Could not parse')) {
      return res.status(500).json({
        error: 'AI returned invalid response. Please try again.',
      });
    }

    // Check if no transactions
    const txCheck = await pool.query(
      `SELECT COUNT(*) as count FROM transactions t
       INNER JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1`,
      [req.userId]
    );

    if (parseInt(txCheck.rows[0].count) === 0) {
      return res.status(400).json({
        error: 'No transaction data found. Connect a bank account first.',
      });
    }

    res.status(500).json({
      error: 'Failed to analyze spending behavior',
    });
  }
});

/**
 * POST /api/personality/analyze
 * Force a new AI analysis (bypasses cache)
 */
router.post('/analyze', authMiddleware(pool), async (req, res) => {
  try {
    const userId = req.userId!;

    const result = await aiService.analyzeSpendingBehavior(userId);

    // Format response for frontend (matching PersonalityResponse interface)
    res.json({
      personality: {
        primary_type: 'ANALYZER',
        secondary_type: null,
        confidence_score: 85,
        damage_score: result.insight.damage_estimate || 0,
        analysis_period_start: result.insight.analysis_date,
        analysis_period_end: result.insight.analysis_date,
        behavior_patterns: result.insight.claude_response.patterns || [],
      },
      message: {
        emoji: '🔍',
        title: 'Your Spending Analysis',
        description: result.insight.personality_summary || result.insight.claude_response.coaching_message || 'Analysis complete.',
      },
      actions: result.insight.claude_response.actions || [],
    });
  } catch (error: any) {
    console.error('Analyze personality error:', error);

    res.status(500).json({
      error: 'Failed to run AI analysis: ' + error.message,
    });
  }
});

/**
 * GET /api/personality/evidence
 * Get personality analysis with transaction evidence
 */
router.get('/evidence', authMiddleware(pool), async (req, res) => {
  try {
    const userId = req.userId!;

    const result = await personalityService.analyzePersonalityWithEvidence(userId);

    res.json({
      personality: result,
      evidence: result.evidence,
      total_evidence_transactions: result.total_evidence_transactions,
    });
  } catch (error: any) {
    console.error('Get personality evidence error:', error);

    if (error.message.includes('Not enough transaction data')) {
      return res.status(400).json({
        error: error.message,
      });
    }

    res.status(500).json({
      error: 'Failed to get personality evidence',
    });
  }
});

/**
 * GET /api/personality/triggers/:triggerName/transactions
 * Get all transactions for a specific personality trigger (drill-down)
 */
router.get('/triggers/:triggerName/transactions', authMiddleware(pool), async (req, res) => {
  try {
    const userId = req.userId!;
    const { triggerName } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await personalityService.getPersonalityTriggerTransactions(
      userId,
      triggerName,
      page,
      limit
    );

    res.json(result);
  } catch (error: any) {
    console.error('Get trigger transactions error:', error);

    if (error.message === 'Trigger not found' || error.message === 'No personality analysis found') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: 'Failed to get trigger transactions',
    });
  }
});

/**
 * GET /api/personality/history
 * Get pattern evolution over time
 */
router.get('/history', authMiddleware(pool), async (req, res) => {
  try {
    const userId = req.userId!;

    const history = await aiService.getPatternHistory(userId);

    res.json(history);
  } catch (error: any) {
    console.error('Get history error:', error);

    res.status(500).json({
      error: 'Failed to get pattern history',
    });
  }
});

/**
 * POST /api/personality/feedback
 * Record user feedback on coaching (did they follow the advice?)
 */
router.post('/feedback', authMiddleware(pool), async (req, res) => {
  try {
    const userId = req.userId!;
    const { insight_id, action } = req.body;

    if (!insight_id || !action) {
      return res.status(400).json({
        error: 'insight_id and action are required',
      });
    }

    if (!['followed', 'dismissed', 'partial'].includes(action)) {
      return res.status(400).json({
        error: 'action must be: followed, dismissed, or partial',
      });
    }

    await aiService.recordFeedback(userId, insight_id, action);

    res.json({ message: 'Feedback recorded' });
  } catch (error: any) {
    console.error('Record feedback error:', error);

    res.status(500).json({
      error: 'Failed to record feedback',
    });
  }
});

export default router;
