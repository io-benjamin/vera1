import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import authRoutes from './routes/auth.routes';
import accountsRoutes from './routes/accounts.routes';
import { createPlaidRoutes } from './routes/plaid.routes';
import { createReflectionRoutes } from './routes/reflection.routes';
import spendingRoutes from './routes/spending.routes';
import personalityRoutes from './routes/personality.routes';
import leaksRoutes from './routes/leaks.routes';
import habitsRoutes from './routes/habits.routes';
import analysisRoutes from './routes/analysis.routes';
import mockRoutes from './routes/mock.routes';
import { createTimePromptsRoutes } from './routes/time-prompts.routes';
import { createTimelineRoutes } from './routes/timeline.routes';
import { runMigrations } from './database/migrationRunner';
import { syncTransactions } from './services/plaidService';

const app = express();
const PORT = process.env.PORT || 3000;
const plaidPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'vera-api',
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/plaid', createPlaidRoutes(plaidPool));
app.use('/api/spending', spendingRoutes);
app.use('/api/personality', personalityRoutes);
app.use('/api/leaks', leaksRoutes);
app.use('/api/habits', habitsRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/mock', mockRoutes);
app.use('/api/reflections', createReflectionRoutes(plaidPool));
app.use('/api/time-prompts', createTimePromptsRoutes(plaidPool));
app.use('/api/timeline', createTimelineRoutes(plaidPool));

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.path,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

/**
 * Background sync — runs every 15 minutes as a fallback for missed Plaid webhooks.
 * Iterates all plaid_items and syncs transactions incrementally via cursor.
 */
async function startBackgroundSync() {
  const INTERVAL_MS = 15 * 60 * 1000;

  const runSync = async () => {
    try {
      const result = await plaidPool.query(
        'SELECT item_id, user_id FROM plaid_items ORDER BY last_synced_at ASC NULLS FIRST'
      );
      if (result.rows.length === 0) return;

      console.log(`[background-sync] Syncing ${result.rows.length} items`);
      for (const { item_id, user_id } of result.rows) {
        try {
          await syncTransactions(plaidPool, user_id, item_id);
        } catch (err) {
          console.error(`[background-sync] Failed for item ${item_id}:`, err);
        }
      }
    } catch (err) {
      console.error('[background-sync] Query failed:', err);
    }
  };

  // Run once shortly after startup, then every 15 minutes
  setTimeout(runSync, 30 * 1000);
  setInterval(runSync, INTERVAL_MS);
  console.log('🔄 Background sync scheduled every 15 minutes');
}

// Start server with migrations
async function startServer() {
  try {
    await runMigrations();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    });

    startBackgroundSync();
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
