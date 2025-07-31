import { WevalResult, ExecutiveSummary, StructuredInsights, ModelGrades } from '@/types/shared';
import { generateMarkdownReport } from '../../app/utils/markdownGenerator';
import { getModelResponse } from './llm-service';
import { checkForErrors } from '../utils/response-utils';
import { getConfig } from '../config';
import { getModelDisplayLabel, parseEffectiveModelId } from '../../app/utils/modelIdUtils';
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

    // Group models by their actual maker for consistent MAKER_A, MAKER_B naming
    const modelsByMaker = new Map<string, string[]>();
    for (const modelId of modelIds) {
        // This is a simplified maker extraction. A more robust one might be needed.
        let maker = 'UNKNOWN';
        if (modelId.startsWith('openai:')) maker = 'OPENAI';
        else if (modelId.startsWith('anthropic:')) maker = 'ANTHROPIC';
        else if (modelId.startsWith('google:')) maker = 'GOOGLE';
        else if (modelId.startsWith('meta:')) maker = 'META';
        else if (modelId.startsWith('mistral:')) maker = 'MISTRAL';
        else if (modelId.startsWith('cohere:')) maker = 'COHERE';
        else if (modelId.startsWith('deepseek:')) maker = 'DEEPSEEK';
        else if (modelId.startsWith('xai:') || modelId.startsWith('x-ai:')) maker = 'XAI';
        else if (modelId.startsWith('openrouter:')) {
            const pathParts = modelId.split('/');
            if (pathParts.length > 1) {
                const providerPart = pathParts[0].split(':')[1];
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

    // Sort makers for deterministic naming (MAKER_A, MAKER_B)
    const sortedMakers = Array.from(modelsByMaker.keys()).sort();

    for (let i = 0; i < sortedMakers.length; i++) {
        const makerName = sortedMakers[i];
        const anonymizedMaker = `MAKER_${String.fromCharCode(65 + i)}`;
        const makerModelIds = modelsByMaker.get(makerName)!;

        // Within each maker, group models by their base ID
        const modelsByBaseId = new Map<string, string[]>();
        for (const modelId of makerModelIds) {
            const { baseId } = parseEffectiveModelId(modelId);
            if (!modelsByBaseId.has(baseId)) {
                modelsByBaseId.set(baseId, []);
            }
            modelsByBaseId.get(baseId)!.push(modelId);
        }

        // Sort base IDs for deterministic naming (MODEL_1, MODEL_2)
        const sortedBaseIds = Array.from(modelsByBaseId.keys()).sort();

        console.log('sortedBaseIds', sortedBaseIds)

        for (let j = 0; j < sortedBaseIds.length; j++) {
            const baseId = sortedBaseIds[j];
            const anonymizedBase = `MODEL_${j + 1}`;
            const variants = modelsByBaseId.get(baseId)!;
            console.log('>>variants', variants);

            // Sort variants to have a deterministic order for SYS_0, SYS_1, etc.
            variants.sort();

            for (let k = 0; k < variants.length; k++) {
                const fullId = variants[k];
                const parsed = parseEffectiveModelId(fullId);
                let suffix = '';

                // Only add variant suffixes if there are multiple variants for a base model
                if (variants.length > 1) {
                    // Use the variant's index (k) to create a unique, stable name like _SYS_0, _SYS_1
                    suffix += `_SYS_${k}`;
                }
                
                if (parsed.temperature !== undefined) {
                    // Format temperature to avoid decimals in the name, e.g., 0.7 -> 07
                    suffix += `_TEMP_${String(parsed.temperature).replace('.', '')}`;
                }

                const anonymizedName = `${anonymizedMaker}_${anonymizedBase}${suffix}`;
                realToAnonymized.set(fullId, anonymizedName);
                anonymizedToReal.set(anonymizedName, fullId);
            }
        }
    }
    
    return { realToAnonymized, anonymizedToReal };
}

function anonymizeWevalResultData(
    resultData: WevalResult,
    mapping: Map<string, string>
): WevalResult {
    // Deep clone to avoid mutating the original data
    const anonymizedData = JSON.parse(JSON.stringify(resultData));
    const replacer = (id: string) => mapping.get(id) || id;

    // Replace in top-level fields
    anonymizedData.effectiveModels = anonymizedData.effectiveModels.map(replacer);
    if (anonymizedData.modelSystemPrompts) {
        anonymizedData.modelSystemPrompts = Object.fromEntries(
            Object.entries(anonymizedData.modelSystemPrompts).map(([key, value]) => [replacer(key), value])
        );
    }
    if (anonymizedData.allFinalAssistantResponses) {
        anonymizedData.allFinalAssistantResponses = Object.fromEntries(
            Object.entries(anonymizedData.allFinalAssistantResponses).map(([promptId, models]) => [
                promptId,
                Object.fromEntries(Object.entries(models as object).map(([modelId, response]) => [replacer(modelId), response]))
            ])
        );
    }
    
    // Replace in evaluationResults
    const evalResults = anonymizedData.evaluationResults;
    if (evalResults.llmCoverageScores) {
        evalResults.llmCoverageScores = Object.fromEntries(
            Object.entries(evalResults.llmCoverageScores).map(([promptId, models]) => [
                promptId,
                Object.fromEntries(Object.entries(models as object).map(([modelId, score]) => [replacer(modelId), score]))
            ])
        );
    }
    if (evalResults.perPromptSimilarities) {
        evalResults.perPromptSimilarities = Object.fromEntries(
            Object.entries(evalResults.perPromptSimilarities).map(([promptId, matrix]) => [
                promptId,
                Object.fromEntries(Object.entries(matrix as object).map(([modelA, scores]) => [
                    replacer(modelA),
                    Object.fromEntries(Object.entries(scores as object).map(([modelB, score]) => [replacer(modelB), score]))
                ]))
            ])
        );
    }

    return anonymizedData;
}

function deanonymizeModelNamesInText(text: string, mapping: ModelAnonymizationMapping): string {
    let deanonymizedText = text;
    
    // Step 1: Replace anonymized names with the *full* real model ID
    for (const [anonymizedName, realName] of mapping.anonymizedToReal.entries()) {
        const escaped = anonymizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        deanonymizedText = deanonymizedText.replace(new RegExp(escaped, 'g'), realName);
    }
    
    return deanonymizedText;
}

// Export for testing
export { createModelAnonymizationMapping, deanonymizeModelNamesInText, anonymizeWevalResultData };

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

        // Create anonymization mapping
        const anonymizationMapping = createModelAnonymizationMapping(
            resultData.effectiveModels.filter(m => m !== 'ideal' && m !== IDEAL_MODEL_ID)
        );
        logger.info(`Created anonymization mapping for ${resultData.effectiveModels.length - 1} models`);

        // Anonymize the entire WevalResult data object *before* generating the report
        const anonymizedResultData = anonymizeWevalResultData(resultData, anonymizationMapping.realToAnonymized);
        
        const markdownReport = generateMarkdownReport(anonymizedResultData, MAX_CHARS);
        
        if (markdownReport.length > MAX_CHARS + 100) { 
            logger.warn(`Markdown report was truncated to ~${markdownReport.length} characters for summary generation.`);
        }

        // Get list of evaluated models for grading
        const evaluatedModels = resultData.effectiveModels.filter(m => m !== 'ideal' && m !== IDEAL_MODEL_ID);
        
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
        
        // The markdown report is now already anonymized. No need for anonymizeModelNamesInText.
        const anonymizedMarkdownReport = markdownReport;

        // DEBUG: Log anonymization results
        logger.info(`=== ANONYMIZATION DEBUG ===`);
        logger.info(`Anonymized report length: ${anonymizedMarkdownReport.length} chars`);
        
        // Create completely clean anonymized model lists for the system prompt
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
            !anonymizedModelList.match(/^MAKER_[A-Z]_MODEL_\d+(_SYS_\d+)?(_TEMP_\d+)?(, MAKER_[A-Z]_MODEL_\d+(_SYS_\d+)?(_TEMP_\d+)?)*$/)) {
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
- The anonymized model names give you clues about their relationships. For example, 'MAKER_A_MODEL_1_SYS_0_TEMP_05' and 'MAKER_A_MODEL_1_SYS_1_TEMP_05' are the same base model but with different system prompts. Use this to analyze how different system prompts or temperatures affect a model's performance.
- Pay close attention to the "System Prompt Strategy" section - this tells you whether the evaluation tested different system prompts, used a single global prompt, or used default model behavior
- When system prompt permutations were tested, consider whether performance differences might be attributable to prompting strategy rather than inherent model capabilities  
- Look for patterns related to system prompt effectiveness across different models
- Consider how the system prompt strategy might influence your interpretation of the results

        ${generateGradingCriteriaText()}

        ${ENHANCED_SCORING_GUIDANCE}

        ${GRADING_INSTRUCTIONS}

==== FINAL IMPORTANT REQUIREMENTS: ====
1. You MUST analyze ALL models that participated in this evaluation. Each variant (including different system prompts or temperatures) should be considered independently.
2. You MUST provide grades for EVERY model listed above—no exceptions.
3. Be highly specific, using verbatim quotes and specific examples from the evaluation.
4. Focus on actionable insights that would help someone choose between these models.
5. Each grade should be based on evidence from the evaluation data.
6. Consider the system prompt strategy when interpreting performance differences—note if results might be influenced by prompting choices rather than model capabilities.

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
                const expectedRealModels = evaluatedModels; // No need to map to display names anymore
                logger.info(`Expected models for grade validation: ${expectedRealModels.join(', ')}`);
                
                const missingGrades = expectedRealModels.filter(expected => 
                    !gradedModels.some(graded => graded === expected)
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