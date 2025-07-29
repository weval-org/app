import { WevalResult, ExecutiveSummary, StructuredInsights, ModelGrades } from '@/types/shared';
import { generateMarkdownReport } from '../../app/utils/markdownGenerator';
import { getModelResponse } from './llm-service';
import { checkForErrors } from '../utils/response-utils';
import { getConfig } from '../config';
import { getModelDisplayLabel } from '../../app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '../../app/utils/calculationUtils';
import { 
    generateGradingCriteriaText, 
    GRADING_INSTRUCTIONS, 
    ENHANCED_SCORING_GUIDANCE
} from '../../lib/grading-criteria';
import { TOPICS, Topic } from '../../lib/topics';

const SUMMARIZER_MODEL_ID = 'openrouter:google/gemini-2.5-flash';
const MAX_CHARS = 400000; // ~130k tokens

type Logger = ReturnType<typeof getConfig>['logger'];

// Anonymization utilities
interface ModelAnonymizationMapping {
    realToAnonymized: Map<string, string>;
    anonymizedToReal: Map<string, string>;
}

function createModelAnonymizationMapping(modelIds: string[]): ModelAnonymizationMapping {
    const realToAnonymized = new Map<string, string>();
    const anonymizedToReal = new Map<string, string>();
    
    // Sort input for deterministic mapping
    const sortedModelIds = [...modelIds].sort();
    
    // Group models by actual maker (not provider) for comparative insights
    const modelsByMaker = new Map<string, string[]>();
    
    for (const modelId of sortedModelIds) {
        const displayLabel = getModelDisplayLabel(modelId, {
            hideProvider: true,
            hideSystemPrompt: true,
            hideTemperature: true
        });
        
        // Extract actual maker/company (not API provider)
        let maker = 'UNKNOWN';
        if (modelId.includes('openai:') || displayLabel.toLowerCase().includes('gpt')) {
            maker = 'OPENAI';
        } else if (modelId.includes('anthropic:') || displayLabel.toLowerCase().includes('claude')) {
            maker = 'ANTHROPIC';
        } else if (modelId.includes('google:') || modelId.includes('gemini') || displayLabel.toLowerCase().includes('gemini')) {
            maker = 'GOOGLE';
        } else if (modelId.includes('meta:') || displayLabel.toLowerCase().includes('llama')) {
            maker = 'META';
        } else if (modelId.includes('mistral:') || displayLabel.toLowerCase().includes('mistral')) {
            maker = 'MISTRAL';
        } else if (modelId.includes('cohere:')) {
            maker = 'COHERE';
        } else if (modelId.includes('deepseek:') || displayLabel.toLowerCase().includes('deepseek')) {
            maker = 'DEEPSEEK';
        } else if (modelId.includes('xai:') || modelId.includes('x-ai:') || displayLabel.toLowerCase().includes('grok')) {
            maker = 'XAI';
        } else if (modelId.includes('openrouter:')) {
            // For OpenRouter, extract the actual maker from the path
            const pathParts = modelId.split('/');
            if (pathParts.length > 1) {
                const providerPart = pathParts[0].split(':')[1]; // e.g., "google" from "openrouter:google/gemini"
                if (providerPart === 'anthropic') maker = 'ANTHROPIC';
                else if (providerPart === 'google') maker = 'GOOGLE';
                else if (providerPart === 'meta-llama') maker = 'META';
                else if (providerPart === 'mistralai') maker = 'MISTRAL';
                else if (providerPart === 'openai') maker = 'OPENAI';
                else maker = providerPart.toUpperCase();
            }
        }
        
        if (!modelsByMaker.has(maker)) {
            modelsByMaker.set(maker, []);
        }
        modelsByMaker.get(maker)!.push(modelId);
    }
    
    // Create anonymized names with maker groupings: MAKER_A_MODEL_1, MAKER_A_MODEL_2, etc.
    const makerNames = Array.from(modelsByMaker.keys()).sort(); // Consistent ordering
    makerNames.forEach((maker, makerIndex) => {
        const anonymizedMaker = `MAKER_${String.fromCharCode(65 + makerIndex)}`; // MAKER_A, MAKER_B, etc.
        const modelsForThisMaker = modelsByMaker.get(maker)!;
        
        modelsForThisMaker.forEach((modelId, modelIndex) => {
            const anonymizedName = `${anonymizedMaker}_MODEL_${modelIndex + 1}`; // MAKER_A_MODEL_1, MAKER_A_MODEL_2, etc.
            realToAnonymized.set(modelId, anonymizedName);
            anonymizedToReal.set(anonymizedName, modelId);
        });
    });
    
    return { realToAnonymized, anonymizedToReal };
}

