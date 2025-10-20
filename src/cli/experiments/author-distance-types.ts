/**
 * Types for author distance analysis experiments
 */

export interface AuthorPassage {
  author: string;
  passage: string;
  work?: string;
  rationale?: string;
  passage_type?: string;
}

export interface ExtractedPrompt {
  authorPassage: AuthorPassage;
  extractedPrompt: string;
  extractorModelId: string;
}

export interface ModelResponse {
  modelId: string;
  authorName: string;
  passageIndex: number;
  prompt: string;
  response: string;
  sampleIndex: number; // Which sample (0, 1, 2) for averaging
}

export interface EmbeddingData {
  type: 'author_passage' | 'model_response';
  author: string;
  passageIndex: number;
  modelId?: string;
  sampleIndex?: number;
  embedding: number[];
  text: string;
}

export interface DistanceResult {
  type: 'author_to_author' | 'model_to_author' | 'model_to_model';
  entityA: string; // author name or model id
  entityB: string;
  distance: number;
  samples?: number; // How many samples averaged
}

export interface AuthorDistanceAnalysisResult {
  metadata: {
    timestamp: string;
    embeddingModel: string;
    extractorModel: string;
    candidateModels: string[];
    authors: string[];
    samplesPerPrompt: number;
  };
  extractedPrompts: ExtractedPrompt[];
  embeddings: EmbeddingData[];
  distances: {
    authorToAuthor: DistanceResult[];
    modelToAuthor: DistanceResult[];
    modelToModel: DistanceResult[];
  };
  interpretation: {
    closestAuthorPairs: Array<{
      modelPair: [string, string];
      distance: number;
      closestAuthorPair: [string, string];
      authorDistance: number;
      percentageDifference: number;
    }>;
  };
}
