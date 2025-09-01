import type { ComparisonConfig } from '@/cli/types/cli_types';

export type LitProgressEventType =
  | 'instruction_started'
  | 'instruction_finished'
  | 'assertions_started'
  | 'assertions_finished'
  | 'generation_started'
  | 'generation_progress'
  | 'generation_finished'
  | 'coverage_started'
  | 'coverage_progress'
  | 'coverage_finished'
  | 'embedding_started'
  | 'embedding_progress'
  | 'embedding_finished'
  | 'ranking_finished'
  | 'completed'
  | 'warning'
  | 'error';

export interface LitProgressEvent {
  type: LitProgressEventType;
  message?: string;
  data?: Record<string, any>;
}

export interface LitParams {
  sourceText: string;
  embeddingModel: string;
  compilerModel: string;
  coverageModel: string;
  candidateModels: string[];
  anchorModels: string[];
  candTemp: number;
  anchorTemp: number;
  topN: number;
  rankMode: 'composite' | 'pareto';
  coverageWeight: number; // for composite rank
  useGate: boolean;
  coverageThreshold: number;
}

export interface LitAnchorItem { modelId: string; text: string; }

export interface LitCandidateItem {
  modelId: string;
  text: string;
  coverage: number | null;
  simSource: number;
  minSimAnchors: number;
  normSimilarity: number;
  overlap3: number;
  rankScore?: number | null;
}

export interface LitArtifacts {
  instructionSet: string;
  coveragePoints: string[];
  anchors: { modelId: string; length: number; text?: string }[];
  candidates: (Omit<LitCandidateItem, 'text'> & { text?: string })[];
  candidatesSorted: (Omit<LitCandidateItem, 'text'> & { text?: string })[];
  winners: LitCandidateItem[];
  topCandidates: (Omit<LitCandidateItem, 'text'> & { text?: string })[];
  params: Record<string, any>;
}

export type OnLitEvent = (evt: LitProgressEvent) => Promise<void> | void;

export interface LitDependencies {
  buildCandidateConfig: (p: LitParams, instructionSet: string, coveragePoints: string[]) => ComparisonConfig;
  buildAnchorConfig: (p: LitParams, sourceText: string) => ComparisonConfig;
}


