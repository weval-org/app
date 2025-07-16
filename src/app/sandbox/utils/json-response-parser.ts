import { getModelResponse } from '@/cli/services/llm-service';
import { checkForErrors } from '@/cli/utils/response-utils';
import { WevalConfig, WevalPromptConfig } from '@/types/shared';
import { generateMinimalBlueprintYaml } from './yaml-generator';

export interface JsonParseResult<T = any> {
  data: T;
  yaml: string;
  sanitized: boolean;
  validationError: string | null;
}

export interface JsonParseOptions {
  enableSelfCorrection?: boolean;
  modelId?: string;
  maxRetries?: number;
}

const DEFAULT_OPTIONS: Required<JsonParseOptions> = {
  enableSelfCorrection: true,
  modelId: 'openrouter:google/gemini-2.5-flash',
  maxRetries: 1
};

/**
 * Extracts JSON from various LLM response formats with multiple fallback strategies
 */
function extractJsonFromResponse(response: string): string | null {
  const trimmedResponse = response.trim();
  
  // Strategy 1: <JSON>content</JSON> tags (preferred)
  const jsonTagsRegex = /<JSON>([\s\S]*?)<\/JSON>/;
  const jsonTagsMatch = trimmedResponse.match(jsonTagsRegex);
  if (jsonTagsMatch && jsonTagsMatch[1]) {
    const content = jsonTagsMatch[1].trim();
    // Handle nested backticks: <JSON>```json...```</JSON>
    const nestedBackticksRegex = /^```(?:json\s*)?\n?([\s\S]*?)\n?```$/;
    const nestedMatch = content.match(nestedBackticksRegex);
    if (nestedMatch && nestedMatch[1]) {
      return nestedMatch[1].trim();
    }
    return content;
  }
  
  // Strategy 2: ```json...``` or ```...``` code blocks
  const codeBlockRegex = /```(?:json\s*)?\n?([\s\S]*?)\n?```/;
  const codeBlockMatch = trimmedResponse.match(codeBlockRegex);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const content = codeBlockMatch[1].trim();
    // Validate it looks like JSON
    if (content.startsWith('{') || content.startsWith('[')) {
      return content;
    }
  }
  
  // Strategy 3: Raw JSON (starts with { or [ and ends with } or ])
  if ((trimmedResponse.startsWith('{') && trimmedResponse.endsWith('}')) ||
      (trimmedResponse.startsWith('[') && trimmedResponse.endsWith(']'))) {
    return trimmedResponse;
  }
  
  // Strategy 4: Find and validate JSON-like content within the response
  const jsonObjectRegex = /(\{[\s\S]*\})/;
  const jsonArrayRegex = /(\[[\s\S]*\])/;

  const objectMatch = trimmedResponse.match(jsonObjectRegex);
  if (objectMatch && objectMatch[1]) {
    const content = objectMatch[1].trim();
    try {
      JSON.parse(content);
      return content; // It's valid JSON, so return the string.
    } catch {
      // Not a valid JSON object, ignore and continue.
    }
  }

  const arrayMatch = trimmedResponse.match(jsonArrayRegex);
  if (arrayMatch && arrayMatch[1]) {
    const content = arrayMatch[1].trim();
    try {
      JSON.parse(content);
      return content; // It's valid JSON, so return the string.
    } catch {
      // Not a valid JSON array, ignore and continue.
    }
  }

  return null;
}

/**
 * Extracts JSON content from LLM response, validates it, and converts to YAML
 */
export async function parseJsonFromResponse<T = any>(
  generatedResponse: string,
  options: JsonParseOptions = {}
): Promise<JsonParseResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Step 1: Try multiple extraction strategies
  const cleanedJson = extractJsonFromResponse(generatedResponse);
  
  if (!cleanedJson) {
    if (process.env.NODE_ENV === 'development') {
      console.error('The model did not return valid JSON in any recognized format. The response was:\n\n===\n', generatedResponse, '\n===');
    }
    throw new Error("The model did not return valid JSON in any recognized format.");
  }
  let finalData: T;
  let wasSanitized = false;
  let validationError: string | null = null;

  // Step 2: Parse JSON
  try {
    finalData = JSON.parse(cleanedJson) as T;
    // If we get here, JSON is valid
  } catch (e: any) {
    // Step 3: Try self-correction if enabled
    if (opts.enableSelfCorrection) {
      const correctionResult = await attemptSelfCorrection<T>(cleanedJson, e.message, opts);
      finalData = correctionResult.data;
      wasSanitized = correctionResult.sanitized;
      validationError = correctionResult.validationError;
    } else {
      validationError = `JSON validation failed: ${e.message}`;
      // Return invalid data as-is for debugging
      finalData = {} as T;
    }
  }

  // Step 3: Convert to YAML using existing utility
  let finalYaml = '';
  try {
    const yaml = await import('js-yaml');
    finalYaml = yaml.dump(finalData);
  } catch (e: any) {
    console.error(`[JSON Parser] Failed to convert to YAML: ${e.message}`);
    console.error('[JSON Parser] The data that failed YAML conversion was:', JSON.stringify(finalData, null, 2));
    finalYaml = `# YAML conversion failed: ${e.message}\n# See server logs for the problematic JSON.`;
  }

  return { 
    data: finalData, 
    yaml: finalYaml, 
    sanitized: wasSanitized, 
    validationError 
  };
}

