import { createClientLogger } from '@/app/utils/clientLogger';

const debug = createClientLogger('dateUtils');

/**
 * Parse timestamp from pathname and format it for display
 *
 * @param pathname - The pathname containing the timestamp (format: /analysis/[configId]/[runLabel]/[timestamp]/eng)
 * @returns Formatted timestamp string or null if invalid
 *
 * @example
 * parseTimestampFromPathname('/analysis/abc/main/2025-10-14T00-30-41-094Z/eng')
 * // Returns: "Oct 14, 2025 at 12:30 AM"
 */
export function parseTimestampFromPathname(pathname: string): string | null {
  try {
    // pathname format: /analysis/[configId]/[runLabel]/[timestamp]/eng
    const parts = pathname.split('/');
    const timestampStr = parts[parts.length - 2]; // Second to last segment
    if (!timestampStr) return null;

    // Convert timestamp format: 2025-10-14T00-30-41-094Z -> 2025-10-14T00:30:41.094Z
    const isoTimestamp = timestampStr
      .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z');

    const date = new Date(isoTimestamp);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      debug.warn('Invalid timestamp in pathname:', timestampStr);
      return null;
    }

    // Format as: "Oct 14, 2025 at 12:30 AM"
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (err) {
    debug.error('Failed to parse timestamp from pathname:', err);
    return null;
  }
}
