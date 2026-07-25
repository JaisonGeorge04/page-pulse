import dotenv from 'dotenv';
import path from 'path';

// Load env variables
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '60', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  concurrencyLimit: parseInt(process.env.CONCURRENCY_LIMIT || '5', 10),
  auditTimeoutMs: parseInt(process.env.AUDIT_TIMEOUT_MS || '5000', 10),
};
