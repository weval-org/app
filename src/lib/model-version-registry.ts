/**
 * Model Version Registry
 *
 * This file defines chronologically ordered model series for regression detection.
 * Each series tracks versions of the same model family over time to detect performance
 * changes across releases.
 *
 * Key principles:
 * - Versions are ordered chronologically by releaseDate
 * - IDs use canonical format (matching normalizeModelBaseId from modelIdUtils)
 * - Aliases capture all known variants that should map to this version
 * - Tiers: "fast" (Haiku, Mini), "balanced" (Sonnet, base), "powerful" (Opus, Pro)
 */

export interface ModelVersion {
  id: string; // Canonical model ID (e.g., "anthropic:claude-3-5-haiku")
  name: string; // Display name (e.g., "Claude 3.5 Haiku")
  releaseDate: string; // ISO date for temporal ordering (YYYY-MM-DD)
  aliases: string[]; // Known variants that should match this version
}

export interface ModelSeries {
  seriesId: string; // Unique identifier (e.g., "anthropic-claude-haiku")
  seriesName: string; // Display name (e.g., "Anthropic Claude Haiku")
  maker: string; // Company (e.g., "anthropic", "openai", "google")
  tier: 'fast' | 'balanced' | 'powerful'; // Performance/cost tier
  versions: ModelVersion[]; // Chronologically ordered (oldest → newest)
}

/**
 * The master registry of all model series tracked for regression detection.
 *
 * IMPORTANT: Keep versions ordered chronologically within each series!
 */
