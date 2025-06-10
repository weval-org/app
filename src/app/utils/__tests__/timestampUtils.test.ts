import { toSafeTimestamp, fromSafeTimestamp, formatTimestampForDisplay } from '../timestampUtils';

describe('timestampUtils', () => {

  // Test case based on the real-world issue we just solved
  const realWorldLegacyTimestamp = '2025-06-08T19:01:25.225Z';
  const correspondingSafeTimestamp = '2025-06-08T19-01-25-225Z';

  describe('toSafeTimestamp', () => {
    it('should convert a standard ISO timestamp to a URL-safe format', () => {
      expect(toSafeTimestamp(realWorldLegacyTimestamp)).toBe(correspondingSafeTimestamp);
    });

    it('should handle timestamps without milliseconds', () => {
      const isoTimestamp = '2023-01-01T12:00:00Z';
      const expectedSafeTimestamp = '2023-01-01T12-00-00-000Z';
      expect(toSafeTimestamp(isoTimestamp)).toBe(expectedSafeTimestamp);
    });

    it('should return a placeholder for null or undefined input', () => {
      expect(toSafeTimestamp(null as any)).toBe('_');
      expect(toSafeTimestamp(undefined as any)).toBe('_');
    });

    it('should return an error string for an invalid date string', () => {
      expect(toSafeTimestamp('not a date')).toBe('error_invalid_date_input');
    });

    it('should return the same string if a safe timestamp is passed in by mistake', () => {
        expect(toSafeTimestamp(correspondingSafeTimestamp)).toBe(correspondingSafeTimestamp);
    });
  });

  describe('fromSafeTimestamp', () => {
    it('should convert a URL-safe timestamp back to a standard ISO string', () => {
      // Note: The re-converted timestamp will have .SSSZ format, which is equivalent to the original
      const expectedIso = '2025-06-08T19:01:25.225Z';
      const convertedDate = new Date(fromSafeTimestamp(correspondingSafeTimestamp));
      expect(convertedDate.toISOString()).toBe(expectedIso);
    });

    it('should handle safe timestamps that were generated without milliseconds', () => {
        const safeTs = '2023-01-01T12-00-00-000Z';
        const expectedIso = '2023-01-01T12:00:00.000Z';
        expect(fromSafeTimestamp(safeTs)).toBe(expectedIso);
    });

    it('should return the Unix epoch for placeholders or error strings', () => {
      const epoch = new Date(0).toISOString();
      expect(fromSafeTimestamp('_')).toBe(epoch);
      expect(fromSafeTimestamp('error_invalid_date_input')).toBe(epoch);
      expect(fromSafeTimestamp('error_conversion_failed')).toBe(epoch);
    });
    
    it('should handle being passed a standard ISO string by mistake', () => {
        const isoTimestamp = '2023-05-10T15:45:30.123Z';
        expect(fromSafeTimestamp(isoTimestamp)).toBe(isoTimestamp);
    });
  });

  describe('formatTimestampForDisplay', () => {
    it('should format a safe timestamp into a human-readable string', () => {
      // Note: This test is dependent on the local timezone of the test runner.
      // We are creating a Date object from the safe timestamp and then formatting it.
      // `fromSafeTimestamp` converts to a UTC date string.
      // `new Date(...)` will parse that UTC string.
      // The formatting part uses local date methods like .getDate(), .getMonth() etc.
      // Let's create a date object that we can control for the test.

      // We expect DD/MM/YYYY, HH:MM:SS
      const testSafeTimestamp = '2023-10-26T09-08-07-123Z'; // Corresponds to Oct 26 2023, 09:08:07 UTC
      const date = new Date(fromSafeTimestamp(testSafeTimestamp));
      
      // Manually construct the expected string to avoid timezone flakiness.
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      const expectedFormat = `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;

      expect(formatTimestampForDisplay(testSafeTimestamp)).toBe(expectedFormat);
    });

    it('should format an invalid safe timestamp as the epoch date', () => {
      const invalidSafeTimestamp = 'not-a-valid-safe-timestamp';
      // fromSafeTimestamp will return the ISO string for the epoch.
      // We then format that. The result depends on the test runner's timezone.
      // So, we calculate the expected output dynamically to make the test robust.
      const epochDate = new Date(fromSafeTimestamp(invalidSafeTimestamp));

      const day = String(epochDate.getDate()).padStart(2, '0');
      const month = String(epochDate.getMonth() + 1).padStart(2, '0');
      const year = epochDate.getFullYear();
      const hours = String(epochDate.getHours()).padStart(2, '0');
      const minutes = String(epochDate.getMinutes()).padStart(2, '0');
      const seconds = String(epochDate.getSeconds()).padStart(2, '0');
      const expectedFormat = `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;

      expect(formatTimestampForDisplay(invalidSafeTimestamp)).toBe(expectedFormat);
    });
  });

}); 