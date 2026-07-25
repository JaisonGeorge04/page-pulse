import winston from 'winston';
import { AsyncLocalStorage } from 'async_hooks';

// AsyncLocalStorage to hold request context (like requestId)
export const requestStore = new AsyncLocalStorage<Map<string, any>>();

const { combine, timestamp, json, colorize, printf } = winston.format;

// Formatter for development console logging
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  const store = requestStore.getStore();
  const requestId = store?.get('requestId') || 'N/A';
  const metaStr = Object.keys(metadata).length ? JSON.stringify(metadata) : '';
  return `${timestamp} [${requestId}] [${level}]: ${message} ${metaStr}`.trim();
});

// Formatter for production JSON logging
const prodFormat = winston.format((info) => {
  const store = requestStore.getStore();
  if (store) {
    info.requestId = store.get('requestId');
  }
  return info;
})();

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    process.env.NODE_ENV === 'production' 
      ? combine(prodFormat, json()) 
      : combine(colorize(), devFormat)
  ),
  transports: [
    new winston.transports.Console()
  ],
});
