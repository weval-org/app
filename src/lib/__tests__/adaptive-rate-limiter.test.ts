/**
 * Comprehensive tests for AdaptiveRateLimiter
 *
 * Tests cover all edge cases, AIMD algorithm behavior, and thread safety.
 */

import { AdaptiveRateLimiter, Logger } from '../adaptive-rate-limiter';
import { ProviderRateLimitProfile } from '../provider-rate-limits';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('AdaptiveRateLimiter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration Validation', () => {
    it('should reject invalid minConcurrency (<=0)', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 0, // Invalid
        adaptiveEnabled: true,
      };

      expect(() => new AdaptiveRateLimiter('test', profile, mockLogger)).toThrow(
        'minConcurrency must be > 0'
      );
    });

    it('should reject maxConcurrency < minConcurrency', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 5, // Less than min
        minConcurrency: 10,
        adaptiveEnabled: true,
      };

      expect(() => new AdaptiveRateLimiter('test', profile, mockLogger)).toThrow(
        'maxConcurrency (5) must be >= minConcurrency (10)'
      );
    });

    it('should reject initialConcurrency below minConcurrency', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 2, // Below min
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      expect(() => new AdaptiveRateLimiter('test', profile, mockLogger)).toThrow(
        'initialConcurrency (2) must be between min (5) and max (20)'
      );
    });

    it('should reject initialConcurrency above maxConcurrency', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 25, // Above max
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      expect(() => new AdaptiveRateLimiter('test', profile, mockLogger)).toThrow(
        'initialConcurrency (25) must be between min (5) and max (20)'
      );
    });

    it('should accept valid configuration', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);
      expect(limiter.getCurrentConcurrency()).toBe(10);
    });
  });

  describe('AIMD Algorithm - Additive Increase', () => {
    it('should increase concurrency after 10 consecutive successes', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // Call onSuccess 9 times - should not increase yet
      for (let i = 0; i < 9; i++) {
        limiter.onSuccess();
      }
      expect(limiter.getCurrentConcurrency()).toBe(10);

      // 10th success should trigger increase
      limiter.onSuccess();
      expect(limiter.getCurrentConcurrency()).toBe(11);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Increased concurrency 10→11')
      );
    });

    it('should not exceed maxConcurrency', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 19,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // Increase to max
      for (let i = 0; i < 10; i++) {
        limiter.onSuccess();
      }
      expect(limiter.getCurrentConcurrency()).toBe(20);

      // Try to increase beyond max - should stay at 20
      for (let i = 0; i < 10; i++) {
        limiter.onSuccess();
      }
      expect(limiter.getCurrentConcurrency()).toBe(20);
    });

    it('should reset success counter after increase', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // First increase
      for (let i = 0; i < 10; i++) {
        limiter.onSuccess();
      }
      expect(limiter.getCurrentConcurrency()).toBe(11);

      // Should need another 10 successes for next increase
      for (let i = 0; i < 9; i++) {
        limiter.onSuccess();
      }
      expect(limiter.getCurrentConcurrency()).toBe(11); // No change yet

      limiter.onSuccess();
      expect(limiter.getCurrentConcurrency()).toBe(12); // Increased
    });
  });

  describe('AIMD Algorithm - Multiplicative Decrease', () => {
    it('should decrease concurrency by 50% on rate limit', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 20,
        maxConcurrency: 30,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      limiter.onRateLimit();
      expect(limiter.getCurrentConcurrency()).toBe(10); // 20 * 0.5
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Decreased concurrency 20→10 (×0.5)')
      );
    });

    it('should not go below minConcurrency', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 8,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      limiter.onRateLimit(); // 8 * 0.5 = 4, but floor is 5
      expect(limiter.getCurrentConcurrency()).toBe(5);
    });

    it('should decrease by at least 1 to ensure progress', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 5,
        maxConcurrency: 20,
        minConcurrency: 2,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      limiter.onRateLimit(); // 5 * 0.5 = 2.5, floor = 2
      expect(limiter.getCurrentConcurrency()).toBe(2);

      limiter.onRateLimit(); // 2 * 0.5 = 1, but would violate MIN_DECREASE
      expect(limiter.getCurrentConcurrency()).toBe(2); // Stays at min
    });

    it('should reset success counter on rate limit', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // Build up success counter
      for (let i = 0; i < 8; i++) {
        limiter.onSuccess();
      }

      // Rate limit should reset counter
      limiter.onRateLimit();

      // Should need 10 more successes (not just 2) to increase
      limiter.onSuccess();
      limiter.onSuccess();
      expect(limiter.getCurrentConcurrency()).toBe(5); // Still at decreased value

      // Need 8 more successes
      for (let i = 0; i < 8; i++) {
        limiter.onSuccess();
      }
      expect(limiter.getCurrentConcurrency()).toBe(6); // Now increased
    });
  });

  describe('Rate Limit Cooldown', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should prevent multiple rapid decreases within cooldown period', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 20,
        maxConcurrency: 30,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // First rate limit
      limiter.onRateLimit();
      expect(limiter.getCurrentConcurrency()).toBe(10);

      // Immediate second rate limit - should be ignored
      limiter.onRateLimit();
      expect(limiter.getCurrentConcurrency()).toBe(10); // No change
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('in cooldown period')
      );

      // Advance time by 4 seconds (still in cooldown)
      jest.advanceTimersByTime(4000);
      limiter.onRateLimit();
      expect(limiter.getCurrentConcurrency()).toBe(10); // Still no change

      // Advance past cooldown (5+ seconds total)
      jest.advanceTimersByTime(1500);
      limiter.onRateLimit();
      expect(limiter.getCurrentConcurrency()).toBe(5); // Now decreased
    });

    it('should allow decrease after cooldown expires', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 20,
        maxConcurrency: 30,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      limiter.onRateLimit();
      expect(limiter.getCurrentConcurrency()).toBe(10);

      // Wait for cooldown to expire
      jest.advanceTimersByTime(5001); // Just past 5 seconds

      limiter.onRateLimit();
      expect(limiter.getCurrentConcurrency()).toBe(5); // Decreased again
    });
  });

  describe('Non-Adaptive Mode', () => {
    it('should not change concurrency on success when adaptive is disabled', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: false, // Disabled
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      for (let i = 0; i < 50; i++) {
        limiter.onSuccess();
      }

      expect(limiter.getCurrentConcurrency()).toBe(10); // No change
    });

    it('should not change concurrency on rate limit when adaptive is disabled', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: false, // Disabled
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      limiter.onRateLimit();
      expect(limiter.getCurrentConcurrency()).toBe(10); // No change
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('adaptation is disabled')
      );
    });
  });

  describe('Error Handling', () => {
    it('should reset success counter on error', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // Build up success counter
      for (let i = 0; i < 8; i++) {
        limiter.onSuccess();
      }

      // Error should reset counter
      limiter.onError();

      // Should need 10 more successes (not just 2) to increase
      limiter.onSuccess();
      limiter.onSuccess();
      expect(limiter.getCurrentConcurrency()).toBe(10); // No increase yet
    });

    it('should not change concurrency on error', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      const before = limiter.getCurrentConcurrency();
      limiter.onError();
      const after = limiter.getCurrentConcurrency();

      expect(before).toBe(after);
    });
  });

  describe('Idle Timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should reset to initial concurrency after idle timeout', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // Increase concurrency
      for (let i = 0; i < 20; i++) {
        limiter.onSuccess();
      }
      expect(limiter.getCurrentConcurrency()).toBe(12);

      // Idle for 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000 + 100);

      // Next call to getCurrentConcurrency should trigger reset
      const concurrency = limiter.getCurrentConcurrency();
      expect(concurrency).toBe(10); // Reset to initial
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Idle timeout')
      );
    });

    it('should not reset if there are recent requests', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // Increase concurrency
      for (let i = 0; i < 10; i++) {
        limiter.onSuccess();
      }
      expect(limiter.getCurrentConcurrency()).toBe(11);

      // Wait 4 minutes
      jest.advanceTimersByTime(4 * 60 * 1000);

      // Make a request (updates lastRequestTime)
      limiter.onSuccess();

      // Wait another 4 minutes (total 8, but last request was only 4 min ago)
      jest.advanceTimersByTime(4 * 60 * 1000);

      expect(limiter.getCurrentConcurrency()).toBe(11); // No reset
    });
  });

  describe('State Management', () => {
    it('should return correct state', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('openrouter', profile, mockLogger);

      // Make some operations
      limiter.onSuccess();
      limiter.onSuccess();

      const state = limiter.getState();
      expect(state.provider).toBe('openrouter');
      expect(state.currentConcurrency).toBe(10);
      expect(state.successCount).toBe(2);
      expect(state.totalSuccesses).toBe(2);
      expect(state.totalRateLimits).toBe(0);
      expect(state.isInCooldown).toBe(false);
    });

    it('should track total rate limits', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      limiter.onRateLimit();
      limiter.onRateLimit();
      limiter.onRateLimit();

      const state = limiter.getState();
      expect(state.totalRateLimits).toBe(3);
    });

    it('should reset state correctly', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // Make some changes
      for (let i = 0; i < 10; i++) {
        limiter.onSuccess();
      }
      limiter.onRateLimit();

      // Reset
      limiter.reset();

      const state = limiter.getState();
      expect(state.currentConcurrency).toBe(10); // Back to initial
      expect(state.successCount).toBe(0);
      expect(state.totalSuccesses).toBe(0);
      expect(state.totalRateLimits).toBe(0);
      expect(state.lastRateLimitTime).toBe(null);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent success calls correctly', async () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // Simulate concurrent success calls
      const promises = Array.from({ length: 20 }, () =>
        Promise.resolve().then(() => limiter.onSuccess())
      );

      await Promise.all(promises);

      // Should have increased twice: 10→11 after first 10, then 11→12 after next 10
      expect(limiter.getCurrentConcurrency()).toBe(12);
    });

    it('should handle alternating success and error pattern', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // Alternate success and error
      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          limiter.onSuccess();
        } else {
          limiter.onError();
        }
      }

      // Should never accumulate enough successes to increase
      expect(limiter.getCurrentConcurrency()).toBe(10);
    });

    it('should handle rate limit with retryAfter parameter', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 20,
        maxConcurrency: 30,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      limiter.onRateLimit(60); // Retry after 60 seconds

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retry after 60s')
      );
    });

    it('should handle minimum concurrency of 1', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 2,
        maxConcurrency: 10,
        minConcurrency: 1,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // Decrease multiple times
      limiter.onRateLimit(); // 2 → 1
      expect(limiter.getCurrentConcurrency()).toBe(1);

      limiter.onRateLimit(); // Should stay at 1
      expect(limiter.getCurrentConcurrency()).toBe(1);
    });

    it('should handle provider never rate limiting (increase to max)', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 15,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      // Lots of successes - should reach max
      for (let i = 0; i < 100; i++) {
        limiter.onSuccess();
      }

      expect(limiter.getCurrentConcurrency()).toBe(15);
    });

    it('should handle provider constantly rate limiting (decrease to min)', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 20,
        maxConcurrency: 30,
        minConcurrency: 3,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('test', profile, mockLogger);

      jest.useFakeTimers();

      // Rapid rate limits
      limiter.onRateLimit(); // 20 → 10
      jest.advanceTimersByTime(6000);

      limiter.onRateLimit(); // 10 → 5
      jest.advanceTimersByTime(6000);

      limiter.onRateLimit(); // 5 → 3 (min)
      jest.advanceTimersByTime(6000);

      limiter.onRateLimit(); // Stay at 3
      expect(limiter.getCurrentConcurrency()).toBe(3);

      jest.useRealTimers();
    });
  });

  describe('Logging', () => {
    it('should log initialization', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      new AdaptiveRateLimiter('openrouter', profile, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[AdaptiveRateLimiter][openrouter] Initialized: initial=10, min=5, max=20, adaptive=true'
      );
    });

    it('should log concurrency increases', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('openrouter', profile, mockLogger);

      for (let i = 0; i < 10; i++) {
        limiter.onSuccess();
      }

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[AdaptiveRateLimiter][openrouter] Increased concurrency')
      );
    });

    it('should log concurrency decreases', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 20,
        maxConcurrency: 30,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('openrouter', profile, mockLogger);

      limiter.onRateLimit();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[AdaptiveRateLimiter][openrouter] Rate limit detected!')
      );
    });

    it('should log reset operations', () => {
      const profile: ProviderRateLimitProfile = {
        initialConcurrency: 10,
        maxConcurrency: 20,
        minConcurrency: 5,
        adaptiveEnabled: true,
      };

      const limiter = new AdaptiveRateLimiter('openrouter', profile, mockLogger);

      limiter.reset();

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[AdaptiveRateLimiter][openrouter] Reset to initial state'
      );
    });
  });
});
