/**
 * Utilities for rendering textual/ASCII-style analysis components
 */

/**
 * Generate a textual progress bar using block characters
 * @param score - Score from 0 to 1
 * @param length - Total number of blocks (default 20)
 * @returns String with filled and empty blocks
 */
export function generateTextualBar(score: number | null, length: number = 20): string {
  if (score === null || isNaN(score)) {
    return '░'.repeat(length);
  }

  const filledBlocks = Math.round(score * length);
  const emptyBlocks = length - filledBlocks;

  return '█'.repeat(Math.max(0, filledBlocks)) + '░'.repeat(Math.max(0, emptyBlocks));
}

/**
 * Get emoji indicator for rank
 */
export function getRankEmoji(rank: number): string {
  const medals = ['🥇', '🥈', '🥉'];
  return rank <= 3 ? medals[rank - 1] : '';
}

/**
 * Get emoji indicator for score level
 */
export function getScoreEmoji(score: number | null): string {
  if (score === null) return '❓';
  if (score >= 0.9) return '🌟';
  if (score >= 0.8) return '✅';
  if (score >= 0.7) return '✓';
  if (score >= 0.5) return '⚠️';
  return '❌';
}

/**
 * Get color class for score
 */
export function getScoreColorClass(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 0.8) return 'text-green-600 dark:text-green-400';
  if (score >= 0.6) return 'text-blue-600 dark:text-blue-400';
  if (score >= 0.4) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

/**
 * Get background color class for score (for highlighting)
 */
export function getScoreBgClass(score: number | null): string {
  if (score === null) return 'bg-muted/20';
  if (score >= 0.8) return 'bg-green-100 dark:bg-green-900/20';
  if (score >= 0.6) return 'bg-blue-100 dark:bg-blue-900/20';
  if (score >= 0.4) return 'bg-yellow-100 dark:bg-yellow-900/20';
  return 'bg-red-100 dark:bg-red-900/20';
}

/**
 * Format percentage for display
 */
export function formatPercentage(score: number | null, decimals: number = 1): string {
  if (score === null) return '-';
  return `${(score * 100).toFixed(decimals)}%`;
}

/**
 * Format standard deviation
 */
export function formatStdDev(stdDev: number | null, decimals: number = 1): string {
  if (stdDev === null) return '-';
  return `σ=${(stdDev * 100).toFixed(decimals)}%`;
}

/**
 * Get difficulty label based on average score
 */
export function getDifficultyLabel(avgScore: number | null): { label: string; emoji: string } {
  if (avgScore === null) return { label: 'Unknown', emoji: '❓' };
  if (avgScore >= 0.85) return { label: 'Easy', emoji: '✓' };
  if (avgScore >= 0.65) return { label: 'Medium', emoji: '~' };
  if (avgScore >= 0.45) return { label: 'Hard', emoji: '⚠' };
  return { label: 'Very Hard', emoji: '❌' };
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Get ordinal suffix for numbers (1st, 2nd, 3rd, etc.)
 */
export function getOrdinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/**
 * Calculate statistics from array of scores
 */
export function calculateStats(scores: (number | null)[]): {
  average: number | null;
  stdDev: number | null;
  min: number | null;
  max: number | null;
  count: number;
} {
  const validScores = scores.filter((s): s is number => s !== null && !isNaN(s));

  if (validScores.length === 0) {
    return { average: null, stdDev: null, min: null, max: null, count: 0 };
  }

  const average = validScores.reduce((sum, s) => sum + s, 0) / validScores.length;

  let stdDev: number | null = null;
  if (validScores.length > 1) {
    const variance = validScores.reduce((sum, s) => sum + Math.pow(s - average, 2), 0) / validScores.length;
    stdDev = Math.sqrt(variance);
  }

  return {
    average,
    stdDev,
    min: Math.min(...validScores),
    max: Math.max(...validScores),
    count: validScores.length,
  };
}