export const MODEL_VERSION_REGISTRY: ModelSeries[] = [
  // === OpenAI GPT-4o (Balanced) ===
  {
    seriesId: "openai-gpt-4o",
    seriesName: "OpenAI GPT-4o",
    maker: "openai",
    tier: "balanced",
    versions: [
      {
        id: "openai:gpt-4o-2024-05-13",
        name: "GPT-4o (May 2024)",
        releaseDate: "2024-05-13",
        aliases: [
          "openai:gpt-4o-2024-05-13",
          "openrouter:openai/gpt-4o-2024-05-13"
        ]
      },
      {
        id: "openai:gpt-4o-2024-08-06",
        name: "GPT-4o (August 2024)",
        releaseDate: "2024-08-06",
        aliases: [
          "openai:gpt-4o-2024-08-06",
          "openrouter:openai/gpt-4o-2024-08-06"
        ]
      },
      {
        id: "openai:gpt-4o-2024-11-20",
        name: "GPT-4o (November 2024)",
        releaseDate: "2024-11-20",
        aliases: [
          "openai:gpt-4o-2024-11-20",
          "openrouter:openai/gpt-4o-2024-11-20",
          "openai:gpt-4o", // Latest alias
          "openrouter:openai/gpt-4o"
        ]
      }
    ]
  },

  // === OpenAI GPT-4o Mini (Fast) ===
  {
    seriesId: "openai-gpt-4o-mini",
    seriesName: "OpenAI GPT-4o Mini",
    maker: "openai",
    tier: "fast",
    versions: [
      {
        id: "openai:gpt-4o-mini",
        name: "GPT-4o Mini",
        releaseDate: "2024-07-18",
        aliases: [
          "openai:gpt-4o-mini",
          "openrouter:openai/gpt-4o-mini",
          "openai:gpt-4o-mini-2024-07-18"
        ]
      }
    ]
  },

  // === OpenAI GPT-4.1 (Balanced) ===
  {
    seriesId: "openai-gpt-4.1",
    seriesName: "OpenAI GPT-4.1",
    maker: "openai",
    tier: "balanced",
    versions: [
      {
        id: "openai:gpt-4.1",
        name: "GPT-4.1",
        releaseDate: "2025-01-15", // Estimated
        aliases: [
          "openai:gpt-4.1",
          "openrouter:openai/gpt-4.1"
        ]
      }
    ]
  },

  // === OpenAI GPT-4.1 Mini (Fast) ===
  {
    seriesId: "openai-gpt-4.1-mini",
    seriesName: "OpenAI GPT-4.1 Mini",
    maker: "openai",
    tier: "fast",
    versions: [
      {
        id: "openai:gpt-4.1-mini",
        name: "GPT-4.1 Mini",
        releaseDate: "2025-01-15", // Estimated
        aliases: [
          "openai:gpt-4.1-mini",
          "openrouter:openai/gpt-4.1-mini"
        ]
      }
    ]
  },

  // === OpenAI GPT-4.1 Nano (Fast) ===
  {
    seriesId: "openai-gpt-4.1-nano",
    seriesName: "OpenAI GPT-4.1 Nano",
    maker: "openai",
    tier: "fast",
    versions: [
      {
        id: "openai:gpt-4.1-nano",
        name: "GPT-4.1 Nano",
        releaseDate: "2025-01-15", // Estimated
        aliases: [
          "openai:gpt-4.1-nano",
          "openrouter:openai/gpt-4.1-nano"
        ]
      }
    ]
  },

  // === OpenAI GPT-5 (Powerful) ===
  {
    seriesId: "openai-gpt-5",
    seriesName: "OpenAI GPT-5",
    maker: "openai",
    tier: "powerful",
    versions: [
      {
        id: "openai:gpt-5",
        name: "GPT-5",
        releaseDate: "2025-02-01", // Estimated
        aliases: [
          "openai:gpt-5",
          "openrouter:openai/gpt-5"
        ]
      }
    ]
  },

  // === OpenAI o4-mini (Fast Reasoning) ===
  {
    seriesId: "openai-o4-mini",
    seriesName: "OpenAI o4 Mini",
    maker: "openai",
    tier: "fast",
    versions: [
      {
        id: "openai:o4-mini",
        name: "o4 Mini",
        releaseDate: "2025-01-20", // Estimated
        aliases: [
          "openai:o4-mini",
          "openrouter:openai/o4-mini"
        ]
      }
    ]
  },

  // === OpenAI GPT OSS 20B (Fast Open Source) ===
  {
    seriesId: "openai-gpt-oss-20b",
    seriesName: "OpenAI GPT OSS 20B",
    maker: "openai",
    tier: "fast",
    versions: [
      {
        id: "openai:gpt-oss-20b",
        name: "GPT OSS 20B",
        releaseDate: "2024-12-01", // Estimated
        aliases: [
          "openai:gpt-oss-20b",
          "openrouter:openai/gpt-oss-20b"
        ]
      }
    ]
  },

  // === OpenAI GPT OSS 120B (Balanced Open Source) ===
  {
    seriesId: "openai-gpt-oss-120b",
    seriesName: "OpenAI GPT OSS 120B",
    maker: "openai",
    tier: "balanced",
    versions: [
      {
        id: "openai:gpt-oss-120b",
        name: "GPT OSS 120B",
        releaseDate: "2024-12-01", // Estimated
        aliases: [
          "openai:gpt-oss-120b",
          "openrouter:openai/gpt-oss-120b"
        ]
      }
    ]
  },

  // === Anthropic Claude Haiku (Fast) ===
  {
    seriesId: "anthropic-claude-haiku",
    seriesName: "Anthropic Claude Haiku",
    maker: "anthropic",
    tier: "fast",
    versions: [
      {
        id: "anthropic:claude-3-haiku-20240307",
        name: "Claude 3 Haiku",
        releaseDate: "2024-03-07",
        aliases: [
          "anthropic:claude-3-haiku-20240307",
          "anthropic:claude-3-haiku",
          "openrouter:anthropic/claude-3-haiku"
        ]
      },
      {
        id: "anthropic:claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        releaseDate: "2024-10-22",
        aliases: [
          "anthropic:claude-3-5-haiku-20241022",
          "anthropic:claude-3-5-haiku",
          "openrouter:anthropic/claude-3.5-haiku",
          "openrouter:anthropic/claude-3-5-haiku-20241022"
        ]
      }
    ]
  },

  // === Anthropic Claude Sonnet (Balanced) ===
  {
    seriesId: "anthropic-claude-sonnet",
    seriesName: "Anthropic Claude Sonnet",
    maker: "anthropic",
    tier: "balanced",
    versions: [
      {
        id: "anthropic:claude-3-5-sonnet-20240620",
        name: "Claude 3.5 Sonnet (June 2024)",
        releaseDate: "2024-06-20",
        aliases: [
          "anthropic:claude-3-5-sonnet-20240620",
          "openrouter:anthropic/claude-3.5-sonnet-20240620"
        ]
      },
      {
        id: "anthropic:claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet (October 2024)",
        releaseDate: "2024-10-22",
        aliases: [
          "anthropic:claude-3-5-sonnet-20241022",
          "anthropic:claude-3-5-sonnet",
          "openrouter:anthropic/claude-3.5-sonnet",
          "openrouter:anthropic/claude-3.5-sonnet-20241022"
        ]
      },
      {
        id: "anthropic:claude-3-7-sonnet-20250219",
        name: "Claude 3.7 Sonnet",
        releaseDate: "2025-02-19",
        aliases: [
          "anthropic:claude-3-7-sonnet-20250219",
          "anthropic:claude-3-7-sonnet",
          "openrouter:anthropic/claude-3.7-sonnet"
        ]
      },
      {
        id: "anthropic:claude-sonnet-4",
        name: "Claude Sonnet 4",
        releaseDate: "2025-05-14",
        aliases: [
          "anthropic:claude-sonnet-4",
          "anthropic:claude-sonnet-4-20250514",
          "openrouter:anthropic/claude-sonnet-4"
        ]
      },
      {
        id: "anthropic:claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        releaseDate: "2025-07-01", // Estimated
        aliases: [
          "anthropic:claude-sonnet-4.5",
          "openrouter:anthropic/claude-sonnet-4.5"
        ]
      }
    ]
  },

  // === Anthropic Claude Opus (Powerful) ===
  {
    seriesId: "anthropic-claude-opus",
    seriesName: "Anthropic Claude Opus",
    maker: "anthropic",
    tier: "powerful",
    versions: [
      {
        id: "anthropic:claude-3-opus-20240229",
        name: "Claude 3 Opus",
        releaseDate: "2024-02-29",
        aliases: [
          "anthropic:claude-3-opus-20240229",
          "anthropic:claude-3-opus",
          "openrouter:anthropic/claude-3-opus"
        ]
      },
      {
        id: "anthropic:claude-opus-4",
        name: "Claude Opus 4",
        releaseDate: "2025-05-14",
        aliases: [
          "anthropic:claude-opus-4",
          "anthropic:claude-opus-4-20250514",
          "openrouter:anthropic/claude-opus-4"
        ]
      },
      {
        id: "anthropic:claude-opus-4.1",
        name: "Claude Opus 4.1",
        releaseDate: "2025-06-01", // Estimated
        aliases: [
          "anthropic:claude-opus-4.1",
          "openrouter:anthropic/claude-opus-4.1"
        ]
      }
    ]
  },

  // === Google Gemini Flash (Fast) ===
  {
    seriesId: "google-gemini-flash",
    seriesName: "Google Gemini Flash",
    maker: "google",
    tier: "fast",
    versions: [
      {
        id: "google:gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        releaseDate: "2024-12-11",
        aliases: [
          "google:gemini-2.0-flash",
          "openrouter:google/gemini-2.0-flash"
        ]
      },
      {
        id: "google:gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        releaseDate: "2025-05-20", // Estimated from preview date
        aliases: [
          "google:gemini-2.5-flash",
          "google:gemini-2.5-flash-preview",
          "google:gemini-2.5-flash-preview-05-20",
          "openrouter:google/gemini-2.5-flash"
        ]
      }
    ]
  },

  // === Google Gemini Pro (Powerful) ===
  {
    seriesId: "google-gemini-pro",
    seriesName: "Google Gemini Pro",
    maker: "google",
    tier: "powerful",
    versions: [
      {
        id: "google:gemini-2.0-pro",
        name: "Gemini 2.0 Pro",
        releaseDate: "2024-12-11",
        aliases: [
          "google:gemini-2.0-pro",
          "openrouter:google/gemini-2.0-pro"
        ]
      },
      {
        id: "google:gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        releaseDate: "2025-05-01", // Estimated from preview
        aliases: [
          "google:gemini-2.5-pro",
          "google:gemini-2.5-pro-preview",
          "openrouter:google/gemini-2.5-pro"
        ]
      }
    ]
  },

  // === Google Gemma (Fast Open Source) ===
  {
    seriesId: "google-gemma",
    seriesName: "Google Gemma",
    maker: "google",
    tier: "fast",
    versions: [
      {
        id: "google:gemma-3-12b-it",
        name: "Gemma 3 12B IT",
        releaseDate: "2025-01-01", // Estimated
        aliases: [
          "google:gemma-3-12b-it",
          "openrouter:google/gemma-3-12b-it"
        ]
      }
    ]
  },

  // === DeepSeek Chat (Balanced) ===
  {
    seriesId: "deepseek-chat",
    seriesName: "DeepSeek Chat",
    maker: "deepseek",
    tier: "balanced",
    versions: [
      {
        id: "deepseek:deepseek-chat-v3",
        name: "DeepSeek Chat v3",
        releaseDate: "2024-12-26",
        aliases: [
          "deepseek:deepseek-chat-v3",
          "deepseek:deepseek-chat-v3-0324",
          "openrouter:deepseek/deepseek-chat-v3",
          "openrouter:deepseek/deepseek-chat-v3-0324"
        ]
      },
      {
        id: "deepseek:deepseek-chat-v3.1",
        name: "DeepSeek Chat v3.1",
        releaseDate: "2025-01-15", // Estimated
        aliases: [
          "deepseek:deepseek-chat-v3.1",
          "openrouter:deepseek/deepseek-chat-v3.1"
        ]
      }
    ]
  },

  // === DeepSeek R1 (Powerful Reasoning) ===
  {
    seriesId: "deepseek-r1",
    seriesName: "DeepSeek R1",
    maker: "deepseek",
    tier: "powerful",
    versions: [
      {
        id: "deepseek:deepseek-r1",
        name: "DeepSeek R1",
        releaseDate: "2025-01-20",
        aliases: [
          "deepseek:deepseek-r1",
          "openrouter:deepseek/deepseek-r1"
        ]
      }
    ]
  },

  // === Mistral Medium (Balanced) ===
  {
    seriesId: "mistralai-mistral-medium",
    seriesName: "Mistral Medium",
    maker: "mistralai",
    tier: "balanced",
    versions: [
      {
        id: "mistralai:mistral-medium-3",
        name: "Mistral Medium 3",
        releaseDate: "2025-01-01", // Estimated
        aliases: [
          "mistralai:mistral-medium-3",
          "openrouter:mistralai/mistral-medium-3"
        ]
      }
    ]
  },

  // === Mistral Large (Powerful) ===
  {
    seriesId: "mistralai-mistral-large",
    seriesName: "Mistral Large",
    maker: "mistralai",
    tier: "powerful",
    versions: [
      {
        id: "mistralai:mistral-large-2411",
        name: "Mistral Large (November 2024)",
        releaseDate: "2024-11-01",
        aliases: [
          "mistralai:mistral-large-2411",
          "openrouter:mistralai/mistral-large-2411"
        ]
      }
    ]
  },

  // === Mistral Nemo (Fast) ===
  {
    seriesId: "mistralai-mistral-nemo",
    seriesName: "Mistral Nemo",
    maker: "mistralai",
    tier: "fast",
    versions: [
      {
        id: "mistralai:mistral-nemo",
        name: "Mistral Nemo",
        releaseDate: "2024-07-18",
        aliases: [
          "mistralai:mistral-nemo",
          "openrouter:mistralai/mistral-nemo"
        ]
      }
    ]
  },

  // === XAI Grok (Powerful) ===
  {
    seriesId: "xai-grok",
    seriesName: "XAI Grok",
    maker: "xai",
    tier: "powerful",
    versions: [
      {
        id: "xai:grok-3",
        name: "Grok 3",
        releaseDate: "2025-01-10", // Estimated
        aliases: [
          "xai:grok-3",
          "xai:grok-3-mini-beta",
          "openrouter:x-ai/grok-3",
          "openrouter:xai/grok-3"
        ]
      },
      {
        id: "xai:grok-4",
        name: "Grok 4",
        releaseDate: "2025-07-09",
        aliases: [
          "xai:grok-4",
          "xai:grok-4-0709",
          "openrouter:x-ai/grok-4",
          "openrouter:xai/grok-4"
        ]
      }
    ]
  },

  // === Meta Llama 3 70B (Balanced) ===
  {
    seriesId: "meta-llama-3-70b",
    seriesName: "Meta Llama 3 70B",
    maker: "meta",
    tier: "balanced",
    versions: [
      {
        id: "meta:llama-3-70b-instruct",
        name: "Llama 3 70B Instruct",
        releaseDate: "2024-04-18",
        aliases: [
          "meta:llama-3-70b-instruct",
          "openrouter:meta-llama/llama-3-70b-instruct"
        ]
      }
    ]
  },

  // === Meta Llama 3.1 405B (Powerful) ===
  {
    seriesId: "meta-llama-3.1-405b",
    seriesName: "Meta Llama 3.1 405B",
    maker: "meta",
    tier: "powerful",
    versions: [
      {
        id: "meta:llama-3.1-405b-instruct",
        name: "Llama 3.1 405B Instruct",
        releaseDate: "2024-07-23",
        aliases: [
          "meta:llama-3.1-405b-instruct",
          "meta:Meta-Llama-3.1-405B-Instruct-Turbo",
          "openrouter:meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
          "together:meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo"
        ]
      }
    ]
  },

  // === Meta Llama 4 Maverick (Powerful) ===
  {
    seriesId: "meta-llama-4-maverick",
    seriesName: "Meta Llama 4 Maverick",
    maker: "meta",
    tier: "powerful",
    versions: [
      {
        id: "meta:llama-4-maverick",
        name: "Llama 4 Maverick",
        releaseDate: "2025-02-01", // Estimated
        aliases: [
          "meta:llama-4-maverick",
          "openrouter:meta-llama/llama-4-maverick"
        ]
      }
    ]
  },

  // === Qwen 3 30B (Balanced) ===
  {
    seriesId: "qwen-qwen3-30b",
    seriesName: "Qwen 3 30B",
    maker: "qwen",
    tier: "balanced",
    versions: [
      {
        id: "qwen:qwen3-30b-a3b-instruct-2507",
        name: "Qwen 3 30B A3B Instruct",
        releaseDate: "2025-07-01", // Estimated
        aliases: [
          "qwen:qwen3-30b-a3b-instruct-2507",
          "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
        ]
      }
    ]
  },

  // === Qwen 3 32B (Balanced) ===
  {
    seriesId: "qwen-qwen3-32b",
    seriesName: "Qwen 3 32B",
    maker: "qwen",
    tier: "balanced",
    versions: [
      {
        id: "qwen:qwen3-32b",
        name: "Qwen 3 32B",
        releaseDate: "2025-01-01", // Estimated
        aliases: [
          "qwen:qwen3-32b",
          "openrouter:qwen/qwen3-32b"
        ]
      }
    ]
  },

  // === Z-AI GLM (Balanced) ===
  {
    seriesId: "z-ai-glm",
    seriesName: "Z-AI GLM",
    maker: "z-ai",
    tier: "balanced",
    versions: [
      {
        id: "z-ai:glm-4.5",
        name: "GLM 4.5",
        releaseDate: "2024-12-01", // Estimated
        aliases: [
          "z-ai:glm-4.5",
          "openrouter:z-ai/glm-4.5"
        ]
      }
    ]
  }
];

