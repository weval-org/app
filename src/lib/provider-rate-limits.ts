/**
 * Provider Rate Limit Profiles
 *
 * Defines rate limiting behavior and adaptive concurrency parameters for each LLM provider.
 * Uses AIMD (Additive Increase, Multiplicative Decrease) algorithm for dynamic adaptation.
 */

export interface ProviderRateLimitProfile {
  /** Initial concurrency to start with */
  initialConcurrency: number;

  /** Maximum concurrent requests allowed */
  maxConcurrency: number;

  /** Minimum concurrent requests (safety floor) */
  minConcurrency: number;

  /** Whether to adapt concurrency based on rate limits */
  adaptiveEnabled: boolean;

  /** Human-readable description of rate limit policy */
  description?: string;
}

/**
 * Provider-specific rate limit profiles
 *
 * These profiles are informed by:
 * - Provider documentation (where available)
 * - Empirical testing
 * - Conservative defaults for safety
 */
export const PROVIDER_PROFILES: Record<string, ProviderRateLimitProfile> = {
  'openrouter': {
    initialConcurrency: 30,
    maxConcurrency: 60,
    minConcurrency: 5,
    adaptiveEnabled: true,
    description: 'OpenRouter aggregates multiple providers. Unpublished limits, so we adapt dynamically.',
  },

  'openai': {
    initialConcurrency: 20,
    maxConcurrency: 30,
    minConcurrency: 10,
    adaptiveEnabled: false,
    description: 'OpenAI has tier-based rate limits (e.g., Tier 3 = 5000 RPM). Use fixed concurrency.',
  },

  'anthropic': {
    initialConcurrency: 20,
    maxConcurrency: 40,
    minConcurrency: 2,
    adaptiveEnabled: true,
    description: 'Anthropic has tier-based limits but tends to be conservative. Start low, adapt up.',
  },

  'google': {
    initialConcurrency: 20,
    maxConcurrency: 30,
    minConcurrency: 3,
    adaptiveEnabled: true,
    description: 'Google Gemini API has generous limits but varies by model.',
  },

  'mistral': {
    initialConcurrency: 20,
    maxConcurrency: 30,
    minConcurrency: 3,
    adaptiveEnabled: true,
    description: 'Mistral API limits not widely published. Use adaptive strategy.',
  },

  'together': {
    initialConcurrency: 15,
    maxConcurrency: 40,
    minConcurrency: 5,
    adaptiveEnabled: true,
    description: 'Together.ai typically has generous limits for most models.',
  },

  'xai': {
    initialConcurrency: 10,
    maxConcurrency: 25,
    minConcurrency: 3,
    adaptiveEnabled: true,
    description: 'xAI (Grok) limits not well documented. Use adaptive strategy.',
  },

  'default': {
    initialConcurrency: 10,
    maxConcurrency: 30,
    minConcurrency: 3,
    adaptiveEnabled: true,
    description: 'Default profile for unknown providers. Conservative initial value, adapts based on behavior.',
  },
};

/**
 * Get the rate limit profile for a provider
 * @param provider Provider name (e.g., 'openrouter', 'openai')
 * @returns Provider profile, or default if not found
 */
export function getProviderProfile(provider: string): ProviderRateLimitProfile {
  const normalizedProvider = provider.toLowerCase();
  return PROVIDER_PROFILES[normalizedProvider] || PROVIDER_PROFILES['default'];
}

/**
 * Parse provider name from model ID
 * @param modelId Full model ID (e.g., 'openrouter:google/gemini-pro')
 * @returns Provider name (e.g., 'openrouter')
 */
export function extractProviderFromModelId(modelId: string): string {
  const parts = modelId.split(':');
  return parts[0] || 'unknown';
}

/**
 * Parse concurrency override from CLI argument
 * @param overrideString Format: "openrouter:50,anthropic:10"
 * @returns Map of provider to concurrency limit
 */
export function parseConcurrencyOverrides(overrideString: string | undefined): Map<string, number> {
  const overrides = new Map<string, number>();

  if (!overrideString) {
    return overrides;
  }

  const pairs = overrideString.split(',').map(s => s.trim()).filter(s => s);

  for (const pair of pairs) {
    const [provider, concurrencyStr] = pair.split(':').map(s => s.trim());
    const concurrency = parseInt(concurrencyStr, 10);

    if (!provider || isNaN(concurrency) || concurrency <= 0) {
      throw new Error(`Invalid concurrency override: '${pair}'. Expected format: 'provider:number' (e.g., 'openrouter:50')`);
    }

    overrides.set(provider.toLowerCase(), concurrency);
  }

  return overrides;
}

/**
 * Apply CLI overrides to a provider profile
 * @param provider Provider name
 * @param overrides Map of provider overrides
 * @returns Modified profile with overrides applied
 */
export function applyOverrides(
  provider: string,
  overrides: Map<string, number>
): ProviderRateLimitProfile {
  const profile = getProviderProfile(provider);
  const override = overrides.get(provider.toLowerCase());

  if (override !== undefined) {
    return {
      ...profile,
      initialConcurrency: override,
      maxConcurrency: override,
      minConcurrency: override,
      adaptiveEnabled: false, // Disable adaptation when user sets explicit limit
      description: `${profile.description} [CLI override: ${override}]`,
    };
  }

  return profile;
}
