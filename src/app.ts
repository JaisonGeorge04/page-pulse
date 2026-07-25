import express from 'express';
import cors from 'cors';
import path from 'path';
import { z } from 'zod';
import { config } from './config/config';
import { requestContextMiddleware } from './middleware/logging';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { CacheService } from './services/cacheService';
import { ConcurrencyController } from './services/concurrency';
import { AuditService, AuditReport } from './services/auditService';
import { ValidationError } from './utils/errors';
import { logger } from './utils/logger';

const app = express();

// Initialize Services
const cacheService = new CacheService<AuditReport>(config.cacheTtlSeconds);
const concurrencyController = new ConcurrencyController(config.concurrencyLimit);
const auditService = new AuditService();

// Middlewares
app.use(requestContextMiddleware);
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// Zod Input Validation Schema
const auditSchema = z.object({
  url: z.string({
    required_error: 'URL is required',
    invalid_type_error: 'URL must be a string',
  })
  .trim()
  .min(1, 'URL cannot be empty'),
});

// API Routes
app.post('/api/audit', rateLimiter, async (req, res, next) => {
  try {
    // 1. Validate Input Payload
    const parseResult = auditSchema.safeParse(req.body);
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      throw new ValidationError('Validation failed for request inputs', details);
    }

    const { url } = parseResult.data;

    // Normalize URL for caching key lookup
    let normalizedUrl = url.trim();
    if (!/^[a-zA-Z0-9+-.]+:\/\//.test(normalizedUrl)) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // 2. Check Cache
    const cachedEntry = cacheService.get(normalizedUrl);
    if (cachedEntry) {
      logger.info(`Cache HIT for URL: ${normalizedUrl}`);
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json({
        report: cachedEntry.data,
        cached: true,
        remainingTtlSeconds: cachedEntry.remainingSeconds,
      });
    }

    // 3. Cache Miss - Process through concurrency manager
    logger.info(`Cache MISS for URL: ${normalizedUrl}. Enqueueing/running audit.`);
    
    const report = await concurrencyController.runWithLimit(async () => {
      return await auditService.audit(normalizedUrl);
    });

    // 4. Save to Cache
    cacheService.set(normalizedUrl, report);
    
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json({
      report,
      cached: false,
    });
  } catch (error) {
    next(error);
  }
});

// Get Server Metrics
app.get('/api/status', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    config: {
      port: config.port,
      nodeEnv: config.nodeEnv,
      cacheTtlSeconds: config.cacheTtlSeconds,
      concurrencyLimit: config.concurrencyLimit,
      rateLimitMax: config.rateLimitMax,
      rateLimitWindowMs: config.rateLimitWindowMs,
      auditTimeoutMs: config.auditTimeoutMs,
    },
    concurrency: concurrencyController.getMetrics(),
  });
});

// Clear Cache Endpoint (administrative or testing)
app.post('/api/cache/clear', (req, res) => {
  cacheService.clear();
  res.status(200).json({ message: 'Cache cleared successfully' });
});

// Catch-all route to serve the frontend homepage
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global Error Handler Middleware
app.use(errorHandler);

export default app;
export { cacheService, concurrencyController };
