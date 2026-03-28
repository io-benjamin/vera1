import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { Pool } from 'pg';

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Middleware to verify JWT token and attach userId to request
 */
export const authMiddleware = (pool: Pool) => {
  const authService = new AuthService(pool);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'No token provided. Please include Authorization header with Bearer token.'
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify token
      const { userId } = authService.verifyToken(token);

      // Attach userId to request
      req.userId = userId;

      next();
    } catch (error) {
      return res.status(401).json({
        error: 'Invalid or expired token. Please login again.'
      });
    }
  };
};

/**
 * Optional auth middleware - doesn't fail if no token provided
 * Useful for endpoints that work for both authenticated and non-authenticated users
 */
export const optionalAuthMiddleware = (pool: Pool) => {
  const authService = new AuthService(pool);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { userId } = authService.verifyToken(token);
        req.userId = userId;
      }

      next();
    } catch (error) {
      // Ignore token errors in optional auth
      next();
    }
  };
};
