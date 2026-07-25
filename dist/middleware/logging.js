"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestContextMiddleware = void 0;
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
const requestContextMiddleware = (req, res, next) => {
    const reqIdHeader = req.header('x-request-id');
    const requestId = reqIdHeader || (0, uuid_1.v4)();
    // Set the response header
    res.setHeader('x-request-id', requestId);
    // Initialize store for AsyncLocalStorage
    const store = new Map();
    store.set('requestId', requestId);
    logger_1.requestStore.run(store, () => {
        const startTime = process.hrtime();
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logger_1.logger.info(`Incoming Request: ${req.method} ${req.originalUrl}`, {
            method: req.method,
            url: req.originalUrl,
            ip: clientIp,
        });
        res.on('finish', () => {
            const diff = process.hrtime(startTime);
            const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
            logger_1.logger.info(`Request Completed: ${req.method} ${req.originalUrl} - Status: ${res.statusCode} in ${durationMs}ms`, {
                method: req.method,
                url: req.originalUrl,
                statusCode: res.statusCode,
                durationMs: parseFloat(durationMs),
            });
        });
        next();
    });
};
exports.requestContextMiddleware = requestContextMiddleware;
