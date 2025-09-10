/**
 * Control signals and tag constants for Story feature
 * Centralizes all magic strings used for orchestration
 */

export const CONTROL_SIGNALS = {
  // Orchestrator → Creator delegation
  READY_TO_BEGIN: '<ready_to_begin/>',
  
  // Orchestrator → Updater delegation  
  UPDATE_EVAL: '<update_eval/>',
  
  // Quick-run results embedding
  QUICK_RESULT_START: '<quick_result>',
  QUICK_RESULT_END: '</quick_result>',
  
  // Interactive CTAs
  CTA_START: '<cta>',
  CTA_END: '</cta>',
  
  // Hidden context containers
  BLUEPRINT_YAML_START: '<BLUEPRINT_YAML>',
  BLUEPRINT_YAML_END: '</BLUEPRINT_YAML>',
  
  // Creator/Updater input containers
  JSON_START: '<JSON>',
  JSON_END: '</JSON>',
  CURRENT_JSON_START: '<CURRENT_JSON>',
  CURRENT_JSON_END: '</CURRENT_JSON>',
  GUIDANCE_START: '<GUIDANCE>',
  GUIDANCE_END: '</GUIDANCE>',
} as const;

export const CONTROL_PATTERNS = {
  READY_TO_BEGIN: /<ready_to_begin\/>/i,
  UPDATE_EVAL: /<update_eval\/>/i,
  CTA: /<cta>([\s\S]*?)<\/cta>/gi,
  QUICK_RESULT: /<quick_result>([\s\S]*?)<\/quick_result>/i,
  JSON_BLOCK: /<JSON>[\s\S]*?<\/JSON>/i,
} as const;

/**
 * Helper functions for working with control signals
 */
export const ControlSignalHelpers = {
  wrapCta: (text: string) => `${CONTROL_SIGNALS.CTA_START}${text}${CONTROL_SIGNALS.CTA_END}`,
  wrapQuickResult: (data: any) => `${CONTROL_SIGNALS.QUICK_RESULT_START}${JSON.stringify(data)}${CONTROL_SIGNALS.QUICK_RESULT_END}`,
  wrapBlueprintYaml: (yaml: string) => `${CONTROL_SIGNALS.BLUEPRINT_YAML_START}${yaml}${CONTROL_SIGNALS.BLUEPRINT_YAML_END}`,
  
  hasReadySignal: (text: string) => CONTROL_PATTERNS.READY_TO_BEGIN.test(text),
  hasUpdateSignal: (text: string) => CONTROL_PATTERNS.UPDATE_EVAL.test(text),
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
  
  extractQuickResult: (text: string) => {
    const match = text.match(CONTROL_PATTERNS.QUICK_RESULT);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  },
  
  cleanText: (text: string) => {
    return text
      .replace(CONTROL_PATTERNS.READY_TO_BEGIN, '')
      .replace(CONTROL_PATTERNS.UPDATE_EVAL, '')
      .replace(CONTROL_PATTERNS.CTA, '')
      .replace(CONTROL_PATTERNS.QUICK_RESULT, '')
      .trim();
  },
} as const;
