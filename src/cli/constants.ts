// Shared constants for CLI operations

export const RESULTS_DIR = '.results';

// Subdirectories within .results/
export const MULTI_DIR = 'multi';       // For embed_multi, compare_multi, run_config outputs
export const SINGLE_DIR = 'single';      // For embed_single outputs
export const EMBEDDINGS_DIR = 'embeddings'; // For embed_baseline_responses output
export const MODEL_DIR = 'models';        // For embed_responses outputs
export const BACKUPS_DIR = 'backups';     // For backup/restore outputs
export const SANDBOX_DIR = 'sandbox';     // For sandbox runs
export const LIVE_DIR = 'live';           // The root for all active data post-migration
export const MODEL_CARDS_DIR = 'model-cards'; // For model card outputs 