function anonymizeModelNamesInText(text: string, mapping: ModelAnonymizationMapping): string {
    let anonymizedText = text;
    
    // Step 1: Replace all model IDs and variations with anonymized names
    // Sort by length (longest first) to avoid partial replacements
    const sortedRealNames = Array.from(mapping.realToAnonymized.keys())
        .sort((a, b) => b.length - a.length);
    
    for (const realName of sortedRealNames) {
        const anonymizedName = mapping.realToAnonymized.get(realName)!;
        const displayLabel = getModelDisplayLabel(realName, {
            hideProvider: true,
            hideSystemPrompt: true,
            hideTemperature: true
        });
        
        // Get all possible variations of how this model might appear in text
        const namesToReplace = new Set<string>();
        
        // 1. Full model ID (e.g., "openai:gpt-4o")
        namesToReplace.add(realName);
        
        // 2. Display label (e.g., "google/gemini-2.0-flash")
        namesToReplace.add(displayLabel);
        
        // 3. Just the model name part (after last slash or colon)
        const modelOnlyName = displayLabel.split('/').pop() || displayLabel.split(':').pop() || displayLabel;
        namesToReplace.add(modelOnlyName);
        
        // 4. Handle common variations like removing provider prefixes
        if (realName.includes(':')) {
            const afterColon = realName.split(':')[1];
            namesToReplace.add(afterColon);
            
            // Also handle paths like "google/gemini-2.0-flash" -> "gemini-2.0-flash"
            if (afterColon.includes('/')) {
                const afterSlash = afterColon.split('/').pop();
                if (afterSlash) namesToReplace.add(afterSlash);
            }
        }
        
        // Replace all variations
        for (const nameVariation of namesToReplace) {
            if (nameVariation && nameVariation.length > 2) { // Avoid replacing very short strings
                const escaped = nameVariation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                anonymizedText = anonymizedText.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), anonymizedName);
            }
        }
    }
    
    // Step 2: Aggressively remove ALL provider references
    const allProviders = new Set<string>();
    for (const realName of mapping.realToAnonymized.keys()) {
        if (realName.includes(':')) {
            const provider = realName.split(':')[0];
            allProviders.add(provider);
        }
    }
    
    // Remove provider names and provider: prefixes completely
    for (const provider of allProviders) {
        const escapedProvider = provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Remove "provider:" prefixes (e.g., "openai:" -> "")
        anonymizedText = anonymizedText.replace(new RegExp(`\\b${escapedProvider}:`, 'gi'), '');
        
        // Remove standalone provider mentions completely (e.g., "openai" -> "")
        anonymizedText = anonymizedText.replace(new RegExp(`\\b${escapedProvider}\\b(?!:)`, 'gi'), '');
    }
    
    // Step 3: Clean up any remaining provider artifacts
    // Remove any remaining `:` that might be floating around
    anonymizedText = anonymizedText.replace(/([A-Z_]+):\s*MODEL_/g, '$1 MODEL_');
    
    // Remove common provider grouping patterns that might appear in tables/headers
    anonymizedText = anonymizedText.replace(/\b(openai|anthropic|google|meta|mistral|cohere|together|openrouter|xai|x-ai)\s*(models?|group|provider|api)\b/gi, 'model');
    anonymizedText = anonymizedText.replace(/\b(models?|group|provider|api)\s*(from|by|via)\s*(openai|anthropic|google|meta|mistral|cohere|together|openrouter|xai|x-ai)\b/gi, 'models');
    
    // Remove any remaining isolated provider names that might have been missed
    const commonProviders = ['openai', 'anthropic', 'google', 'meta', 'mistral', 'cohere', 'together', 'openrouter', 'xai', 'x-ai'];
    for (const provider of commonProviders) {
        const escapedProvider = provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        anonymizedText = anonymizedText.replace(new RegExp(`\\b${escapedProvider}\\b`, 'gi'), '');
    }
    
    // Replace consecutive whitespace with single space and trim
    anonymizedText = anonymizedText.replace(/\s+/g, ' ').trim();
    
    return anonymizedText;
}

