import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';
import { ReflectionService } from '../services/reflectionService';

const router = Router();

export function createReflectionRoutes(pool: Pool): Router {
  const reflectionService = new ReflectionService(pool);

  /**
   * GET /api/reflections/pending
   * Get all unanswered reflection questions for the authenticated user
   */
  router.get('/pending', authMiddleware(pool), async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const questions = await reflectionService.getPendingQuestions(userId);
      res.json({ questions, count: questions.length });
    } catch (error) {
      console.error('Error getting pending questions:', error);
      res.status(500).json({ message: 'Failed to get pending questions' });
    }
  });

  /**
   * POST /api/reflections/:id/answer
   * Submit an answer to a reflection question
   *
   * Body: { answer: string }
   */
  router.post('/:id/answer', authMiddleware(pool), async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      const { answer } = req.body;

      if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
        return res.status(400).json({ message: 'answer is required' });
      }

      const updated = await reflectionService.submitAnswer(userId, id, answer);

      if (!updated) {
        return res.status(404).json({
          message: 'Question not found, already answered, or does not belong to you',
        });
      }

      res.json({ response: updated });
    } catch (error) {
      console.error('Error submitting answer:', error);
      res.status(500).json({ message: 'Failed to submit answer' });
    }
  });

  /**
   * GET /api/reflections/history
   * Get all answered responses for the user (most recent first)
   */
  router.get('/history', authMiddleware(pool), async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const responses = await reflectionService.getAnsweredResponses(userId, limit);
      res.json({ responses, count: responses.length });
    } catch (error) {
      console.error('Error getting reflection history:', error);
      res.status(500).json({ message: 'Failed to get reflection history' });
    }
  });

  /**
   * GET /api/reflections/pattern/:patternId
   * Get all reflection questions (answered + pending) for a specific habit pattern
   */
  router.get('/pattern/:patternId', authMiddleware(pool), async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { patternId } = req.params;
      const responses = await reflectionService.getResponsesForPattern(userId, patternId);
      res.json({ responses, count: responses.length });
    } catch (error) {
      console.error('Error getting pattern responses:', error);
      res.status(500).json({ message: 'Failed to get pattern responses' });
    }
  });

  /**
   * POST /api/reflections/generate/:patternId
   * Generate context-aware reflection questions for a detected habit.
   * Fetches the full habit from the DB so questions use real amounts, times, merchants.
   */
  router.post('/generate/:patternId', authMiddleware(pool), async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { patternId } = req.params;

      const result = await pool.query(
        `SELECT * FROM detected_habits WHERE id = $1 AND user_id = $2`,
        [patternId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Habit not found' });
      }

      const row = result.rows[0];
      const habit = {
        ...row,
        monthly_impact: parseFloat(row.monthly_impact) || 0,
        annual_impact: parseFloat(row.annual_impact) || 0,
        avg_amount: parseFloat(row.avg_amount) || 0,
        trigger_conditions: row.trigger_conditions || {},
        sample_transactions: row.sample_transactions || [],
      };

      const questions = await reflectionService.generateQuestionsForHabit(userId, patternId, habit);

      res.json({ questions, count: questions.length });
    } catch (error) {
      console.error('Error generating questions:', error);
      res.status(500).json({ message: 'Failed to generate reflection questions' });
    }
  });

  return router;
}
