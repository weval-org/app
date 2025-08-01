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
    if (tag.charAt(0) === '_') {
        return tag.slice(1).toUpperCase();
    }
    return tag
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function normalizeTopicKey(kebabCaseKey: string): string {
  if (!kebabCaseKey) return '';
  
  // Convert kebab-case topic keys to title-case format
  // Handle double-dash (--) as " & " separator
  return kebabCaseKey
    .split('--') // Split on double dashes first
    .map(part => 
      part
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    )
    .join(' & ')
    .trim();
} 