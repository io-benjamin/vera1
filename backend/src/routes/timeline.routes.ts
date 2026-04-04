import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';
import { NarrativeTimelineService } from '../services/narrativeTimelineService';

export function createTimelineRoutes(pool: Pool): Router {
  const router = Router();
  const service = new NarrativeTimelineService(pool);

  /**
   * GET /api/timeline?limit=50
   * Returns a behavioral narrative timeline for the authenticated user.
   */
  router.get('/', authMiddleware(pool), async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const units = await service.buildTimeline(userId, limit);
      res.json({ units, count: units.length });
    } catch (error) {
      console.error('Error building narrative timeline:', error);
      res.status(500).json({ message: 'Failed to build timeline' });
    }
  });

  return router;
}
