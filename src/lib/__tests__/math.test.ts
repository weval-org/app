import { cosineSimilarity, cosineDistance } from '../math';

describe('math utilities', () => {
  describe('cosineSimilarity', () => {
    it('should calculate similarity of identical vectors as 1', () => {
      const vec = [1, 2, 3];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1);
    });

    it('should calculate similarity of opposite vectors as -1', () => {
      const vecA = [1, 2, 3];
      const vecB = [-1, -2, -3];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1);
    });

    it('should calculate similarity of orthogonal vectors as 0', () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0);
    });

    it('should calculate similarity correctly for general vectors', () => {
      const vecA = [1, 2, 3, 4];
      const vecB = [4, 3, 2, 1];
      // Dot product: 4 + 6 + 6 + 4 = 20
      // Magnitude A: sqrt(1+4+9+16) = sqrt(30)
      // Magnitude B: sqrt(16+9+4+1) = sqrt(30)
      // Similarity: 20 / (sqrt(30) * sqrt(30)) = 20 / 30 = 0.666...
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.6667, 4);
    });

    it('should return 0 for similarity with a zero vector', () => {
      const vecA = [1, 2, 3];
      const vecB = [0, 0, 0];
      expect(cosineSimilarity(vecA, vecB)).toBe(0);
    });

    it('should return 1 for similarity of two empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(1.0);
    });

    it('should throw an error for vectors of different lengths', () => {
      const vecA = [1, 2];
      const vecB = [1, 2, 3];
      expect(() => cosineSimilarity(vecA, vecB)).toThrow('Vectors must have the same length for cosine similarity.');
    });
  });

  describe('cosineDistance', () => {
    it('should calculate distance of identical vectors as 0', () => {
      const vec = [1, 2, 3];
      expect(cosineDistance(vec, vec)).toBeCloseTo(0);
    });

    it('should calculate distance of opposite vectors as 2', () => {
      const vecA = [1, 2, 3];
      const vecB = [-1, -2, -3];
      expect(cosineDistance(vecA, vecB)).toBeCloseTo(2);
    });

    it('should calculate distance of orthogonal vectors as 1', () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      expect(cosineDistance(vecA, vecB)).toBeCloseTo(1);
    });

    it('should calculate distance correctly for general vectors', () => {
      const vecA = [1, 2, 3, 4];
      const vecB = [4, 3, 2, 1];
      // Distance = 1 - Similarity = 1 - 0.6667 = 0.3333
      expect(cosineDistance(vecA, vecB)).toBeCloseTo(0.3333, 4);
    });
  });
}); 