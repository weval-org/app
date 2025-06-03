/**
 * Parses a timestamp segment from a filename into a standard ISO 8601 string.
 * The input segment is expected to be in the format YYYY-MM-DDTHH-MM-SS-mmmZ 
 * (e.g., "2025-05-01T00-38-30-062Z").
 * It converts this to YYYY-MM-DDTHH:MM:SS.mmmZ (e.g., "2025-05-01T00:38:30.062Z").
 *
 * @param timestampSegment The timestamp segment from the filename.
 * @returns A standard ISO 8601 string, or null if the input is not in the expected format or invalid.
 */
export function parseTimestampFromFilenameSegment(timestampSegment: string): string | null {
  if (!timestampSegment || typeof timestampSegment !== 'string') {
    return null;
  }

  // Regex to capture the parts: 
  // 1: Date (YYYY-MM-DD)
  // 2: Hour (HH)
  // 3: Minute (MM)
  // 4: Second (SS)
  // 5: Milliseconds with Z (mmmZ)
  const match = timestampSegment.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/);

  if (match) {
    const datePart = match[1];         // "2025-05-01"
    const hourPart = match[2];         // "00"
    const minutePart = match[3];       // "38"
    const secondPart = match[4];       // "30"
    const millisecondPart = match[5];  // "062Z"

    // Reconstruct with colons for time and dot for milliseconds
    return `${datePart}T${hourPart}:${minutePart}:${secondPart}.${millisecondPart}`;
  } else {
    // Optional: Add a warning if the format is unexpected, though the calling function might also log.
    // console.warn(`[dateUtils] Timestamp segment "${timestampSegment}" does not match expected format YYYY-MM-DDTHH-MM-SS-mmmZ`);
    return null; // Return null if the format doesn't match
  }
}

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

  const fileMatch = filename.match(/^(.*?)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_(comparison(?:_v2)?\.json)$/);

  if (fileMatch) {
    const label = fileMatch[1];
    const originalTimestampSegment = fileMatch[2]; // e.g., "2025-05-01T00-38-30-062Z"
    
    const correctedTimestamp = parseTimestampFromFilenameSegment(originalTimestampSegment);
    
    return {
      label,
      correctedTimestamp,
      originalTimestampSegment
    };
  } else {
    // console.warn(`[dateUtils] Filename "${filename}" does not match expected pattern.`);
    return null;
  }
} 