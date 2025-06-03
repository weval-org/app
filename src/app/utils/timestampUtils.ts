export function toSafeTimestamp(isoTimestamp: string): string {
  if (!isoTimestamp) return '_'; // Fallback for missing timestamp
  try {
    const date = new Date(isoTimestamp);
    if (isNaN(date.getTime())) {
      console.warn(`[toSafeTimestamp] Invalid date string received: ${isoTimestamp}`);
      // Attempt to re-format if it's already in our target safe format but got passed in by mistake
      if (/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(isoTimestamp)) {
        return isoTimestamp;
      }
      return 'error_invalid_date_input'; 
    }
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}-${milliseconds}Z`;
  } catch (e) {
    console.error(`[toSafeTimestamp] Error converting timestamp '${isoTimestamp}':`, e);
    return 'error_conversion_failed';
  }
}

export function fromSafeTimestamp(safeTimestamp: string): string {
  if (!safeTimestamp || safeTimestamp === '_' || safeTimestamp.startsWith('error_')) {
    // For error cases or invalid placeholders, return a date that clearly indicates an issue or a default past date.
    console.warn(`[fromSafeTimestamp] Received invalid or error placeholder safeTimestamp: ${safeTimestamp}`);
    return new Date(0).toISOString(); // Unix epoch, clearly not a real run time
  }
  try {
    // Convert YYYY-MM-DDTHH-mm-ss-SSSZ back to YYYY-MM-DDTHH:mm:ss.SSSZ
    const parts = safeTimestamp.match(/^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/);
    if (!parts) {
        // If it doesn't match the custom format, try to parse directly (e.g., if it's already ISO by mistake)
        const d = new Date(safeTimestamp);
        if (!isNaN(d.getTime())) return d.toISOString();
        console.warn(`[fromSafeTimestamp] Invalid safe timestamp format, not parseable as direct date: ${safeTimestamp}`);
        return new Date(0).toISOString(); 
    }
    return `${parts[1]}${parts[2]}:${parts[3]}:${parts[4]}.${parts[5]}`;
  } catch (e) {
    console.error(`[fromSafeTimestamp] Error converting safe timestamp '${safeTimestamp}':`, e);
    return new Date(0).toISOString(); // Fallback
  }
} 