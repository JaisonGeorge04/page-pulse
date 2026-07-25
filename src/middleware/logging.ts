import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger, requestStore } from '../utils/logger';

export const requestContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const reqIdHeader = req.header('x-request-id');
  const requestId = reqIdHeader || uuidv4();

  // Set the response header
  res.setHeader('x-request-id', requestId);

  // Initialize store for AsyncLocalStorage
  const store = new Map<string, any>();
  store.set('requestId', requestId);

  requestStore.run(store, () => {
    const startTime = process.hrtime();
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    logger.info(`Incoming Request: ${req.method} ${req.originalUrl}`, {
      method: req.method,
      url: req.originalUrl,
      ip: clientIp,
    });

    res.on('finish', () => {
      const diff = process.hrtime(startTime);
      const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
      
      logger.info(`Request Completed: ${req.method} ${req.originalUrl} - Status: ${res.statusCode} in ${durationMs}ms`, {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: parseFloat(durationMs),
      });
    });

    next();
  });
};