function deanonymizeModelNamesInText(text: string, mapping: ModelAnonymizationMapping): string {
    let deanonymizedText = text;
    
    // Step 1: Handle full model references (MAKER_A_MODEL_1 -> gpt-4o)
    for (const [anonymizedName, realName] of mapping.anonymizedToReal.entries()) {
        const displayLabel = getModelDisplayLabel(realName, {
            hideProvider: true,
            hideSystemPrompt: true,
            hideTemperature: true
        });
        
        // Handle all possible variations the LLM might use for full model names
        const anonymizedVariations = [
            anonymizedName,                                                          // MAKER_A_MODEL_1
            anonymizedName.replace(/_/g, ' '),                                      // MAKER A MODEL 1  
            anonymizedName.replace(/MAKER_([A-Z])_MODEL_(\d+)/, 'Maker $1 Model $2'), // Maker A Model 1
            anonymizedName.replace(/MAKER_([A-Z])_MODEL_(\d+)/, 'maker $1 model $2'), // maker A model 1
            anonymizedName.toLowerCase(),                                            // maker_a_model_1
            anonymizedName.replace(/MAKER_([A-Z])_MODEL_(\d+)/, '$1_$2'),           // A_1 (shortened)
            anonymizedName.replace(/MAKER_([A-Z])_MODEL_(\d+)/, 'Model $2 from Maker $1'), // Model 1 from Maker A
        ];
        
        for (const variation of anonymizedVariations) {
            const escaped = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            deanonymizedText = deanonymizedText.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), displayLabel);
        }
    }
    
    // Step 2: Handle partial references that LLM might use
    // Group models by maker for partial reference handling
    const modelsByMaker = new Map<string, string[]>();
    for (const [anonymizedName, realName] of mapping.anonymizedToReal.entries()) {
        const makerPart = anonymizedName.split('_MODEL_')[0]; // Extract MAKER_A
        if (!modelsByMaker.has(makerPart)) {
            modelsByMaker.set(makerPart, []);
        }
        modelsByMaker.get(makerPart)!.push(realName);
    }
    
    // Handle partial maker references (e.g., "MAKER_A models" -> "OpenAI models")
    for (const [makerPart, realModels] of modelsByMaker.entries()) {
        if (realModels.length > 0) {
            // Use first model to determine maker display name
            const sampleModel = realModels[0];
            let makerDisplayName = 'models'; // fallback
            
            if (sampleModel.includes('openai:') || sampleModel.toLowerCase().includes('gpt')) {
                makerDisplayName = 'OpenAI';
            } else if (sampleModel.includes('anthropic:') || sampleModel.toLowerCase().includes('claude')) {
                makerDisplayName = 'Anthropic';
            } else if (sampleModel.includes('google:') || sampleModel.toLowerCase().includes('gemini')) {
                makerDisplayName = 'Google';
            } else if (sampleModel.includes('meta:') || sampleModel.toLowerCase().includes('llama')) {
                makerDisplayName = 'Meta';
            } else if (sampleModel.includes('mistral:') || sampleModel.toLowerCase().includes('mistral')) {
                makerDisplayName = 'Mistral';
            } else if (sampleModel.includes('xai:') || sampleModel.toLowerCase().includes('grok')) {
                makerDisplayName = 'xAI';
            }
            
            // Replace maker references
            const makerVariations = [
                `${makerPart} models`,                                     // MAKER_A models
                `${makerPart.replace(/_/g, ' ')} models`,                 // MAKER A models  
                `${makerPart.replace(/MAKER_([A-Z])/, 'Maker $1')} models`, // Maker A models
                `${makerPart}`,                                           // MAKER_A (standalone)
                `${makerPart.replace(/_/g, ' ')}`,                       // MAKER A (standalone)
                `${makerPart.replace(/MAKER_([A-Z])/, 'Maker $1')}`,     // Maker A (standalone)
            ];
            
            for (const variation of makerVariations) {
                const escaped = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                deanonymizedText = deanonymizedText.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), makerDisplayName);
            }
        }
    }
    
    // Step 3: Handle standalone model number references (less common but possible)
    // This is tricky because MODEL_1 could refer to any MAKER_X_MODEL_1
    // For now, we'll leave these as-is since they're ambiguous
    
    return deanonymizedText;
}

