"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.concurrencyController = exports.cacheService = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const config_1 = require("./config/config");
const logging_1 = require("./middleware/logging");
const rateLimiter_1 = require("./middleware/rateLimiter");
const errorHandler_1 = require("./middleware/errorHandler");
const cacheService_1 = require("./services/cacheService");
const concurrency_1 = require("./services/concurrency");
const auditService_1 = require("./services/auditService");
const errors_1 = require("./utils/errors");
const logger_1 = require("./utils/logger");
const app = (0, express_1.default)();
// Initialize Services
const cacheService = new cacheService_1.CacheService(config_1.config.cacheTtlSeconds);
exports.cacheService = cacheService;
const concurrencyController = new concurrency_1.ConcurrencyController(config_1.config.concurrencyLimit);
exports.concurrencyController = concurrencyController;
const auditService = new auditService_1.AuditService();
// Middlewares
app.use(logging_1.requestContextMiddleware);
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve static frontend files
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// Zod Input Validation Schema
const auditSchema = zod_1.z.object({
    url: zod_1.z.string({
        required_error: 'URL is required',
        invalid_type_error: 'URL must be a string',
    })
        .trim()
        .min(1, 'URL cannot be empty'),
});
// API Routes
app.post('/api/audit', rateLimiter_1.rateLimiter, async (req, res, next) => {
    try {
        // 1. Validate Input Payload
        const parseResult = auditSchema.safeParse(req.body);
        if (!parseResult.success) {
            const details = parseResult.error.errors.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            throw new errors_1.ValidationError('Validation failed for request inputs', details);
        }
        const { url } = parseResult.data;
        // Normalize URL for caching key lookup
        let normalizedUrl = url.trim();
        if (!/^https?:\/\//i.test(normalizedUrl)) {
            normalizedUrl = 'https://' + normalizedUrl;
        }
        // 2. Check Cache
        const cachedEntry = cacheService.get(normalizedUrl);
        if (cachedEntry) {
            logger_1.logger.info(`Cache HIT for URL: ${normalizedUrl}`);
            res.setHeader('X-Cache', 'HIT');
            return res.status(200).json({
                report: cachedEntry.data,
                cached: true,
                remainingTtlSeconds: cachedEntry.remainingSeconds,
            });
        }
        // 3. Cache Miss - Process through concurrency manager
        logger_1.logger.info(`Cache MISS for URL: ${normalizedUrl}. Enqueueing/running audit.`);
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
    }
    catch (error) {
        next(error);
    }
});
// Get Server Metrics
app.get('/api/status', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        config: {
            port: config_1.config.port,
            nodeEnv: config_1.config.nodeEnv,
            cacheTtlSeconds: config_1.config.cacheTtlSeconds,
            concurrencyLimit: config_1.config.concurrencyLimit,
            rateLimitMax: config_1.config.rateLimitMax,
            rateLimitWindowMs: config_1.config.rateLimitWindowMs,
            auditTimeoutMs: config_1.config.auditTimeoutMs,
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
    res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
});
// Global Error Handler Middleware
app.use(errorHandler_1.errorHandler);
exports.default = app;
