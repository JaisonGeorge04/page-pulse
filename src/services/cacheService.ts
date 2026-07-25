import { logger } from '../utils/logger';

interface CacheEntry<T> {
  data: T;
  expiresAt: number; // timestamp in milliseconds
}

export class CacheService<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private defaultTtlMs: number;

  constructor(ttlSeconds: number) {
    this.defaultTtlMs = ttlSeconds * 1000;
    logger.info(`Cache initialized with TTL: ${ttlSeconds} seconds`);
  }

  /**
   * Set a value in the cache with optional custom TTL
   */
  public set(key: string, value: T, ttlSeconds?: number): void {
    const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this.defaultTtlMs;
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { data: value, expiresAt });
    logger.debug(`Cached entry for key: ${key}. Expires at: ${new Date(expiresAt).toISOString()}`);
  }

  /**
   * Get a value from the cache. Returns null if missing or expired.
   */
  public get(key: string): { data: T; remainingSeconds: number } | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      logger.debug(`Cache expired for key: ${key}. Evicting.`);
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
  public clear(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }
}
