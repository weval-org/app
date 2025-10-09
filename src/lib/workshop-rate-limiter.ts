/**
 * Workshop Rate Limiter
 *
 * In-memory rate limiting for workshop operations.
 * Uses sliding window algorithm with automatic cleanup.
 */

interface RateLimitEntry {
  key: string;
  timestamps: number[];
}

class WorkshopRateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup old entries every 5 minutes
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
  }

  /**
   * Check if an action is rate limited
   * @param key - Unique identifier for the rate limit (e.g., "publish:workshop123:session456")
   * @param maxRequests - Maximum number of requests allowed in the window
   * @param windowMs - Time window in milliseconds
   * @returns true if rate limited, false if allowed
   */
  isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry) {
      // First request
      this.entries.set(key, { key, timestamps: [now] });
      return false;
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(ts => now - ts < windowMs);

    // Check if limit exceeded
    if (entry.timestamps.length >= maxRequests) {
      return true;
    }

    // Add new timestamp
    entry.timestamps.push(now);
    return false;
  }

  /**
   * Get remaining quota for a key
   */
  getRemainingQuota(key: string, maxRequests: number, windowMs: number): number {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry) {
      return maxRequests;
    }

    // Count requests within window
    const recentRequests = entry.timestamps.filter(ts => now - ts < windowMs).length;
    return Math.max(0, maxRequests - recentRequests);
  }

  /**
   * Get time until next available slot (in ms)
   */
  getTimeUntilReset(key: string, maxRequests: number, windowMs: number): number {
    const entry = this.entries.get(key);
    if (!entry || entry.timestamps.length < maxRequests) {
      return 0;
    }

    const now = Date.now();
    const oldestRelevant = entry.timestamps.find(ts => now - ts < windowMs);

    if (!oldestRelevant) {
      return 0;
    }

    return Math.max(0, windowMs - (now - oldestRelevant));
  }

  /**
   * Remove old entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    for (const [key, entry] of this.entries.entries()) {
      // Remove entries with no recent timestamps
      entry.timestamps = entry.timestamps.filter(ts => now - ts < maxAge);

      if (entry.timestamps.length === 0) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
const rateLimiter = new WorkshopRateLimiter();

/**
 * Rate limit configurations for workshop operations
 */
export const RateLimitConfig = {
  publishPerSession: {
    max: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  publishPerWorkshop: {
    max: 50,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  runsPerWorkshop: {
    max: 100,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
  },
  runsPerSession: {
    max: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
};

/**
 * Check if a publish action is rate limited
 */
export function isPublishRateLimited(
  workshopId: string,
  sessionId: string
): { limited: boolean; remaining: number; resetMs: number } {
  const sessionKey = `publish:${workshopId}:${sessionId}`;
  const workshopKey = `publish:${workshopId}`;

  const sessionLimited = rateLimiter.isRateLimited(
    sessionKey,
    RateLimitConfig.publishPerSession.max,
    RateLimitConfig.publishPerSession.windowMs
  );

  const workshopLimited = rateLimiter.isRateLimited(
    workshopKey,
    RateLimitConfig.publishPerWorkshop.max,
    RateLimitConfig.publishPerWorkshop.windowMs
  );

  const limited = sessionLimited || workshopLimited;

  const sessionRemaining = rateLimiter.getRemainingQuota(
    sessionKey,
    RateLimitConfig.publishPerSession.max,
    RateLimitConfig.publishPerSession.windowMs
  );

  const workshopRemaining = rateLimiter.getRemainingQuota(
    workshopKey,
    RateLimitConfig.publishPerWorkshop.max,
    RateLimitConfig.publishPerWorkshop.windowMs
  );

  const remaining = Math.min(sessionRemaining, workshopRemaining);

  const sessionResetMs = rateLimiter.getTimeUntilReset(
    sessionKey,
    RateLimitConfig.publishPerSession.max,
    RateLimitConfig.publishPerSession.windowMs
  );

  const workshopResetMs = rateLimiter.getTimeUntilReset(
    workshopKey,
    RateLimitConfig.publishPerWorkshop.max,
    RateLimitConfig.publishPerWorkshop.windowMs
  );

  const resetMs = Math.max(sessionResetMs, workshopResetMs);

  return { limited, remaining, resetMs };
}

/**
 * Check if a run action is rate limited
 */
export function isRunRateLimited(
  workshopId: string,
  sessionId: string
): { limited: boolean; remaining: number; resetMs: number } {
  const sessionKey = `run:${workshopId}:${sessionId}`;
  const workshopKey = `run:${workshopId}`;

  const sessionLimited = rateLimiter.isRateLimited(
    sessionKey,
    RateLimitConfig.runsPerSession.max,
    RateLimitConfig.runsPerSession.windowMs
  );

  const workshopLimited = rateLimiter.isRateLimited(
    workshopKey,
    RateLimitConfig.runsPerWorkshop.max,
    RateLimitConfig.runsPerWorkshop.windowMs
  );

  const limited = sessionLimited || workshopLimited;

  const sessionRemaining = rateLimiter.getRemainingQuota(
    sessionKey,
    RateLimitConfig.runsPerSession.max,
    RateLimitConfig.runsPerSession.windowMs
  );

  const workshopRemaining = rateLimiter.getRemainingQuota(
    workshopKey,
    RateLimitConfig.runsPerWorkshop.max,
    RateLimitConfig.runsPerWorkshop.windowMs
  );

  const remaining = Math.min(sessionRemaining, workshopRemaining);

  const sessionResetMs = rateLimiter.getTimeUntilReset(
    sessionKey,
    RateLimitConfig.runsPerSession.max,
    RateLimitConfig.runsPerSession.windowMs
  );

  const workshopResetMs = rateLimiter.getTimeUntilReset(
    workshopKey,
    RateLimitConfig.runsPerWorkshop.max,
    RateLimitConfig.runsPerWorkshop.windowMs
  );

  const resetMs = Math.max(sessionResetMs, workshopResetMs);

  return { limited, remaining, resetMs };
}

export { rateLimiter };
