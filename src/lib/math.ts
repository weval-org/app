/**
 * Calculates the dot product of two vectors.
 * @internal
 * @param vecA First vector (array of numbers).
 * @param vecB Second vector (array of numbers).
 * @returns The dot product.
 */
function dotProduct(vecA: number[], vecB: number[]): number {
  let product = 0;
  for (let i = 0; i < vecA.length; i++) {
    product += vecA[i] * vecB[i];
  }
  return product;
}

/**
 * Calculates the magnitude (Euclidean norm) of a vector.
 * @internal
 * @param vec Vector (array of numbers).
 * @returns The magnitude of the vector.
 */
function magnitude(vec: number[]): number {
  let sumOfSquares = 0;
  for (let i = 0; i < vec.length; i++) {
    sumOfSquares += vec[i] * vec[i];
  }
  return Math.sqrt(sumOfSquares);
}

/**
 * Calculates the cosine similarity between two vectors.
 * Result ranges from -1 (perfectly opposite) to 1 (perfectly similar).
 * Returns 0 if either vector has a magnitude of 0.
 * @param vecA First vector (array of numbers).
 * @param vecB Second vector (array of numbers).
 * @returns The cosine similarity score.
 * @throws Error if vectors have different lengths.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length for cosine similarity.');
  }
  if (vecA.length === 0) {
    return 1.0; // Conventionally, two empty vectors are perfectly similar.
  }

  const magA = magnitude(vecA);
  const magB = magnitude(vecB);

  if (magA === 0 || magB === 0) {
    return 0; // Similarity with a zero vector is 0.
  }

  const dot = dotProduct(vecA, vecB);
  const similarity = dot / (magA * magB);
  
  // Clamp the value to the [-1, 1] range to correct for potential floating-point errors
  return Math.max(-1, Math.min(1, similarity));
}

/**
 * Calculates the cosine distance between two vectors.
 * Cosine distance is 1 - cosine similarity.
 * 
 * @param a First vector
 * @param b Second vector
 * @returns Cosine distance between the vectors (a value between 0 and 2)
 * @throws Error if vectors have different lengths.
 */
export function cosineDistance(a: number[], b: number[]): number {
  // cosineDistance = 1 - cosineSimilarity
  return 1 - cosineSimilarity(a, b);
} 