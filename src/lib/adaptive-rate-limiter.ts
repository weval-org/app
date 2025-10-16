/**
 * AdaptiveRateLimiter
 *
 * Implements AIMD (Additive Increase, Multiplicative Decrease) algorithm for dynamic
 * rate limit adaptation. Increases concurrency gradually on success, decreases
 * aggressively on rate limit errors.
 *
 * Thread-safe and designed for production use with comprehensive logging.
 */

import { ProviderRateLimitProfile } from './provider-rate-limits';

/**
 * AIMD Algorithm Parameters
 */
const AIMD_CONFIG = {
  /** Number of consecutive successes before increasing concurrency */
  SUCCESS_THRESHOLD: 10,

  /** Multiplicative decrease factor on rate limit (0.5 = cut in half) */
  DECREASE_FACTOR: 0.5,

  /** Minimum decrease amount to ensure progress */
  MIN_DECREASE: 1,

  /** Cooldown period (ms) after a decrease before allowing another decrease */
  DECREASE_COOLDOWN_MS: 5000,

  /** Idle timeout (ms) - reset to initial if no requests for this long */
  IDLE_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * Rate limiter state for observability
 */
export interface RateLimiterState {
  provider: string;
  currentConcurrency: number;
  successCount: number;
  totalSuccesses: number;
  totalRateLimits: number;
  lastRateLimitTime: number | null;
  lastRequestTime: number;
  isInCooldown: boolean;
}

/**
 * Logger interface (compatible with console and winston-style loggers)
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug?(message: string): void;
}

/**
 * AdaptiveRateLimiter
 *
 * Manages concurrency limits for a single provider, adapting based on rate limit feedback.
 */
export class AdaptiveRateLimiter {
  private readonly provider: string;
  private readonly profile: ProviderRateLimitProfile;
  private readonly logger: Logger;

  // State
  private currentConcurrency: number;
  private successCount: number = 0;
  private totalSuccesses: number = 0;
  private totalRateLimits: number = 0;
  private lastRateLimitTime: number | null = null;
  private lastRequestTime: number = Date.now();

  /**
   * Create a new adaptive rate limiter for a provider
   * @param provider Provider name (e.g., 'openrouter')
   * @param profile Rate limit profile with min/max/initial values
   * @param logger Logger instance for observability
   */
  constructor(provider: string, profile: ProviderRateLimitProfile, logger: Logger) {
    // Validate configuration
    if (profile.minConcurrency <= 0) {
      throw new Error(`[AdaptiveRateLimiter][${provider}] minConcurrency must be > 0, got ${profile.minConcurrency}`);
    }
    if (profile.maxConcurrency < profile.minConcurrency) {
      throw new Error(`[AdaptiveRateLimiter][${provider}] maxConcurrency (${profile.maxConcurrency}) must be >= minConcurrency (${profile.minConcurrency})`);
    }
    if (profile.initialConcurrency < profile.minConcurrency || profile.initialConcurrency > profile.maxConcurrency) {
      throw new Error(`[AdaptiveRateLimiter][${provider}] initialConcurrency (${profile.initialConcurrency}) must be between min (${profile.minConcurrency}) and max (${profile.maxConcurrency})`);
    }

    this.provider = provider;
    this.profile = profile;
    this.logger = logger;
    this.currentConcurrency = profile.initialConcurrency;

    this.logger.info(
      `[AdaptiveRateLimiter][${this.provider}] Initialized: ` +
      `initial=${profile.initialConcurrency}, ` +
      `min=${profile.minConcurrency}, ` +
      `max=${profile.maxConcurrency}, ` +
      `adaptive=${profile.adaptiveEnabled}`
    );
  }

  /**
   * Call this after a successful API request
   * Gradually increases concurrency using additive increase
   */
  onSuccess(): void {
    this.lastRequestTime = Date.now();
    this.totalSuccesses++;

    if (!this.profile.adaptiveEnabled) {
      return; // Fixed concurrency mode
    }

    this.successCount++;

    // Additive increase: +1 after SUCCESS_THRESHOLD consecutive successes
    if (this.successCount >= AIMD_CONFIG.SUCCESS_THRESHOLD) {
      if (this.currentConcurrency < this.profile.maxConcurrency) {
        const oldConcurrency = this.currentConcurrency;
        this.currentConcurrency = Math.min(
          this.currentConcurrency + 1,
          this.profile.maxConcurrency
        );

        this.logger.info(
          `[AdaptiveRateLimiter][${this.provider}] Increased concurrency ${oldConcurrency}→${this.currentConcurrency} ` +
          `(after ${AIMD_CONFIG.SUCCESS_THRESHOLD} successes)`
        );
      }

      this.successCount = 0; // Reset counter
    }
  }

  /**
   * Call this when a rate limit (429) is detected
   * Aggressively decreases concurrency using multiplicative decrease
   */
  onRateLimit(retryAfter?: number): void {
    this.lastRequestTime = Date.now();
    this.totalRateLimits++;

    if (!this.profile.adaptiveEnabled) {
      this.logger.warn(
        `[AdaptiveRateLimiter][${this.provider}] Rate limit detected but adaptation is disabled (fixed concurrency=${this.currentConcurrency})`
      );
      return;
    }

    // Check cooldown to prevent multiple rapid decreases
    if (this.isInCooldown()) {
      this.logger.warn(
        `[AdaptiveRateLimiter][${this.provider}] Rate limit detected but in cooldown period. ` +
        `Concurrency remains at ${this.currentConcurrency}`
      );
      return;
    }

    // Multiplicative decrease
    const oldConcurrency = this.currentConcurrency;
    const decreased = Math.floor(this.currentConcurrency * AIMD_CONFIG.DECREASE_FACTOR);
    // Take the more aggressive decrease (smaller value) between multiplicative and minimum decrease
    const withMinDecrease = Math.min(decreased, this.currentConcurrency - AIMD_CONFIG.MIN_DECREASE);
    // But never go below minConcurrency floor
    this.currentConcurrency = Math.max(withMinDecrease, this.profile.minConcurrency);

    this.lastRateLimitTime = Date.now();
    this.successCount = 0; // Reset success counter

    const retryInfo = retryAfter !== undefined
      ? ` Retry after ${retryAfter}s.`
      : '';

    this.logger.warn(
      `[AdaptiveRateLimiter][${this.provider}] Rate limit detected! ` +
      `Decreased concurrency ${oldConcurrency}→${this.currentConcurrency} (×${AIMD_CONFIG.DECREASE_FACTOR}).${retryInfo}`
    );
  }

  /**
   * Call this when any non-rate-limit error occurs
   * Resets success counter but doesn't change concurrency
   */
  onError(): void {
    this.lastRequestTime = Date.now();
    this.successCount = 0; // Reset success counter
    // Don't change concurrency - let circuit breaker handle other errors
  }

  /**
   * Get the current concurrency limit
   * @returns Current number of concurrent requests allowed
   */
  getCurrentConcurrency(): number {
    // Check for idle timeout - reset to initial if no requests for IDLE_TIMEOUT_MS
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest > AIMD_CONFIG.IDLE_TIMEOUT_MS && this.currentConcurrency !== this.profile.initialConcurrency) {
      this.logger.info(
        `[AdaptiveRateLimiter][${this.provider}] Idle timeout (${timeSinceLastRequest}ms). ` +
        `Resetting concurrency ${this.currentConcurrency}→${this.profile.initialConcurrency}`
      );
      this.currentConcurrency = this.profile.initialConcurrency;
      this.successCount = 0;
      this.lastRateLimitTime = null;
    }

    return this.currentConcurrency;
  }

  /**
   * Check if we're in a cooldown period after a rate limit
   * @returns true if in cooldown (can't decrease again yet)
   */
  isInCooldown(): boolean {
    if (this.lastRateLimitTime === null) {
      return false;
    }

    const timeSinceLastDecrease = Date.now() - this.lastRateLimitTime;
    return timeSinceLastDecrease < AIMD_CONFIG.DECREASE_COOLDOWN_MS;
  }

  /**
   * Get current state for monitoring/debugging
   * @returns Current limiter state
   */
  getState(): RateLimiterState {
    return {
      provider: this.provider,
      currentConcurrency: this.getCurrentConcurrency(),
      successCount: this.successCount,
      totalSuccesses: this.totalSuccesses,
      totalRateLimits: this.totalRateLimits,
      lastRateLimitTime: this.lastRateLimitTime,
      lastRequestTime: this.lastRequestTime,
      isInCooldown: this.isInCooldown(),
    };
  }

  /**
   * Reset the limiter to initial state (useful for testing)
   */
  reset(): void {
    this.currentConcurrency = this.profile.initialConcurrency;
    this.successCount = 0;
    this.totalSuccesses = 0;
    this.totalRateLimits = 0;
    this.lastRateLimitTime = null;
    this.lastRequestTime = Date.now();

    this.logger.info(`[AdaptiveRateLimiter][${this.provider}] Reset to initial state`);
  }
}
