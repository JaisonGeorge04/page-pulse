"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("../config/config");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
exports.rateLimiter = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.rateLimitWindowMs,
    max: config_1.config.rateLimitMax,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res, next) => {
        logger_1.logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
        next(new errors_1.RateLimitError('Rate limit exceeded. Too many requests.'));
    },
});
