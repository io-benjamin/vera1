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
import { runMigrations } from './database/migrationRunner';

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

// Start server with migrations
async function startServer() {
  try {
    // Run database migrations
    await runMigrations();

    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
