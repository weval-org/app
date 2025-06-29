'use client';

// --- Blueprint and Prompt Structures ---

export interface Expectation {
  id: string; // Internal ID for React keys
  value: string;
}

export interface Prompt {
  id: string; // Internal ID for React keys
  prompt: string;
  ideal: string;
  should: Expectation[];
  should_not: Expectation[];
}

export interface SandboxBlueprint {
  title: string;
  description: string;
  // Advanced fields
  models?: string[]; 
  system?: string;
  // Simple editor does not expose these, but they are part of the full spec
  // We keep them here to allow for future expansion or for power-users editing localStorage
  concurrency?: number;
  temperature?: number;
  // Full blueprint spec fields not used in sandbox
  // tags?: string[];
  // temperatures?: number[];
  prompts: Prompt[];
}


// --- API & State Types ---

export type RunStatus = 'idle' | 'pending' | 'generating_responses' | 'evaluating' | 'complete' | 'error';

export interface StatusResponse {
    status: RunStatus;
    message?: string;
    progress?: {
        completed: number;
        total: number;
    };
    resultUrl?: string;
} 