// Export for testing
export { createModelAnonymizationMapping, anonymizeModelNamesInText, deanonymizeModelNamesInText };

export function parseStructuredSummary(content: string): StructuredInsights | null {
    try {
        const keyFindings: string[] = [];
        const strengths: string[] = [];
        const weaknesses: string[] = [];
        const patterns: string[] = [];
        const grades: ModelGrades[] = [];
        const autoTags: string[] = [];

        // Extract key findings
        const keyFindingMatches = content.match(/<key_finding>(.*?)<\/key_finding>/gs);
        if (keyFindingMatches) {
            keyFindingMatches.forEach(match => {
                const finding = match.replace(/<\/?key_finding>/g, '').trim();
                if (finding) keyFindings.push(finding);
            });
        }

        // Extract auto-tags (formerly topics) 
        const topicMatches = content.match(/<topic>(.*?)<\/topic>/gs);
        if (topicMatches) {
            topicMatches.forEach(match => {
                const tag = match.replace(/<\/?topic>/g, '').trim();
                if (tag) {
                    // Validate against canonical topics list (case-insensitive)
                    const canonicalTopic = TOPICS.find(t => t.toLowerCase() === tag.toLowerCase());
                    if (canonicalTopic) {
                        autoTags.push(canonicalTopic);
                    } else {
                        // If not in canonical list, still include it but log a warning
                        autoTags.push(tag);
                        console.warn(`[ExecutiveSummary] Non-canonical auto-tag found: "${tag}"`);
                    }
                }
            });
        }

        // Extract strengths
        const strengthMatches = content.match(/<strength>(.*?)<\/strength>/gs);
        if (strengthMatches) {
            strengthMatches.forEach(match => {
                const strength = match.replace(/<\/?strength>/g, '').trim();
                if (strength) strengths.push(strength);
            });
        }

        // Extract weaknesses
        const weaknessMatches = content.match(/<weakness>(.*?)<\/weakness>/gs);
        if (weaknessMatches) {
            weaknessMatches.forEach(match => {
                const weakness = match.replace(/<\/?weakness>/g, '').trim();
                if (weakness) weaknesses.push(weakness);
            });
        }

        // Extract patterns
        const patternMatches = content.match(/<pattern>(.*?)<\/pattern>/gs);
        if (patternMatches) {
            patternMatches.forEach(match => {
                const pattern = match.replace(/<\/?pattern>/g, '').trim();
                if (pattern) patterns.push(pattern);
            });
        }

        // console.log('[big debug]', content);

        // Extract grades
        const gradeMatches = content.match(/<grade\s+model="([^"]+)">(.*?)<\/grade>/gs);
        if (gradeMatches) {
            gradeMatches.forEach(match => {
                const modelMatch = match.match(/model="([^"]+)"/);
                const rawModelId = modelMatch && modelMatch[1].trim();
        
                const gradeContent = match.replace(/<grade[^>]*>|<\/grade>/g, '').trim();

                // console.log({rawModelId, modelMatch, gradeContent});
                
                if (rawModelId && gradeContent) {
                    
                    // Keep the raw model ID to preserve all information (provider, system prompts, temperature, etc.)
                    // The frontend can handle display formatting using modelIdUtils
                    const gradeData = parseGradeContent(gradeContent);
                    if (gradeData) {
                        grades.push({ modelId: rawModelId, grades: gradeData });
                    }
                }
            });
        }

        // Only return structured data if we found at least some content
        if (keyFindings.length > 0 || strengths.length > 0 || weaknesses.length > 0 || patterns.length > 0 || grades.length > 0 || autoTags.length > 0) {
            return {
                keyFindings,
                strengths,
                weaknesses,
                patterns,
                grades: grades.length > 0 ? grades : undefined,
                autoTags: autoTags.length > 0 ? autoTags : undefined,
            };
        }

        return null;
    } catch (error) {
        console.error('Error parsing structured summary:', error);
        return null;
    }
}

