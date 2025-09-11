/**
 * Control signals and tag constants for Story feature
 * Centralizes all magic strings used for orchestration
 */
export type ControlSignal = keyof typeof CONTROL_PATTERNS;

export const CONTROL_SIGNALS = {
  // User-visible response from orchestrator
  USER_RESPONSE_START: '<USER_RESPONSE>',
  USER_RESPONSE_END: '</USER_RESPONSE>',

  // Hidden instructions from orchestrator
  SYSTEM_INSTRUCTIONS_START: '<SYSTEM_INSTRUCTIONS>',
  SYSTEM_INSTRUCTIONS_END: '</SYSTEM_INSTRUCTIONS>',

  // Interactive CTAs
  CTA_START: '<cta>',
  CTA_END: '</cta>',
  
  // Hidden context containers for the orchestrator's INPUT
  SYSTEM_STATUS_START: '<SYSTEM_STATUS>',
  SYSTEM_STATUS_END: '</SYSTEM_STATUS>',
  USER_MESSAGE_START: '<USER_MESSAGE>',
  USER_MESSAGE_END: '</USER_MESSAGE>',
  
  // Creator/Updater output containers
  JSON_START: '<JSON>',
  JSON_END: '</JSON>',
} as const;

export const CONTROL_PATTERNS = {
  // These are for the streaming parser to find tagged blocks in the LLM response
  USER_RESPONSE: /<USER_RESPONSE>([\s\S]*?)<\/USER_RESPONSE>/gi,
  SYSTEM_INSTRUCTIONS: /<SYSTEM_INSTRUCTIONS>([\s\S]*?)<\/SYSTEM_INSTRUCTIONS>/i,
  CTA: /<cta>([\s\S]*?)<\/cta>/gi,
  // This is for validation on the backend
  JSON_BLOCK: /<JSON>[\s\S]*?<\/JSON>/i,
} as const;

/**
 * Helper functions for working with control signals
 */
export const ControlSignalHelpers = {
  wrapCta: (text: string) => `${CONTROL_SIGNALS.CTA_START}${text}${CONTROL_SIGNALS.CTA_END}`,
  
  hasJsonBlock: (text: string) => CONTROL_PATTERNS.JSON_BLOCK.test(text),
  
  extractCtas: (text: string) => {
    const ctas: string[] = [];
    let match;
    const pattern = new RegExp(CONTROL_PATTERNS.CTA.source, CONTROL_PATTERNS.CTA.flags);
    while ((match = pattern.exec(text)) !== null) {
      if (match[1] && match[1].trim()) {
        ctas.push(match[1].trim());
      }
    }
    return ctas;
  },
  
  // Clean text meant for user display by removing any stray tags
  cleanUserText: (text: string) => {
    return text
      .replace(CONTROL_PATTERNS.CTA, '$1') // Preserve CTA text
      .trim();
  },
} as const;
