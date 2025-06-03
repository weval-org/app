// Using Private Use Area Unicode characters as markers
// These characters are guaranteed to not appear in normal text
export const STREAM_MARKERS = {
  // U+E000 (First character in Private Use Area)
  STATUS_START: '\uE000',
  // U+E001
  CHAT_START: '\uE001',
  // U+E002 - Optional marker for additional message types
  SYSTEM_START: '\uE002'
} as const;

export function isStatusMessage(content: string): boolean {
  return content.startsWith(STREAM_MARKERS.STATUS_START);
}

export function isChatMessage(content: string): boolean {
  return content.startsWith(STREAM_MARKERS.CHAT_START);
}

export function stripMarkers(content: string): string {
  return content
    .replace(STREAM_MARKERS.STATUS_START, '')
    .replace(STREAM_MARKERS.CHAT_START, '')
    .replace(STREAM_MARKERS.SYSTEM_START, '')
    .trim();
} 