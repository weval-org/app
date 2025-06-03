/**
 * Represents the result of a single preference test prompt.
 */
export interface PreferenceTestResult {
  promptId: string;
  preferredOption: string; // e.g., 'A' or 'B'
  confidence: number; // e.g., 1-10
  reasoning: string;
  allRankings?: string[]; // Optional, if rankings are produced
  // Add other fields as needed, e.g.:
  // responseA?: string;
  // responseB?: string;
}

/**
 * Represents the overall results (fingerprint) for a model 
 * across multiple preference test prompts.
 */
export interface PreferenceFingerprint {
  modelId: string;           // Identifier like "openai:gpt-4o-mini"
  displayName: string;       // Display name used in UI
  temperature: number;       // Temperature used for the test run
  systemPrompt?: string | null; // System prompt used
  timestamp: string | number; // When the test was run/saved
  results: PreferenceTestResult[]; // An array of results for each prompt tested
  // Add other summary fields if needed
} 