// Regex patterns to match dimension names to property keys
export const GRADE_DIMENSION_PATTERNS = {
    adherence: /adherence|instruction/i,
    clarity: /clarity|readability/i,
    tone: /tone|style/i,
    depth: /depth|nuance/i,
    coherence: /coherence|conversational|flow/i,
    helpfulness: /helpfulness|actionability/i,
    credibility: /credibility|ethos/i,
    empathy: /empathy|pathos/i,
    creativity: /creativity|originality/i,
    safety: /safety|self-awareness/i,
    argumentation: /argumentation|logos|persuasiveness/i,
    efficiency: /efficiency|succinctness/i
} as const;

export function parseGradeContent(content: string): ModelGrades['grades'] | null {
    try {
        const grades = {
            adherence: 0,
            clarity: 0,
            tone: 0,
            depth: 0,
            coherence: 0,
            helpfulness: 0,
            credibility: 0,
            empathy: 0,
            creativity: 0,
            safety: 0,
            argumentation: 0,
            efficiency: 0
        };

        // Parse grade format like "ADHERENCE: 8/10" or "ADHERENCE: 8"
        const gradeLines = content.split('\n').filter(line => line.trim());
        
        for (const line of gradeLines) {
            // Use regex patterns to match dimensions
            for (const [propertyKey, pattern] of Object.entries(GRADE_DIMENSION_PATTERNS)) {
                if (pattern.test(line)) {
                    const score = extractScore(line);
                    if (score !== null) {
                        grades[propertyKey as keyof typeof grades] = score;
                        break; // Found a match, no need to check other dimensions
                    }
                }
            }
        }

        return grades;
    } catch (error) {
        console.error('Error parsing grade content:', error);
        return null;
    }
}

export function extractScore(line: string): number | null {
    // Match patterns like "8/10", "8", "8.5", etc.
    const match = line.match(/(\d+(?:\.\d+)?)(?:\/10)?/);
    if (match) {
        const score = parseFloat(match[1]);
        // Normalize to 0-10 scale
        return score <= 10 ? score : score / 10;
    }
    return null;
}

