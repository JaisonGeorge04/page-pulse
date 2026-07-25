"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const config_1 = require("../config/config");
const errorHandler = (err, req, res, next) => {
    const store = logger_1.requestStore.getStore();
    const requestId = store?.get('requestId') || 'N/A';
    let statusCode = 500;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details = undefined;
    if (err instanceof errors_1.AppError) {
        statusCode = err.statusCode;
        errorCode = err.errorCode;
        message = err.message;
        details = err.details;
    }
    else if (err.status && typeof err.status === 'number') {
        // Handling express internal parser errors (e.g. invalid JSON body)
        statusCode = err.status;
        errorCode = 'BAD_REQUEST';
        message = err.message || 'Invalid request payload';
    }
    else {
        // Unhandled errors (e.g. system crashes)
        logger_1.logger.error('Unhandled runtime error in request lifecycle', {
            error: err.message || err,
            stack: err.stack,
            path: req.path,
            method: req.method
        });
    }
    const responsePayload = {
        error: errorCode,
        message,
        requestId,
    };
    if (details !== undefined) {
        responsePayload.details = details;
    }
    if (config_1.config.nodeEnv === 'development' && statusCode === 500) {
        responsePayload.stack = err.stack;
    }
    res.status(statusCode).json(responsePayload);
};
exports.errorHandler = errorHandler;
