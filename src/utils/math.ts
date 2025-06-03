/**
 * Calculates the cosine distance between two vectors.
 * Cosine distance is 1 - cosine similarity.
 * 
 * @param a First vector
 * @param b Second vector
 * @returns Cosine distance between the vectors (between 0 and 2)
 */
export function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length')
  }
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  if (normA === 0 || normB === 0) {
    return 1 // Maximum distance for zero vectors
  }
  
  const cosineSimilarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  
  // Ensure the similarity is between -1 and 1 (floating point errors can cause it to be slightly outside)
  const boundedSimilarity = Math.max(-1, Math.min(1, cosineSimilarity))
  
  // Cosine distance = 1 - cosine similarity
  return 1 - boundedSimilarity
} 