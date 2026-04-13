import { Request, Response, NextFunction } from 'express';
import { Pool, PoolClient } from 'pg';

declare global {
  namespace Express {
    interface Request {
      dbClient?: PoolClient;
    }
  }
}

/**
 * Sets app.user_id as a PostgreSQL session variable for Row Level Security.
 * Must be applied after authMiddleware so req.userId is available.
 *
 * Acquires a client from the pool, sets the session variable, attaches the
 * client to req.dbClient, and releases it after the response is sent.
 */
export function dbSessionMiddleware(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.userId) return next();

    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query(`SET LOCAL app.user_id = '${req.userId}'`);
      req.dbClient = client;

      res.on('finish', () => client?.release());
      res.on('close', () => client?.release());

      next();
    } catch (err) {
      client?.release();
      next(err);
    }
  };
}
