export function normalizeTag(tag: string): string {
  if (!tag) return '';

  const processedTag = tag.toString().trim();

  if (processedTag.startsWith('_')) {
    // It's an internal tag (e.g., _featured). Return as-is.
    return processedTag;
  }

  // It's a public tag.
  return processedTag
    .toLowerCase()
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/[^a-z0-9-]/g, ''); // Remove any non-alphanumeric characters except hyphens
}

export function prettifyTag(tag: string): string {
    if (!tag) return '';
    return tag
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
} 