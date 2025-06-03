/**
 * Calculates the dot product of two vectors.
 * @param vecA First vector (array of numbers).
 * @param vecB Second vector (array of numbers).
 * @returns The dot product.
 * @throws Error if vectors have different lengths or are empty.
 */
function dotProduct(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length for dot product.');
  }
  if (vecA.length === 0) {
    throw new Error('Vectors cannot be empty.');
  }
  let product = 0;
  for (let i = 0; i < vecA.length; i++) {
    product += vecA[i] * vecB[i];
  }
  return product;
}

/**
 * Calculates the magnitude (Euclidean norm) of a vector.
 * @param vec Vector (array of numbers).
 * @returns The magnitude of the vector.
 * @throws Error if vector is empty.
 */
function magnitude(vec: number[]): number {
  if (vec.length === 0) {
    throw new Error('Vector cannot be empty.');
  }
  let sumOfSquares = 0;
  for (let i = 0; i < vec.length; i++) {
    sumOfSquares += vec[i] * vec[i];
  }
  return Math.sqrt(sumOfSquares);
}

/**
 * Calculates the cosine similarity between two vectors.
 * Result ranges from -1 (perfectly opposite) to 1 (perfectly similar).
 * @param vecA First vector (array of numbers).
 * @param vecB Second vector (array of numbers).
 * @returns The cosine similarity score.
 * @throws Error if vectors have different lengths, are empty, or if either magnitude is zero.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length for cosine similarity.');
  }
  if (vecA.length === 0) {
    // Or handle as 0 similarity? Throwing is safer to indicate invalid input.
    throw new Error('Cannot calculate cosine similarity for empty vectors.');
  }

  const magA = magnitude(vecA);
  const magB = magnitude(vecB);

  if (magA === 0 || magB === 0) {
    // If either vector is a zero vector, similarity is undefined or could be considered 0.
    // Throwing an error flags potentially problematic input (like empty strings leading to zero vectors).
    // If you expect zero vectors and want to return 0, adjust this logic.
    // console.warn('Cosine similarity is undefined for zero-magnitude vectors. Returning 0.');
    // return 0;
     throw new Error('Cannot calculate cosine similarity with zero-magnitude vectors.');

  }

  const dot = dotProduct(vecA, vecB);

  return dot / (magA * magB);
} 