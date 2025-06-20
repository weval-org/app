/**
 * Calculates the cosine similarity between two vectors
 */
export { cosineSimilarity } from '@/lib/math';

export interface SimilarityResult {
  modelId: string
  modelName: string
  similarity: number
}
