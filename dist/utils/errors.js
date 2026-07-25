"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConcurrencyLimitError = exports.RateLimitError = exports.AuditFailedError = exports.SSRFBlockedError = exports.ValidationError = exports.AppError = void 0;
class AppError extends Error {
    statusCode;
    details;
    errorCode;
    constructor(message, statusCode, errorCode, details) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}
exports.ValidationError = ValidationError;
class SSRFBlockedError extends AppError {
    constructor(message) {
        super(message, 400, 'SSRF_BLOCKED', { reason: 'Target URL resolves to a private or restricted IP address.' });
    }
}
exports.SSRFBlockedError = SSRFBlockedError;
class AuditFailedError extends AppError {
    constructor(message, details) {
        super(message, 422, 'AUDIT_FAILED', details);
    }
}
exports.AuditFailedError = AuditFailedError;
class RateLimitError extends AppError {
    constructor(message) {
        super(message, 429, 'RATE_LIMIT_EXCEEDED');
    }
}
exports.RateLimitError = RateLimitError;
class ConcurrencyLimitError extends AppError {
    constructor(message) {
        super(message, 503, 'CONCURRENCY_LIMIT_EXCEEDED', { reason: 'Too many concurrent audit requests. Please try again later.' });
    }
}
exports.ConcurrencyLimitError = ConcurrencyLimitError;
