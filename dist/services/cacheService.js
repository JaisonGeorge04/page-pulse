"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const logger_1 = require("../utils/logger");
class CacheService {
    cache = new Map();
    defaultTtlMs;
    constructor(ttlSeconds) {
        this.defaultTtlMs = ttlSeconds * 1000;
        logger_1.logger.info(`Cache initialized with TTL: ${ttlSeconds} seconds`);
    }
    /**
     * Set a value in the cache with optional custom TTL
     */
    set(key, value, ttlSeconds) {
        const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this.defaultTtlMs;
        const expiresAt = Date.now() + ttlMs;
        this.cache.set(key, { data: value, expiresAt });
        logger_1.logger.debug(`Cached entry for key: ${key}. Expires at: ${new Date(expiresAt).toISOString()}`);
    }
    /**
     * Get a value from the cache. Returns null if missing or expired.
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        const now = Date.now();
        if (now > entry.expiresAt) {
            logger_1.logger.debug(`Cache expired for key: ${key}. Evicting.`);
            this.cache.delete(key);
            return null;
        }
        const remainingSeconds = Math.max(0, Math.ceil((entry.expiresAt - now) / 1000));
        return {
            data: entry.data,
            remainingSeconds,
        };
    }
    /**
     * Clear all entries in the cache (useful for testing)
     */
    clear() {
        this.cache.clear();
        logger_1.logger.info('Cache cleared');
    }
}
exports.CacheService = CacheService;
