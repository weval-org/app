import * as yaml from 'js-yaml';
import { getModelResponse } from '@/cli/services/llm-service';
import { checkForErrors } from '@/cli/utils/response-utils';

export interface YamlParseResult {
  yaml: string;
  sanitized: boolean;
  validationError: string | null;
}

export interface YamlParseOptions {
  enableSelfCorrection?: boolean;
  modelId?: string;
  maxRetries?: number;
}

const DEFAULT_OPTIONS: Required<YamlParseOptions> = {
  enableSelfCorrection: true,
  modelId: 'openrouter:google/gemini-2.5-flash-preview-05-20',
  maxRetries: 1
};

/**
 * Extracts YAML content from LLM response and validates it with error recovery
 */
export async function parseYamlFromResponse(
  generatedResponse: string,
  options: YamlParseOptions = {}
): Promise<YamlParseResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Step 1: Extract YAML from <YAML> tags
  const yamlRegex = /<YAML>([\s\S]*)<\/YAML>/;
  const match = generatedResponse.match(yamlRegex);

  if (!match || !match[1]) {
    if (process.env.NODE_ENV === 'development') {
      console.error('The model did not return a valid YAML response within <YAML> tags. The response was:\n\n===\n', generatedResponse, '\n===');
    }
    throw new Error("The model did not return a valid YAML response within <YAML> tags.");
  }
  
  const cleanedYaml = match[1].trim();
  let finalYaml = cleanedYaml;
  let wasSanitized = false;
  let validationError: string | null = null;

  // Step 2: Validate YAML
  try {
    const parsed = yaml.loadAll(cleanedYaml);
    if (parsed.filter(p => p !== null).length === 0) {
      throw new Error('Generated YAML is empty or invalid after parsing.');
    }
    // If we get here, YAML is valid
    return { yaml: finalYaml, sanitized: wasSanitized, validationError };
  } catch (e: any) {
    // Step 3: Try basic sanitization first (handle "unexpected end of stream")
    if (e.message && typeof e.message === 'string' && e.message.includes('unexpected end of the stream')) {
      const lines = cleanedYaml.trim().split('\n');
      if (lines.length > 1) {
        const sanitizedYaml = lines.slice(0, -1).join('\n');
        try {
          const parsed = yaml.loadAll(sanitizedYaml);
          if (parsed.filter(p => p !== null).length === 0) {
            throw new Error('Generated YAML is empty or invalid after parsing.');
          }
          return { 
            yaml: sanitizedYaml, 
            sanitized: true, 
            validationError: null 
          };
        } catch (e2: any) {
          // Basic sanitization failed, try advanced recovery if enabled
          if (opts.enableSelfCorrection) {
            return await attemptSelfCorrection(cleanedYaml, e.message, opts);
          } else {
            validationError = `YAML validation failed: ${e.message}. Auto-sanitization also failed: ${e2.message}`;
          }
        }
      } else {
        // Can't sanitize a single broken line
        if (opts.enableSelfCorrection) {
          return await attemptSelfCorrection(cleanedYaml, e.message, opts);
        } else {
          validationError = `YAML validation failed: ${e.message}`;
        }
      }
    } else {
      // A different kind of YAML error
      if (opts.enableSelfCorrection && e instanceof yaml.YAMLException) {
        return await attemptSelfCorrection(cleanedYaml, e.message, opts);
      } else {
        validationError = `YAML validation failed: ${e.message}`;
      }
    }
  }

  return { yaml: finalYaml, sanitized: wasSanitized, validationError };
}

/**
 * Attempts to self-correct invalid YAML by re-prompting the LLM with retry logic
 */
async function attemptSelfCorrection(
  invalidYaml: string,
  errorMessage: string,
  options: Required<YamlParseOptions>
): Promise<YamlParseResult> {
  console.warn('[YAML Parser] Initial YAML parsing failed. Attempting self-correction.', errorMessage);

  const selfCorrectionSystemPrompt = `You are an expert YAML debugger. The user will provide you with a piece of YAML that has a syntax error, along with the error message. Your task is to fix the YAML and return only the corrected, valid YAML code block. Do not add any explanation, apologies, or surrounding text. Output only the raw, corrected YAML.`;
  
  let lastError = errorMessage;
  let currentYaml = invalidYaml;

  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    console.log(`[YAML Parser] Self-correction attempt ${attempt}/${options.maxRetries}`);
    
    const selfCorrectionUserPrompt = `The following YAML is invalid.\nError: ${lastError}\n\nInvalid YAML:\n${currentYaml}\n\nPlease provide the corrected YAML.`;

    try {
      const correctedYamlResponse = await getModelResponse({
        modelId: options.modelId,
        messages: [{ role: 'user', content: selfCorrectionUserPrompt }],
        systemPrompt: selfCorrectionSystemPrompt,
        temperature: 0.0,
        useCache: false,
        maxTokens: 10000
      });

      if (checkForErrors(correctedYamlResponse)) {
        throw new Error(`The self-correction model returned an error: ${correctedYamlResponse}`);
      }
      
      // The model might wrap the corrected YAML in markdown fences, so we need to strip them.
      const markdownYamlRegex = /```(?:yaml\n)?([\s\S]*?)```/;
      const match = correctedYamlResponse.match(markdownYamlRegex);
      const correctedYaml = (match ? match[1] : correctedYamlResponse).trim();

      try {
        // Try parsing the corrected YAML
        const parsed = yaml.loadAll(correctedYaml);
        if (parsed.filter(p => p !== null).length === 0) {
          throw new Error('Self-corrected YAML is empty or invalid after parsing.');
        }
        console.log(`[YAML Parser] Self-correction successful on attempt ${attempt}.`);
        return { 
          yaml: correctedYaml, 
          sanitized: true, 
          validationError: null 
        };
      } catch (e2: any) {
        // If this isn't the last attempt, prepare for the next one
        if (attempt < options.maxRetries) {
          console.warn(`[YAML Parser] Self-correction attempt ${attempt} failed: ${e2.message}. Retrying...`);
          lastError = e2.message;
          currentYaml = correctedYaml; // Use the corrected (but still invalid) YAML for the next attempt
          continue;
        } else {
          // Final attempt failed
          console.error('[YAML Parser] All self-correction attempts failed.', e2.message);
          return { 
            yaml: invalidYaml, 
            sanitized: false, 
            validationError: `YAML validation failed: ${errorMessage}. Self-correction failed after ${options.maxRetries} attempts. Final error: ${e2.message}` 
          };
        }
      }
    } catch (correctionError: any) {
      // If this isn't the last attempt, continue to the next one
      if (attempt < options.maxRetries) {
        console.warn(`[YAML Parser] Self-correction request attempt ${attempt} failed: ${correctionError.message}. Retrying...`);
        continue;
      } else {
        // Final attempt failed
        console.error('[YAML Parser] All self-correction request attempts failed.', correctionError.message);
        return { 
          yaml: invalidYaml, 
          sanitized: false, 
          validationError: `YAML validation failed: ${errorMessage}. Could not attempt self-correction after ${options.maxRetries} attempts: ${correctionError.message}` 
        };
      }
    }
  }

  // This should never be reached, but just in case
  return { 
    yaml: invalidYaml, 
    sanitized: false, 
    validationError: `YAML validation failed: ${errorMessage}. Self-correction exhausted all ${options.maxRetries} attempts.` 
  };
} 