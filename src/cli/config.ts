export interface CliConfig {
  errorHandler: (error: Error) => void
  logger: {
    info: (msg: string) => void
    warn: (msg: string) => void
    error: (msg: string) => void
    success: (msg: string) => void
  }
}

let config: CliConfig

export function configure(options: CliConfig) {
  config = options
}

export function getConfig() {
  if (!config) {
    throw new Error('CLI not configured')
  }
  return config
}

export const errors = {
  MISSING_API_KEY: 'Missing OpenAI API key. Required for embeddings.',
  INVALID_RESULT_FILE: 'Invalid or malformed result file',
  NO_RESULTS_FOUND: 'No valid results found for comparison',
  MISSING_RESULT: 'No result file specified for comparison',
  INVALID_MODEL_STRING: 'Invalid model string format. Use provider:model',
  UNKNOWN_MODEL: 'Unknown model configuration',
  INSUFFICIENT_MODELS: 'Please specify at least two models to compare',
  // Add any CLI-specific error messages here
} as const 