/**
 * Helper function to find a model series by its ID
 */
export function getModelSeries(seriesId: string): ModelSeries | undefined {
  return MODEL_VERSION_REGISTRY.find(s => s.seriesId === seriesId);
}

/**
 * Helper function to find which series a given model ID belongs to
 * @param modelId - Full or normalized model ID
 * @returns The series if found, undefined otherwise
 */
export function findSeriesForModel(modelId: string): ModelSeries | undefined {
  const normalizedId = modelId.toLowerCase();
  return MODEL_VERSION_REGISTRY.find(series =>
    series.versions.some(version =>
      version.id.toLowerCase() === normalizedId ||
      version.aliases.some(alias => alias.toLowerCase() === normalizedId)
    )
  );
}

/**
 * Helper function to find which version a given model ID represents
 * @param modelId - Full or normalized model ID
 * @returns Object with series and version if found
 */
export function findVersionForModel(modelId: string): { series: ModelSeries; version: ModelVersion } | undefined {
  const normalizedId = modelId.toLowerCase();
  for (const series of MODEL_VERSION_REGISTRY) {
    const version = series.versions.find(v =>
      v.id.toLowerCase() === normalizedId ||
      v.aliases.some(alias => alias.toLowerCase() === normalizedId)
    );
    if (version) {
      return { series, version };
    }
  }
  return undefined;
}

/**
 * Get all series for a specific maker
 * @param maker - Company name (e.g., "anthropic", "openai")
 */
export function getSeriesByMaker(maker: string): ModelSeries[] {
  return MODEL_VERSION_REGISTRY.filter(s => s.maker.toLowerCase() === maker.toLowerCase());
}

/**
 * Get all series for a specific tier
 * @param tier - Performance tier ("fast", "balanced", "powerful")
 */
export function getSeriesByTier(tier: 'fast' | 'balanced' | 'powerful'): ModelSeries[] {
  return MODEL_VERSION_REGISTRY.filter(s => s.tier === tier);
}

/**
 * Validates that all versions in a series are chronologically ordered
 * @returns Array of series IDs with ordering issues
 */
export function validateChronologicalOrdering(): string[] {
  const issues: string[] = [];

  for (const series of MODEL_VERSION_REGISTRY) {
    const dates = series.versions.map(v => new Date(v.releaseDate).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      if (dates[i] > dates[i + 1]) {
        issues.push(`${series.seriesId}: Version ${i} (${series.versions[i].releaseDate}) is after version ${i + 1} (${series.versions[i + 1].releaseDate})`);
      }
    }
  }

  return issues;
}
