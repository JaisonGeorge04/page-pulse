import rateLimit from 'express-rate-limit';
import { config } from '../config/config';
import { RateLimitError } from '../utils/errors';
import { logger } from '../utils/logger';

export const rateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res, next) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    next(new RateLimitError('Rate limit exceeded. Too many requests.'));
  },
});
