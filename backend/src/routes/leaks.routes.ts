import { Router } from 'express';
import { Pool } from 'pg';
import { LeakDetectionService } from '../services/leakDetectionService';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const leakService = new LeakDetectionService(pool);

/**
 * GET /api/leaks
 * Get user's detected money leaks
 */
router.get('/', authMiddleware(pool), async (req, res) => {
  try {
    const userId = req.userId!;
    const includeResolved = req.query.include_resolved === 'true';

    const leaks = await leakService.getUserLeaks(userId, includeResolved);

    // Calculate total monthly and annual cost
    const unresolvedLeaks = leaks.filter((l) => !l.is_resolved);
    const totalMonthlyCost = unresolvedLeaks.reduce((sum, l) => sum + l.monthly_cost, 0);
    const totalAnnualCost = unresolvedLeaks.reduce((sum, l) => sum + l.annual_cost, 0);

    res.json({
      leaks,
      summary: {
        total_leaks: leaks.length,
        unresolved_leaks: unresolvedLeaks.length,
        total_monthly_cost: totalMonthlyCost,
        total_annual_cost: totalAnnualCost,
      },
    });
  } catch (error) {
    console.error('Get leaks error:', error);
    res.status(500).json({
      error: 'Failed to get detected leaks',
    });
  }
});

/**
 * GET /api/leaks/grouped
 * Get user's leaks grouped by category with evidence transactions
 */
router.get('/grouped', authMiddleware(pool), async (req, res) => {
  try {
    const userId = req.userId!;
    const includeResolved = req.query.include_resolved === 'true';

    const result = await leakService.getUserLeaksWithEvidence(userId, includeResolved);

    res.json(result);
  } catch (error) {
    console.error('Get grouped leaks error:', error);
    res.status(500).json({
      error: 'Failed to get grouped leaks',
    });
  }
});

/**
 * POST /api/leaks/detect
 * Run leak detection analysis
 */
router.post('/detect', authMiddleware(pool), async (req, res) => {
  try {
    const userId = req.userId!;

    const leaks = await leakService.detectLeaks(userId);

    const unresolvedLeaks = leaks.filter((l) => !l.is_resolved);
    const totalMonthlyCost = unresolvedLeaks.reduce((sum, l) => sum + l.monthly_cost, 0);
    const totalAnnualCost = unresolvedLeaks.reduce((sum, l) => sum + l.annual_cost, 0);

    // Return same structure as GET /leaks for frontend compatibility
    res.json({
      leaks,
      summary: {
        total_leaks: leaks.length,
        unresolved_leaks: unresolvedLeaks.length,
        total_monthly_cost: totalMonthlyCost,
        total_annual_cost: totalAnnualCost,
      },
      // Also include for backward compatibility
      leaks_found: leaks.length,
      total_monthly_cost: totalMonthlyCost,
    });
  } catch (error) {
    console.error('Detect leaks error:', error);
    res.status(500).json({
      error: 'Failed to detect leaks',
    });
  }
});

/**
 * GET /api/leaks/:leakId
 * Get specific leak with coaching message
 */
router.get('/:leakId', authMiddleware(pool), async (req, res) => {
  try {
    const { leakId } = req.params;

    const result = await leakService.getLeakWithCoaching(leakId);

    res.json(result);
  } catch (error: any) {
    console.error('Get leak error:', error);

    if (error.message === 'Leak not found') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: 'Failed to get leak details',
    });
  }
});

/**
 * GET /api/leaks/:leakId/transactions
 * Get all transactions for a specific leak (drill-down)
 */
router.get('/:leakId/transactions', authMiddleware(pool), async (req, res) => {
  try {
    const { leakId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await leakService.getLeakTransactions(leakId, page, limit);

    res.json(result);
  } catch (error: any) {
    console.error('Get leak transactions error:', error);

    if (error.message === 'Leak not found') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: 'Failed to get leak transactions',
    });
  }
});

/**
 * POST /api/leaks/:leakId/resolve
 * Mark a leak as resolved
 */
router.post('/:leakId/resolve', authMiddleware(pool), async (req, res) => {
  try {
    const { leakId } = req.params;

    await leakService.resolveLeak(leakId);

    res.json({
      message: 'Leak marked as resolved',
    });
  } catch (error) {
    console.error('Resolve leak error:', error);
    res.status(500).json({
      error: 'Failed to resolve leak',
    });
  }
});

export default router;
