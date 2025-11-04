/**
 * Simple in-memory rate limiter for webhook endpoints
 * Uses sliding window algorithm to track requests per user/IP
 */

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

interface RequestLog {
  timestamps: number[];
}

class RateLimiter {
  private requests: Map<string, RequestLog> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;

    // Clean up old entries every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Check if a request should be allowed
   * Returns { allowed: true } if request is within limit
   * Returns { allowed: false, retryAfter: number } if rate limit exceeded
   */
  check(identifier: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get or create request log for this identifier
    let log = this.requests.get(identifier);
    if (!log) {
      log = { timestamps: [] };
      this.requests.set(identifier, log);
    }

    // Remove timestamps outside the current window
    log.timestamps = log.timestamps.filter(ts => ts > windowStart);

    // Check if limit exceeded
    if (log.timestamps.length >= this.config.maxRequests) {
      const oldestRequest = log.timestamps[0];
      const retryAfter = Math.ceil((oldestRequest + this.config.windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Add current request
    log.timestamps.push(now);
    return { allowed: true };
  }

  /**
   * Clean up entries that are completely outside the window
   */
  private cleanup() {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [identifier, log] of this.requests.entries()) {
      // Remove old timestamps
      log.timestamps = log.timestamps.filter(ts => ts > windowStart);

      // Remove entry if no recent requests
      if (log.timestamps.length === 0) {
        this.requests.delete(identifier);
      }
    }
  }

  /**
   * Get current rate limit status for an identifier
   */
  getStatus(identifier: string): { requests: number; limit: number; remaining: number; resetAt: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const log = this.requests.get(identifier);
    if (!log) {
      return {
        requests: 0,
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests,
        resetAt: now + this.config.windowMs,
      };
    }

    // Clean old timestamps
    log.timestamps = log.timestamps.filter(ts => ts > windowStart);

    const requests = log.timestamps.length;
    const resetAt = log.timestamps.length > 0
      ? log.timestamps[0] + this.config.windowMs
      : now + this.config.windowMs;

    return {
      requests,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - requests),
      resetAt,
    };
  }
}

// Rate limiters for different use cases

/**
 * Rate limiter for PR evaluations per user
 * Max 10 PR evaluations per user per hour
 */
export const prEvaluationLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
});

/**
 * Rate limiter for webhook requests per IP
 * Max 100 webhook requests per IP per hour
 */
export const webhookIPLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 100,
});

/**
 * Rate limiter for global webhook requests
 * Max 500 total webhook requests per hour
 */
export const webhookGlobalLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 500,
});
