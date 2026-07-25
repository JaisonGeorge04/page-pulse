export class AppError extends Error {
  public readonly statusCode: number;
  public readonly details?: any;
  public readonly errorCode: string;

  constructor(message: string, statusCode: number, errorCode: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class SSRFBlockedError extends AppError {
  constructor(message: string) {
    super(message, 400, 'SSRF_BLOCKED', { reason: 'Target URL resolves to a private or restricted IP address.' });
  }
}

export class AuditFailedError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 422, 'AUDIT_FAILED', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class ConcurrencyLimitError extends AppError {
  constructor(message: string) {
    super(message, 503, 'CONCURRENCY_LIMIT_EXCEEDED', { reason: 'Too many concurrent audit requests. Please try again later.' });
  }
}
