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

export const formatTimestampForDisplay = (safeTimestamp: string): string => {
  try {
    const date = new Date(fromSafeTimestamp(safeTimestamp));
    // Format: DD/MM/YYYY, HH:MM:SS (24-hour)
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    // Fallback to the safe timestamp if parsing fails (should be rare)
    console.error("Error formatting timestamp for display:", e);
    return safeTimestamp; 
  }
};

/**
 * Extracts the label and processes the timestamp from a comparison result filename.
 * Expected filename format: label_YYYY-MM-DDTHH-MM-SS-mmmZ_comparison[_v2].json
 * 
 * @param filename The full filename string.
 * @returns An object with { label, correctedTimestamp, originalTimestampSegment } or null if the filename doesn't match.
 */
export function extractInfoFromFilename(filename: string): {
  label: string;
  correctedTimestamp: string | null;
  originalTimestampSegment: string;
} | null {
  if (!filename || typeof filename !== 'string') {
    return null;
  }

  // Regex updated to be a bit more specific on the label part to avoid over-matching
  const fileMatch = filename.match(/^(.*?)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_(comparison(?:_v2)?\.json)$/);

  if (fileMatch) {
    const label = fileMatch[1];
    const originalTimestampSegment = fileMatch[2]; // e.g., "2025-05-01T00-38-30-062Z"
    
    const correctedTimestampISO = fromSafeTimestamp(originalTimestampSegment);
    
    // fromSafeTimestamp returns epoch on failure, so we check for it and return null to match original behavior.
    const correctedTimestamp = correctedTimestampISO === new Date(0).toISOString() ? null : correctedTimestampISO;

    return {
      label,
      correctedTimestamp,
      originalTimestampSegment
    };
  } else {
    // console.warn(`[timestampUtils] Filename "${filename}" does not match expected pattern.`);
    return null;
  }
} 