/**
 * Specialized parser for WevalConfig responses (auto-create, auto-wiki)
 */
export async function parseWevalConfigFromResponse(
  generatedResponse: string,
  options: JsonParseOptions = {}
): Promise<JsonParseResult<WevalConfig>> {
  return parseJsonFromResponse<WevalConfig>(generatedResponse, options);
}

/**
 * Specialized parser for prompt arrays (auto-extend)
 */
export async function parsePromptsFromResponse(
  generatedResponse: string,
  options: JsonParseOptions = {}
): Promise<JsonParseResult<WevalPromptConfig[]>> {
  const result = await parseJsonFromResponse<WevalPromptConfig[] | { prompts: WevalPromptConfig[] }>(
    generatedResponse, 
    options
  );

  // Handle both array format and object with prompts property
  let prompts: WevalPromptConfig[];
  if (Array.isArray(result.data)) {
    prompts = result.data;
  } else if (result.data && typeof result.data === 'object' && 'prompts' in result.data) {
    prompts = (result.data as { prompts: WevalPromptConfig[] }).prompts;
  } else {
    prompts = [];
    result.validationError = result.validationError || 'Response data is not a valid prompts array or object with prompts property';
  }

  return {
    ...result,
    data: prompts
  };
}

/**
 * Attempts to self-correct invalid JSON by re-prompting the LLM with retry logic
 */
async function attemptSelfCorrection<T>(
  invalidJson: string,
  errorMessage: string,
  options: Required<JsonParseOptions>
): Promise<{ data: T; sanitized: boolean; validationError: string | null }> {
  console.warn('[JSON Parser] Initial JSON parsing failed. Attempting self-correction.', errorMessage);

  const selfCorrectionSystemPrompt = `You are an expert JSON debugger. The user will provide you with a piece of JSON that has a syntax error, along with the error message. Your task is to fix the JSON and return only the corrected, valid JSON code block. Do not add any explanation, apologies, or surrounding text. Output only the raw, corrected JSON.`;
  
  let lastError = errorMessage;
  let currentJson = invalidJson;

  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    console.log(`[JSON Parser] Self-correction attempt ${attempt}/${options.maxRetries}`);
    
    const selfCorrectionUserPrompt = `The following JSON is invalid.\nError: ${lastError}\n\nInvalid JSON:\n${currentJson}\n\nPlease provide the corrected JSON.`;

    try {
      const correctedJsonResponse = await getModelResponse({
        modelId: options.modelId,
        messages: [{ role: 'user', content: selfCorrectionUserPrompt }],
        systemPrompt: selfCorrectionSystemPrompt,
        temperature: 0.0,
        useCache: false,
        maxTokens: 10000
      });

      if (checkForErrors(correctedJsonResponse)) {
        throw new Error(`The self-correction model returned an error: ${correctedJsonResponse}`);
      }
      
      // The model might wrap the corrected JSON in markdown fences, so we need to strip them.
      const markdownJsonRegex = /```(?:json\n)?([\s\S]*?)```/;
      const match = correctedJsonResponse.match(markdownJsonRegex);
      const correctedJson = (match ? match[1] : correctedJsonResponse).trim();

      try {
        // Try parsing the corrected JSON
        const parsed = JSON.parse(correctedJson) as T;
        console.log(`[JSON Parser] Self-correction successful on attempt ${attempt}.`);
        return { 
          data: parsed, 
          sanitized: true, 
          validationError: null 
        };
      } catch (e2: any) {
        // If this isn't the last attempt, prepare for the next one
        if (attempt < options.maxRetries) {
          console.warn(`[JSON Parser] Self-correction attempt ${attempt} failed: ${e2.message}. Retrying...`);
          lastError = e2.message;
          currentJson = correctedJson; // Use the corrected (but still invalid) JSON for the next attempt
          continue;
        } else {
          // Final attempt failed
          console.error('[JSON Parser] All self-correction attempts failed.', e2.message);
          return { 
            data: {} as T, 
            sanitized: false, 
            validationError: `JSON validation failed: ${errorMessage}. Self-correction failed after ${options.maxRetries} attempts. Final error: ${e2.message}` 
          };
        }
      }
    } catch (correctionError: any) {
      // If this isn't the last attempt, continue to the next one
      if (attempt < options.maxRetries) {
        console.warn(`[JSON Parser] Self-correction request attempt ${attempt} failed: ${correctionError.message}. Retrying...`);
        continue;
      } else {
        // Final attempt failed
        console.error('[JSON Parser] All self-correction request attempts failed.', correctionError.message);
        return { 
          data: {} as T, 
          sanitized: false, 
          validationError: `JSON validation failed: ${errorMessage}. Could not attempt self-correction after ${options.maxRetries} attempts: ${correctionError.message}` 
        };
      }
    }
  }

  // This should never be reached, but just in case
  return { 
    data: {} as T, 
    sanitized: false, 
    validationError: `JSON validation failed: ${errorMessage}. Self-correction exhausted all ${options.maxRetries} attempts.` 
  };
} 