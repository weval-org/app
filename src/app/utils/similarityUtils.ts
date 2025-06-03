/**
 * Finds the models most and least similar to the ideal benchmark.
 * @param matrix - The similarity matrix (modelA -> modelB -> similarity).
 * @param idealModelId - The identifier for the ideal benchmark model.
 * @returns An object containing the most and least similar models and their scores.
 */
export const findIdealExtremes = (
  matrix: Record<string, Record<string, number>> | undefined,
  idealModelId: string = 'IDEAL_BENCHMARK'
): { mostSimilar: { modelId: string; value: number } | null; leastSimilar: { modelId: string; value: number } | null } => {
  // Check if the matrix or the specific ideal model data exists
  if (!matrix || !matrix[idealModelId] || typeof matrix[idealModelId] !== 'object') {
    console.warn('[findIdealExtremes] Matrix or Ideal Benchmark data missing or invalid.');
    return { mostSimilar: null, leastSimilar: null };
  }

  let mostSimilar: { modelId: string; value: number } | null = null;
  let leastSimilar: { modelId: string; value: number } | null = null;
  let maxSim = -Infinity;
  let minSim = Infinity;

  // Iterate over the keys of the ideal model's comparisons in the matrix
  Object.keys(matrix[idealModelId]).forEach(modelId => {
    // Skip comparing the ideal model to itself
    if (modelId === idealModelId) return;

    const similarity = matrix[idealModelId][modelId];

    // Check if similarity is a valid number
    if (typeof similarity === 'number' && !isNaN(similarity)) {
      if (similarity > maxSim) {
        maxSim = similarity;
        mostSimilar = { modelId, value: similarity };
      }
      if (similarity < minSim) {
        minSim = similarity;
        leastSimilar = { modelId, value: similarity };
      }
    }
  });

  // Log if no valid comparisons were found for the ideal model
  if (mostSimilar === null || leastSimilar === null) {
      console.warn('[findIdealExtremes] No valid similarity scores found for comparison against Ideal Benchmark.');
  }

  return { mostSimilar, leastSimilar };
}; 