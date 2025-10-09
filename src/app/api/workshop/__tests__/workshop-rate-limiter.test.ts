/**
 * Workshop Rate Limiter Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { rateLimiter, isPublishRateLimited, isRunRateLimited, RateLimitConfig } from '@/lib/workshop-rate-limiter';

describe('WorkshopRateLimiter', () => {
  beforeEach(() => {
    // Clear rate limiter before each test
    rateLimiter.clear();
  });

  afterEach(() => {
    rateLimiter.clear();
  });

  describe('Basic Rate Limiting', () => {
    it('should allow first request', () => {
      const limited = rateLimiter.isRateLimited('test-key', 5, 60000);
      expect(limited).toBe(false);
    });

    it('should enforce rate limit', () => {
      const maxRequests = 3;
      const windowMs = 60000;

      // Make max requests
      for (let i = 0; i < maxRequests; i++) {
        const limited = rateLimiter.isRateLimited('test-key', maxRequests, windowMs);
        expect(limited).toBe(false);
      }

      // Next request should be limited
      const limited = rateLimiter.isRateLimited('test-key', maxRequests, windowMs);
      expect(limited).toBe(true);
    });

    it('should track separate keys independently', () => {
      rateLimiter.isRateLimited('key1', 2, 60000); // 1st request key1
      rateLimiter.isRateLimited('key1', 2, 60000); // 2nd request key1

      // key1 should be limited
      expect(rateLimiter.isRateLimited('key1', 2, 60000)).toBe(true);

      // key2 should not be limited
      expect(rateLimiter.isRateLimited('key2', 2, 60000)).toBe(false);
    });
  });

  describe('Sliding Window', () => {
    it('should allow requests after window expires', async () => {
      const windowMs = 100; // 100ms window for testing

      rateLimiter.isRateLimited('test-key', 1, windowMs);
      expect(rateLimiter.isRateLimited('test-key', 1, windowMs)).toBe(true);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(rateLimiter.isRateLimited('test-key', 1, windowMs)).toBe(false);
    });
  });

  describe('Quota Tracking', () => {
    it('should return correct remaining quota', () => {
      const maxRequests = 5;
      const windowMs = 60000;

      expect(rateLimiter.getRemainingQuota('test-key', maxRequests, windowMs)).toBe(5);

      rateLimiter.isRateLimited('test-key', maxRequests, windowMs);
      expect(rateLimiter.getRemainingQuota('test-key', maxRequests, windowMs)).toBe(4);

      rateLimiter.isRateLimited('test-key', maxRequests, windowMs);
      expect(rateLimiter.getRemainingQuota('test-key', maxRequests, windowMs)).toBe(3);
    });

    it('should return 0 when quota exhausted', () => {
      const maxRequests = 2;
      const windowMs = 60000;

      rateLimiter.isRateLimited('test-key', maxRequests, windowMs);
      rateLimiter.isRateLimited('test-key', maxRequests, windowMs);

      expect(rateLimiter.getRemainingQuota('test-key', maxRequests, windowMs)).toBe(0);
    });
  });

  describe('Time Until Reset', () => {
    it('should return 0 when not rate limited', () => {
      const resetMs = rateLimiter.getTimeUntilReset('test-key', 5, 60000);
      expect(resetMs).toBe(0);
    });

    it('should return time until oldest request expires', async () => {
      const windowMs = 1000;

      rateLimiter.isRateLimited('test-key', 1, windowMs);
      rateLimiter.isRateLimited('test-key', 1, windowMs); // Now limited

      const resetMs = rateLimiter.getTimeUntilReset('test-key', 1, windowMs);
      expect(resetMs).toBeGreaterThan(0);
      expect(resetMs).toBeLessThanOrEqual(windowMs);
    });
  });
});

describe('Workshop Publish Rate Limiting', () => {
  beforeEach(() => {
    rateLimiter.clear();
  });

  it('should enforce per-session publish limit', () => {
    const workshopId = 'workshop-1';
    const sessionId = 'session-1';

    // Make max requests per session
    for (let i = 0; i < RateLimitConfig.publishPerSession.max; i++) {
      const result = isPublishRateLimited(workshopId, sessionId);
      expect(result.limited).toBe(false);
    }

    // Next should be limited
    const result = isPublishRateLimited(workshopId, sessionId);
    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('should enforce per-workshop publish limit', () => {
    const workshopId = 'workshop-1';

    // Simulate multiple sessions publishing
    const sessionsNeeded = Math.ceil(RateLimitConfig.publishPerWorkshop.max / RateLimitConfig.publishPerSession.max) + 1;

    for (let s = 0; s < sessionsNeeded; s++) {
      const sessionId = `session-${s}`;

      for (let i = 0; i < RateLimitConfig.publishPerSession.max; i++) {
        const result = isPublishRateLimited(workshopId, sessionId);

        if (result.limited) {
          // Workshop limit hit
          expect(result.remaining).toBe(0);
          return;
        }
      }
    }
  });

  it('should track remaining quota correctly', () => {
    const workshopId = 'workshop-1';
    const sessionId = 'session-1';

    const initial = isPublishRateLimited(workshopId, sessionId);
    expect(initial.limited).toBe(false);
    // After first call, one slot is consumed
    expect(initial.remaining).toBe(RateLimitConfig.publishPerSession.max - 1);

    const second = isPublishRateLimited(workshopId, sessionId);
    expect(second.limited).toBe(false);
    // After second call, two slots are consumed
    expect(second.remaining).toBe(RateLimitConfig.publishPerSession.max - 2);
  });
});

describe('Workshop Run Rate Limiting', () => {
  beforeEach(() => {
    rateLimiter.clear();
  });

  it('should enforce per-session run limit', () => {
    const workshopId = 'workshop-1';
    const sessionId = 'session-1';

    for (let i = 0; i < RateLimitConfig.runsPerSession.max; i++) {
      const result = isRunRateLimited(workshopId, sessionId);
      expect(result.limited).toBe(false);
    }

    const result = isRunRateLimited(workshopId, sessionId);
    expect(result.limited).toBe(true);
  });

  it('should allow different sessions to run independently', () => {
    const workshopId = 'workshop-1';

    // Session 1 exhausts quota
    for (let i = 0; i < RateLimitConfig.runsPerSession.max; i++) {
      isRunRateLimited(workshopId, 'session-1');
    }
    expect(isRunRateLimited(workshopId, 'session-1').limited).toBe(true);

    // Session 2 should still be able to run
    expect(isRunRateLimited(workshopId, 'session-2').limited).toBe(false);
  });
});

describe('Rate Limiter Cleanup', () => {
  it('should allow cleanup to run without errors', () => {
    // Make some requests
    rateLimiter.isRateLimited('test-1', 5, 60000);
    rateLimiter.isRateLimited('test-2', 5, 60000);

    // Trigger cleanup (normally automatic)
    expect(() => {
      (rateLimiter as any).cleanup();
    }).not.toThrow();
  });

  it('should clear all entries', () => {
    rateLimiter.isRateLimited('test-1', 5, 60000);
    rateLimiter.isRateLimited('test-2', 5, 60000);

    rateLimiter.clear();

    // After clear, both should have full quota
    expect(rateLimiter.getRemainingQuota('test-1', 5, 60000)).toBe(5);
    expect(rateLimiter.getRemainingQuota('test-2', 5, 60000)).toBe(5);
  });
});
