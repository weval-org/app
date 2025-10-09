/**
 * Workshop API Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { generateWorkshopId, isValidWorkshopId, createWorkshopSession } from '@/lib/workshop-utils';

describe('Workshop Utilities', () => {
  describe('generateWorkshopId', () => {
    it('should generate a valid workshop ID in format word-word-###', () => {
      const id = generateWorkshopId();
      expect(isValidWorkshopId(id)).toBe(true);
      expect(id).toMatch(/^[a-z]+-[a-z]+-\d{1,3}$/);
    });

    it('should generate different IDs', () => {
      const id1 = generateWorkshopId();
      const id2 = generateWorkshopId();
      // Very unlikely to be the same
      expect(id1).not.toBe(id2);
    });
  });

  describe('isValidWorkshopId', () => {
    it('should validate correct format', () => {
      expect(isValidWorkshopId('crimson-elephant-742')).toBe(true);
      expect(isValidWorkshopId('azure-tiger-1')).toBe(true);
      expect(isValidWorkshopId('golden-phoenix-999')).toBe(true);
    });

    it('should reject incorrect formats', () => {
      expect(isValidWorkshopId('invalid')).toBe(false);
      expect(isValidWorkshopId('crimson-elephant')).toBe(false);
      expect(isValidWorkshopId('crimson-elephant-')).toBe(false);
      expect(isValidWorkshopId('crimson-elephant-1234')).toBe(false); // 4 digits
      expect(isValidWorkshopId('Crimson-Elephant-742')).toBe(false); // capitals
      expect(isValidWorkshopId('crimson_elephant_742')).toBe(false); // underscores
    });
  });

  describe('createWorkshopSession', () => {
    it('should create a session with required fields', () => {
      const session = createWorkshopSession('test-workshop-123');

      expect(session.workshopId).toBe('test-workshop-123');
      expect(session.sessionId).toMatch(/^ws_/);
      expect(session.displayName).toBeNull();
      expect(session.createdAt).toBeTruthy();
      expect(session.lastActiveAt).toBeTruthy();
    });

    it('should accept optional display name', () => {
      const session = createWorkshopSession('test-workshop-123', 'Alice');
      expect(session.displayName).toBe('Alice');
    });

    it('should handle null display name', () => {
      const session = createWorkshopSession('test-workshop-123', null);
      expect(session.displayName).toBeNull();
    });
  });
});

describe('Workshop ID Generation Patterns', () => {
  it('should generate IDs from word lists', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateWorkshopId());
    }

    // Should generate diverse IDs
    expect(ids.size).toBeGreaterThan(90); // Very unlikely to have many duplicates
  });

  it('should have readable format', () => {
    const id = generateWorkshopId();
    const parts = id.split('-');

    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[a-z]+$/); // adjective
    expect(parts[1]).toMatch(/^[a-z]+$/); // noun
    expect(parts[2]).toMatch(/^\d{1,3}$/); // number
  });
});

describe('Session ID Generation', () => {
  it('should generate unique session IDs', () => {
    const session1 = createWorkshopSession('workshop-1');
    const session2 = createWorkshopSession('workshop-1');

    expect(session1.sessionId).not.toBe(session2.sessionId);
  });

  it('should create timestamps correctly', () => {
    const before = Date.now();
    const session = createWorkshopSession('workshop-1');
    const after = Date.now();

    const createdAt = new Date(session.createdAt).getTime();
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(after);
  });
});
