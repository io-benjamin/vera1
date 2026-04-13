import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

/**
 * Zod request validation middleware.
 * Validates req.body against the provided schema.
 * Returns 400 with field-level errors on failure.
 */
export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || 'body';
        details[key] = issue.message;
      }
      return res.status(400).json({ error: 'Validation failed', details });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validates req.query against the provided schema.
 */
export function validateQuery(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || 'query';
        details[key] = issue.message;
      }
      return res.status(400).json({ error: 'Validation failed', details });
    }
    req.query = result.data as any;
    next();
  };
}
