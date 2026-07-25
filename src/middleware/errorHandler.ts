import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger, requestStore } from '../utils/logger';
import { config } from '../config/config';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const store = requestStore.getStore();
  const requestId = store?.get('requestId') || 'N/A';

  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details: any = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.errorCode;
    message = err.message;
    details = err.details;
  } else if (err.status && typeof err.status === 'number') {
    // Handling express internal parser errors (e.g. invalid JSON body)
    statusCode = err.status;
    errorCode = 'BAD_REQUEST';
    message = err.message || 'Invalid request payload';
  } else {
    // Unhandled errors (e.g. system crashes)
    logger.error('Unhandled runtime error in request lifecycle', {
      error: err.message || err,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
  }

  const responsePayload: any = {
    error: errorCode,
    message,
    requestId,
  };

  if (details !== undefined) {
    responsePayload.details = details;
  }

  if (config.nodeEnv === 'development' && statusCode === 500) {
    responsePayload.stack = err.stack;
  }

  res.status(statusCode).json(responsePayload);
};