export async function generateExecutiveSummary(
    resultData: WevalResult,
    logger: Logger,
): Promise<ExecutiveSummary | { error: string }> {
    try {
        logger.info(`Generating executive summary with model: ${SUMMARIZER_MODEL_ID}`);

        const markdownReport = generateMarkdownReport(resultData, MAX_CHARS);
        
        if (markdownReport.length > MAX_CHARS + 100) { 
            logger.warn(`Markdown report was truncated to ~${markdownReport.length} characters for summary generation.`);
        }

        // Get list of evaluated models for grading
        const evaluatedModels = resultData.effectiveModels.filter(m => m !== 'ideal' && m !== IDEAL_MODEL_ID);
        
        // Create anonymization mapping
        const anonymizationMapping = createModelAnonymizationMapping(evaluatedModels);
        logger.info(`Created anonymization mapping for ${evaluatedModels.length} models to reduce LLM bias`);
        
        // Debug: Show maker groupings
        logger.info(`=== MAKER GROUPINGS ===`);
        const makerGroups = new Map<string, string[]>();
        for (const [realModel, anonymizedModel] of anonymizationMapping.realToAnonymized.entries()) {
            const makerPart = anonymizedModel.split('_MODEL_')[0]; // Extract MAKER_A part
            if (!makerGroups.has(makerPart)) {
                makerGroups.set(makerPart, []);
            }
            makerGroups.get(makerPart)!.push(`${realModel} → ${anonymizedModel}`);
        }
        
        for (const [maker, models] of makerGroups.entries()) {
            logger.info(`${maker}:`);
            models.forEach(mapping => logger.info(`  ${mapping}`));
        }
        logger.info(`=== END MAKER GROUPINGS ===`);
        
        // Anonymize the markdown report
        const anonymizedMarkdownReport = anonymizeModelNamesInText(markdownReport, anonymizationMapping);
        
        // DEBUG: Log anonymization results
        logger.info(`=== ANONYMIZATION DEBUG ===`);
        logger.info(`Original report length: ${markdownReport.length} chars`);
        logger.info(`Anonymized report length: ${anonymizedMarkdownReport.length} chars`);
        
        // Check if any real model names still exist in anonymized report
        const remainingRealNames = [];
        for (const [realName] of anonymizationMapping.realToAnonymized.entries()) {
            const displayLabel = getModelDisplayLabel(realName, {
                hideProvider: true,
                hideSystemPrompt: true,
                hideTemperature: true
            });
            
            if (anonymizedMarkdownReport.toLowerCase().includes(realName.toLowerCase())) {
                remainingRealNames.push(`Full ID: ${realName}`);
            }
            if (anonymizedMarkdownReport.toLowerCase().includes(displayLabel.toLowerCase())) {
                remainingRealNames.push(`Display: ${displayLabel}`);
            }
            
            // Check for provider names (these should be completely eliminated)
            if (realName.includes(':')) {
                const provider = realName.split(':')[0];
                if (anonymizedMarkdownReport.toLowerCase().includes(provider.toLowerCase())) {
                    // Count occurrences for better debugging
                    const providerRegex = new RegExp(`\\b${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
                    const matches = anonymizedMarkdownReport.match(providerRegex);
                    remainingRealNames.push(`Provider: ${provider} (${matches?.length || 0} occurrences)`);
                }
            }
            
            // Check for model-only names
            const modelOnly = displayLabel.split('/').pop() || displayLabel.split(':').pop() || displayLabel;
            if (modelOnly.length > 3 && anonymizedMarkdownReport.toLowerCase().includes(modelOnly.toLowerCase())) {
                remainingRealNames.push(`Model-only: ${modelOnly}`);
            }
        }
        
        if (remainingRealNames.length > 0) {
            logger.warn(`❌ ANONYMIZATION FAILED - Real names still present: ${remainingRealNames.join(', ')}`);
            // Log a sample of the problematic content
            const sampleSize = 500;
            logger.warn(`Sample of anonymized report: ${anonymizedMarkdownReport.substring(0, sampleSize)}...`);
        } else {
            logger.info(`✅ Anonymization successful - no real model names detected, using maker-grouped format`);
        }
        logger.info(`=== END ANONYMIZATION DEBUG ===`);
        
        // Create completely clean anonymized model lists for the system prompt (NO provider info)
        const anonymizedModelList = evaluatedModels
            .map(m => anonymizationMapping.realToAnonymized.get(m) || m)
            .join(', ');
        const anonymizedModelListForGrading = evaluatedModels
            .map(m => anonymizationMapping.realToAnonymized.get(m) || m);
            
        // Verify our system prompt model list is completely clean (should only contain MAKER_X_MODEL_Y)
        logger.info(`Anonymized model list for system prompt: ${anonymizedModelList}`);
        if (anonymizedModelList.includes(':') || anonymizedModelList.toLowerCase().includes('openai') || 
            anonymizedModelList.toLowerCase().includes('openrouter') || anonymizedModelList.toLowerCase().includes('anthropic') ||
            anonymizedModelList.toLowerCase().includes('google') || anonymizedModelList.toLowerCase().includes('meta') ||
            !anonymizedModelList.match(/^MAKER_[A-Z]_MODEL_\d+(, MAKER_[A-Z]_MODEL_\d+)*$/)) {
            logger.error(`🚨 CRITICAL: System prompt contains non-anonymized content: ${anonymizedModelList}`);
        }

        const systemPrompt = `You are an expert AI analyst. The following is a markdown report of a comprehensive evaluation run comparing multiple large language models on a specific set of tasks. Your goal is to synthesize this data and extract the most important, actionable insights for a human reader.

You must provide your analysis using specific XML-like tags to structure your response. Use the following format:

For key findings (1-4 most important takeaways):
<key_finding>Your finding here</key_finding>

For model strengths (specific models that excelled and why):
<strength>Model X excelled at Y because...</strength>

For model weaknesses (specific models that struggled and why):
<weakness>Model Y struggled with Z because...</weakness>

For interesting patterns (clusters, temperature sensitivity, oddities, system prompt effects):
<pattern>Pattern description here</pattern>

For model grading (YOU MUST rate EVERY SINGLE model on a 1-10 scale for each dimension):
<grade model="model_name">
INSTRUCTION ADHERENCE & RELEVANCE: X/10
CLARITY & READABILITY: X/10
TONE & STYLE: X/10
NUANCE & DEPTH: X/10
COHERENCE & CONVERSATIONAL FLOW: X/10
HELPFULNESS & ACTIONABILITY: X/10
ETHOS & CREDIBILITY: X/10
PATHOS & EMPATHY: X/10
ORIGINALITY & CREATIVITY: X/10
SELF-AWARENESS & SAFETY: X/10
PERSUASIVENESS & ARGUMENTATION (LOGOS): X/10
EFFICIENCY & SUCCINCTNESS: X/10
</grade>

CRITICAL: You MUST provide a grade block for each of these specific models: ${anonymizedModelListForGrading.join(', ')}

Then, separately, provide the main over-arching topics of this evaluatio that will help users locate and get a quick picture of the evaluation (choose 3-8 from the provided list):
<topic>Chosen Topic</topic>

Here are the topics you MUST choose from for the <topic> tags:
=== TOPICS ===
${TOPICS.join(',\n')}
=== /END TOPICS ===

IMPORTANT ANALYSIS CONSIDERATIONS:
- Pay close attention to the "System Prompt Strategy" section - this tells you whether the evaluation tested different system prompts, used a single global prompt, or used default model behavior
- When system prompt permutations were tested, consider whether performance differences might be attributable to prompting strategy rather than inherent model capabilities  
- Look for patterns related to system prompt effectiveness across different models
- Consider how the system prompt strategy might influence your interpretation of the results

        ${generateGradingCriteriaText()}

        ${ENHANCED_SCORING_GUIDANCE}

        ${GRADING_INSTRUCTIONS}

==== FINAL IMPORTANT REQUIREMENTS: ====
1. You MUST analyze ALL models that participated in this evaluation, though you can ignore system prompts and temperatures for the purposes of GRADING.
2. You MUST provide grades for EVERY model listed above - no exceptions
3. Be highly specific, using verbatim quotes and specific examples from the evaluation
4. Focus on actionable insights that would help someone choose between these models
5. Each grade should be based on evidence from the evaluation data
6. Consider the system prompt strategy when interpreting performance differences - note if results might be influenced by prompting choices rather than model capabilities

The models being evaluated are: ${anonymizedModelList}

Please provide multiple instances of each tag type as appropriate. Each tag should contain substantive, specific content rather than generic observations.`;

        // DEBUG: Log what we're sending to the LLM
        logger.info(`=== LLM INPUT DEBUG ===`);
        logger.info(`System prompt contains anonymized models: ${anonymizedModelList}`);
        const userMessage = '=== THE REPORT ===\n\n' + anonymizedMarkdownReport;
        const sampleUserMessage = userMessage.substring(0, 1000);
        logger.info(`Sample of user message to LLM: ${sampleUserMessage}...`);
        logger.info(`=== END LLM INPUT DEBUG ===`);

        const summaryText = await getModelResponse({
            modelId: SUMMARIZER_MODEL_ID,
            messages: [{ role: 'user', content: userMessage }],
            systemPrompt: systemPrompt,
            temperature: 0.1,
            maxTokens: 20000,
            useCache: true,
        });
        
        // DEBUG: Log what the LLM responded with (before deanonymization)
        logger.info(`=== LLM OUTPUT DEBUG ===`);
        logger.info(`LLM response length: ${summaryText?.length || 0} chars`);
        if (summaryText) {
            const sampleResponse = summaryText.substring(0, 1000);
            logger.info(`Sample of LLM response (before deanonymization): ${sampleResponse}...`);
            
            // Check if LLM response contains any real model names (it shouldn't!)
            const leakedNames = [];
            for (const [realName] of anonymizationMapping.realToAnonymized.entries()) {
                const displayLabel = getModelDisplayLabel(realName, {
                    hideProvider: true,
                    hideSystemPrompt: true,
                    hideTemperature: true
                });
                
                if (summaryText.toLowerCase().includes(realName.toLowerCase())) {
                    leakedNames.push(`Full ID: ${realName}`);
                }
                if (summaryText.toLowerCase().includes(displayLabel.toLowerCase())) {
                    leakedNames.push(`Display: ${displayLabel}`);
                }
                
                // Check for provider names in LLM response (CRITICAL - these should NEVER appear)
                if (realName.includes(':')) {
                    const provider = realName.split(':')[0];
                    if (summaryText.toLowerCase().includes(provider.toLowerCase())) {
                        const providerRegex = new RegExp(`\\b${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
                        const matches = summaryText.match(providerRegex);
                        leakedNames.push(`Provider: ${provider} (${matches?.length || 0} occurrences)`);
                    }
                }
            }
            
            if (leakedNames.length > 0) {
                logger.error(`🚨 CRITICAL: LLM response contains real model names: ${leakedNames.join(', ')}`);
                logger.error(`This means anonymization failed - LLM should only see MAKER_X_MODEL_Y format.`);
            } else {
                logger.info(`✅ LLM response properly anonymized - contains only maker-grouped references`);
            }
        }
        logger.info(`=== END LLM OUTPUT DEBUG ===`);

        if (!summaryText || summaryText.trim() === '') {
            const errorMessage = `Summarizer model returned an empty response.`;
            logger.error(errorMessage);
            return { error: errorMessage };
        }

        // Deanonymize model names in the LLM response
        const deanonymizedSummaryText = deanonymizeModelNamesInText(summaryText, anonymizationMapping);
        logger.info(`Deanonymized LLM response, restoring real model names`);

        // Parse structured insights from the deanonymized response
        const structuredInsights = parseStructuredSummary(deanonymizedSummaryText);
        const isStructured = structuredInsights !== null;

        if (isStructured) {
            logger.info(`Executive summary generated successfully with structured format.`);
            if (structuredInsights?.autoTags) {
                logger.info(`Identified auto-tags: ${structuredInsights.autoTags.join(', ')}`);
            }
            if (structuredInsights?.grades) {
                const gradedModels = structuredInsights.grades.map(g => g.modelId);
                logger.info(`Grades provided for models (after deanonymization): ${gradedModels.join(', ')}`);
                
                // Check if we got grades for all expected models
                // Convert anonymized expected models to real model display names for comparison
                logger.info(`Converting anonymized model list for grade validation: ${anonymizedModelListForGrading.join(', ')} → real model names`);
                
                const expectedRealModels = anonymizedModelListForGrading.map(anonymizedName => {
                    const realName = anonymizationMapping.anonymizedToReal.get(anonymizedName) || anonymizedName;
                    const displayName = getModelDisplayLabel(realName, {
                        hideProvider: true,
                        hideSystemPrompt: true,
                        hideTemperature: true
                    });
                    logger.info(`  ${anonymizedName} → ${displayName}`);
                    return displayName;
                });
                
                logger.info(`Expected models (after deanonymization): ${expectedRealModels.join(', ')}`);
                
                const missingGrades = expectedRealModels.filter((expected: string) => 
                    !gradedModels.some(graded => 
                        graded.toLowerCase().includes(expected.toLowerCase()) || 
                        expected.toLowerCase().includes(graded.toLowerCase())
                    )
                );
                if (missingGrades.length > 0) {
                    logger.warn(`Missing grades for models: ${missingGrades.join(', ')}`);
                } else {
                    logger.info(`✓ All expected models received grades after anonymization/deanonymization cycle`);
                }
            } else {
                logger.warn(`No model grades found in structured summary.`);
            }
        } else {
            logger.warn(`Executive summary generated but failed to parse structured format, falling back to raw content.`);
        }
        
        return {
            modelId: SUMMARIZER_MODEL_ID,
            content: deanonymizedSummaryText,
            structured: structuredInsights || undefined,
            isStructured: isStructured,
        };

    } catch (summaryError: any) {
        const errorMessage = `An error occurred during executive summary generation: ${summaryError.message}`;
        logger.error(errorMessage);
        return { error: errorMessage };
    }
} 