export function normalizeTag(tag: string): string {
  if (!tag) return ''
  return tag
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with a single hyphen
    .replace(/[^a-z0-9-]/g, ''); // Remove any non-alphanumeric characters except hyphens
} 