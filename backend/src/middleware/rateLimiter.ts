import rateLimit from 'express-rate-limit';

/**
 * Standard rate limiter — applied globally.
 * 100 requests per 15-minute window per IP.
 */
export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/**
 * Sensitive rate limiter — auth endpoints (login, register, password change).
 * 20 requests per 15-minute window per IP.
 */
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
