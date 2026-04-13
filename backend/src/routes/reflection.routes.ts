import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';
import { ReflectionService } from '../services/reflectionService';
import { validateBody, validateQuery } from '../middleware/validate';
import { answerSchema, historyQuerySchema } from '../validators/reflection.validators';

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
   * Submit an answer to a reflection question.
   *
   * Body: { answer: string, time_of_day?: 'morning'|'midday'|'evening'|'night' }
   *
   * When time_of_day is provided and the question is linked to a transaction,
   * that transaction's user_time_of_day is updated (source=user, confidence=high).
   */
  router.post('/:id/answer', authMiddleware(pool), validateBody(answerSchema), async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      const { answer, time_of_day } = req.body;

      const { response, followUp, signatureMoment } = await reflectionService.submitAnswer(userId, id, answer);

      if (!response) {
        return res.status(404).json({
          message: 'Question not found, already answered, or does not belong to you',
        });
      }

      // If a time label was provided and the question is linked to a transaction, persist it
      if (time_of_day && response.transaction_id) {
        await pool.query(
          `UPDATE transactions
           SET user_time_of_day = $1,
               time_source      = 'user',
               time_confidence  = 'high'
           WHERE id = $2`,
          [time_of_day, response.transaction_id]
        );
      }

      res.json({ response, followUp, signatureMoment });
    } catch (error) {
      console.error('Error submitting answer:', error);
      res.status(500).json({ message: 'Failed to submit answer' });
    }
  });

  /**
   * GET /api/reflections/history
   * Get all answered responses for the user (most recent first)
   */
  router.get('/history', authMiddleware(pool), validateQuery(historyQuerySchema), async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const limit = (req.query as any).limit as number;
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
