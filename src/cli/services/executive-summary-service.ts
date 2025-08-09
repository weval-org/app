import { WevalResult, ExecutiveSummary, StructuredInsights, ModelGrades } from '@/types/shared';
import { generateMarkdownReportAnonymized } from '../../app/utils/markdownGenerator';
import { getModelResponse } from './llm-service';
import { getConfig } from '../config';
import { getModelDisplayLabel, parseModelIdForDisplay, extractMakerFromModelId } from '../../app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '../../app/utils/calculationUtils';
import { generateSystemPrompt, AnonymizedModelReference } from './executive-summary-prompt';
import { TOPICS } from '../../lib/topics';
import { GRADING_DIMENSIONS } from '../../lib/grading-criteria';

const SUMMARIZER_MODEL_ID = 'openrouter:google/gemini-2.5-flash';
const MAX_CHARS = 500000; // ~130k tokens

type Logger = ReturnType<typeof getConfig>['logger'];

/**
 * Anonymization System with Opaque IDs
 */
export interface AnonymizedModelData {
    realId: string;
    maker: string;
    model: string;
    sys?: string;
    temp?: string;
}

export interface ModelAnonymizationMapping {
    realToAnonymized: Map<string, AnonymizedModelData>;
    anonymizedToReal: Map<string, string>;
    // Reverse lookup maps for individual components
    makerToReal: Map<string, string>;
    modelToReal: Map<string, string>;
    sysToReal: Map<string, string | number>;
    tempToReal: Map<string, number>;
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

export function parseGradeContent(content: string): { score: number | null; reasoning: string } {
    try {
        // Extract reasoning and score from the new format
        let reasoning = '';
        let score: number | null = null;

        const lines = content.split('\n').map(line => line.trim()).filter(line => line);
        
        for (const line of lines) {
            if (line.toUpperCase().startsWith('REASONING:')) {
                reasoning = line.substring(10).trim(); // Remove "REASONING:" prefix
            } else if (line.toUpperCase().startsWith('SCORE:')) {
                const scorePart = line.substring(6).trim(); // Remove "SCORE:" prefix
                if (scorePart.toUpperCase() === 'N/A' || scorePart.toUpperCase() === 'NA') {
                    score = null;
                } else {
                    const extractedScore = extractScore(scorePart);
                    if (extractedScore !== null) {
                        score = extractedScore;
                    }
                }
            }
        }

        return { score, reasoning };
    } catch (error) {
        console.error('Error parsing grade content:', error);
        return { score: null, reasoning: '' };
    }
}

/**
 * Creates deterministic but opaque IDs for makers, models, systems, and temperatures.
 * Uses high numbers to avoid confusion with actual values.
 */
export function createModelAnonymizationMapping(modelIds: string[]): ModelAnonymizationMapping {
    const realToAnonymized = new Map<string, AnonymizedModelData>();
    const anonymizedToReal = new Map<string, string>();
    const makerToReal = new Map<string, string>();
    const modelToReal = new Map<string, string>();
    const sysToReal = new Map<string, string | number>();
    const tempToReal = new Map<string, number>();

    // Collect unique values
    const uniqueMakers = new Set<string>();
    const uniqueModels = new Set<string>();
    const uniqueSysContents = new Set<string | number>();
    const uniqueTemps = new Set<number>();

    // First pass: collect all unique components
    for (const modelId of modelIds) {
        const parsed = parseModelIdForDisplay(modelId);
        
        // Extract maker using utility function
        const maker = extractMakerFromModelId(modelId);

        uniqueMakers.add(maker);
        uniqueModels.add(parsed.baseId);
        
        if (parsed.systemPromptIndex !== undefined) {
            uniqueSysContents.add(parsed.systemPromptIndex);
        }
        if (parsed.temperature !== undefined) {
            uniqueTemps.add(parsed.temperature);
        }
    }

    // Generate deterministic opaque IDs
    const sortedMakers = Array.from(uniqueMakers).sort();
    const sortedModels = Array.from(uniqueModels).sort();
    const sortedSysContents = Array.from(uniqueSysContents).sort();
    const sortedTemps = Array.from(uniqueTemps).sort();

    // Create maker mappings (starting from high numbers)
    sortedMakers.forEach((maker, index) => {
        const opaqueId = `MK_${5000 + index}`;
        makerToReal.set(opaqueId, maker);
    });

    // Create model mappings
    sortedModels.forEach((baseId, index) => {
        const opaqueId = `MD_${6000 + index}`;
        modelToReal.set(opaqueId, baseId);
    });

    // Create system prompt mappings
    sortedSysContents.forEach((sysContent, index) => {
        const opaqueId = `S_${7000 + index}`;
        sysToReal.set(opaqueId, sysContent);
    });

    // Create temperature mappings
    sortedTemps.forEach((temp, index) => {
        const opaqueId = `T_${8000 + index}`;
        tempToReal.set(opaqueId, temp);
    });

    // Second pass: create full model mappings
    for (const modelId of modelIds) {
        const parsed = parseModelIdForDisplay(modelId);
        
        // Extract maker using utility function  
        const maker = extractMakerFromModelId(modelId);

        // Find opaque IDs
        const makerOpaqueId = Array.from(makerToReal.entries()).find(([_, realMaker]) => realMaker === maker)?.[0] || 'MK_UNKNOWN';
        const modelOpaqueId = Array.from(modelToReal.entries()).find(([_, realModel]) => realModel === parsed.baseId)?.[0] || 'MD_UNKNOWN';
        
        let sysOpaqueId: string | undefined;
        if (parsed.systemPromptIndex !== undefined) {
            sysOpaqueId = Array.from(sysToReal.entries()).find(([_, realSys]) => realSys === parsed.systemPromptIndex)?.[0];
        }

        let tempOpaqueId: string | undefined;
        if (parsed.temperature !== undefined) {
            tempOpaqueId = Array.from(tempToReal.entries()).find(([_, realTemp]) => realTemp === parsed.temperature)?.[0];
        }

        const anonymizedData: AnonymizedModelData = {
            realId: modelId,
            maker: makerOpaqueId,
            model: modelOpaqueId,
            sys: sysOpaqueId,
            temp: tempOpaqueId,
        };

        realToAnonymized.set(modelId, anonymizedData);
        anonymizedToReal.set(modelId, modelId); // For reverse lookup
    }

    return {
        realToAnonymized,
        anonymizedToReal,
        makerToReal,
        modelToReal,
        sysToReal,
        tempToReal,
    };
}

/**
 * Anonymizes WevalResult data by replacing model IDs with simplified anonymous identifiers
 * for use in the markdown report generation.
 */
export function anonymizeWevalResultData(
    resultData: WevalResult,
    mapping: ModelAnonymizationMapping
): WevalResult {
    // Deep clone to avoid mutating the original data
    const anonymizedData = JSON.parse(JSON.stringify(resultData));
    
    const replacer = (realId: string) => {
        const anon = mapping.realToAnonymized.get(realId);
        if (!anon) return realId;
        
        // Create a simplified ID for the markdown report
        let simplifiedId = `${anon.maker}_${anon.model}`;
        if (anon.sys) simplifiedId += `_${anon.sys}`;
        if (anon.temp) simplifiedId += `_${anon.temp}`;
        return simplifiedId;
    };

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
    if (evalResults && evalResults.llmCoverageScores) {
        evalResults.llmCoverageScores = Object.fromEntries(
            Object.entries(evalResults.llmCoverageScores).map(([promptId, models]) => [
                promptId,
                Object.fromEntries(Object.entries(models as object).map(([modelId, score]) => [replacer(modelId), score]))
            ])
        );
    }
    
    if (evalResults && evalResults.perPromptSimilarities) {
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

/**
 * Parses <ref /> tags and converts them to human-readable text with markdown links.
 */
export function deanonymizeModelNamesInText(
    text: string, 
    mapping: ModelAnonymizationMapping
): string {

    let result = text;

    // Handle <ref /> tags with various attribute combinations
    const refTagRegex = /<ref\s+([^>]+)\s*\/>/g;
    
    result = result.replace(refTagRegex, (match, attributes) => {
        const attrs: Record<string, string> = {};
        
        // Parse attributes
        const attrRegex = /(\w+)="([^"]+)"/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attributes)) !== null) {
            attrs[attrMatch[1]] = attrMatch[2];
        }

        // Handle different reference types
        if (attrs.maker && attrs.model && (attrs.sys || attrs.temp)) {
            // Full variant reference
            return generateVariantLink(attrs, mapping);
        } else if (attrs.maker && attrs.model) {
            // Base model reference
            return generateBaseModelLink(attrs, mapping);
        } else if (attrs.model) {
            // Model-only reference (need to find the maker)
            return generateModelOnlyReference(attrs.model, mapping);
        } else if (attrs.maker) {
            // Maker-only reference
            return generateMakerReference(attrs.maker, mapping);
        } else if (attrs.sys) {
            // System prompt reference
            return generateSysReference(attrs.sys, mapping);
        } else if (attrs.temp) {
            // Temperature reference
            return generateTempReference(attrs.temp, mapping);
        } else if (attrs.prompt) {
            // Prompt reference
            return generatePromptReference(attrs.prompt);
        }

        // If we can't parse it, return unchanged
        return match;
    });

    return result;
}

function generateVariantLink(attrs: Record<string, string>, mapping: ModelAnonymizationMapping): string {
    
    // Find the real model ID that matches these attributes
    for (const [realId, anon] of mapping.realToAnonymized.entries()) {
        const makerMatch = anon.maker === attrs.maker;
        const modelMatch = anon.model === attrs.model; 
        // Treat unspecified attributes as wildcards so we still match variants
        const sysMatch = attrs.sys ? (anon.sys === attrs.sys) : true;
        const tempMatch = attrs.temp ? (anon.temp === attrs.temp) : true;
        
        if (makerMatch && modelMatch && sysMatch && tempMatch) {
            
            // Generate a user-friendly display name
            const parsed = parseModelIdForDisplay(realId);
            let displayName = getModelDisplayLabel(parsed.baseId, { 
                prettifyModelName: true, 
                hideProvider: true, 
                hideModelMaker: true 
            });
            
            // Add variant info WITHOUT revealing actual system prompt indices
            const variantParts: string[] = [];
            if (parsed.systemPromptIndex !== undefined) {
                variantParts.push(`System ${parsed.systemPromptIndex}`);
            }
            if (parsed.temperature !== undefined && parsed.temperature !== 0) {
                variantParts.push(`Temperature ${parsed.temperature}`);
            }
            
            if (variantParts.length > 0) {
                displayName += ` (${variantParts.join(', ')})`;
            }
            
            return `[${displayName}](#model-perf:${realId})`;
        }
    }
    
    // Fallback to base model link if we can at least match maker+model
    if (attrs.maker && attrs.model) {
        return generateBaseModelLink(attrs, mapping);
    }

    return `<ref ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} />`;
}

function generateBaseModelLink(attrs: Record<string, string>, mapping: ModelAnonymizationMapping): string {
    // Find any real model ID that matches maker and model (ignoring variants)
    for (const [realId, anon] of mapping.realToAnonymized.entries()) {
        if (anon.maker === attrs.maker && anon.model === attrs.model) {
            const parsed = parseModelIdForDisplay(realId);
            const displayName = getModelDisplayLabel(parsed.baseId, { 
                prettifyModelName: false, // Keep original casing
                hideProvider: true, 
                hideModelMaker: true 
            });

            return `[${displayName}](#model-perf:${realId})`;
        }
    }
    
    return `<ref ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} />`;
}

function generateMakerReference(makerId: string, mapping: ModelAnonymizationMapping): string {
    const realMaker = mapping.makerToReal.get(makerId);
    if (realMaker) {
        // Convert OPENAI -> OpenAI, ANTHROPIC -> Anthropic, etc.
        switch (realMaker) {
            case 'OPENAI': return 'OpenAI';
            case 'ANTHROPIC': return 'Anthropic';
            case 'GOOGLE': return 'Google';
            case 'META': return 'Meta';
            case 'MISTRAL': return 'Mistral';
            case 'COHERE': return 'Cohere';
            case 'DEEPSEEK': return 'DeepSeek';
            case 'XAI': return 'xAI';
            case 'MOONSHOT': return 'Moonshot AI';
            default: return realMaker.charAt(0) + realMaker.slice(1).toLowerCase();
        }
    }
    return `<ref maker="${makerId}" />`;
}

function generateSysReference(sysId: string, mapping: ModelAnonymizationMapping): string {
    const realSys = mapping.sysToReal.get(sysId);
    if (realSys !== undefined) {
        return `[System ${realSys}](#system-prompt:${realSys})`;
    }
    return `<ref sys="${sysId}" />`;
}

function generateModelOnlyReference(modelId: string, mapping: ModelAnonymizationMapping): string {
    // Find any real model ID that has this model component
    for (const [realId, anon] of mapping.realToAnonymized.entries()) {
        if (anon.model === modelId) {
            const parsed = parseModelIdForDisplay(realId);
            const displayName = getModelDisplayLabel(parsed.baseId, { 
                prettifyModelName: false, // Keep original casing
                hideProvider: true, 
                hideModelMaker: true 
            });
            
            return `[${displayName}](#model-perf:${realId})`;
        }
    }
    
    return `<ref model="${modelId}" />`;
}

function generateTempReference(tempId: string, mapping: ModelAnonymizationMapping): string {
    const realTemp = mapping.tempToReal.get(tempId);
    if (realTemp !== undefined) {
        return `temperature ${realTemp}`;
    }
    return `<ref temp="${tempId}" />`;
}

function generatePromptReference(promptId: string): string {
    // Create a clickable link that will trigger the prompt detail modal
    // The promptId should be used as-is since it's already the real prompt ID
    return `[${promptId}](#prompt-detail:${promptId})`;
}

/**
 * Parses structured summary content with the new ref tag system.
 */
export function parseStructuredSummary(
    content: string, 
    mapping: ModelAnonymizationMapping
): StructuredInsights | null {
    try {
        const keyFindings: string[] = [];
        const strengths: string[] = [];
        const weaknesses: string[] = [];
        const patterns: string[] = [];
        const grades: ModelGrades[] = [];
        const autoTags: string[] = [];

        // First, deanonymize all ref tags in qualitative sections
        const deanonymizedContent = deanonymizeModelNamesInText(content, mapping);

        // Extract key findings
        const keyFindingMatches = deanonymizedContent.match(/<key_finding>(.*?)<\/key_finding>/gs);
        if (keyFindingMatches) {
            keyFindingMatches.forEach(match => {
                const finding = match.replace(/<\/?key_finding>/g, '').trim();
                if (finding) keyFindings.push(finding);
            });
        }

        // Extract auto-tags (topics)
        const topicMatches = deanonymizedContent.match(/<topic>(.*?)<\/topic>/gs);
        if (topicMatches) {
            topicMatches.forEach(match => {
                const tag = match.replace(/<\/?topic>/g, '').trim();
                if (tag) {
                    const canonicalTopic = TOPICS.find(t => t.toLowerCase() === tag.toLowerCase());
                    if (canonicalTopic) {
                        autoTags.push(canonicalTopic);
                    } else {
                        autoTags.push(tag);
                        console.warn(`[ExecutiveSummary] Non-canonical auto-tag found: "${tag}"`);
                    }
                }
            });
        }

        // Extract strengths
        const strengthMatches = deanonymizedContent.match(/<strength>(.*?)<\/strength>/gs);
        if (strengthMatches) {
            strengthMatches.forEach(match => {
                const strength = match.replace(/<\/?strength>/g, '').trim();
                if (strength) strengths.push(strength);
            });
        }

        // Extract weaknesses
        const weaknessMatches = deanonymizedContent.match(/<weakness>(.*?)<\/weakness>/gs);
        if (weaknessMatches) {
            weaknessMatches.forEach(match => {
                const weakness = match.replace(/<\/?weakness>/g, '').trim();
                if (weakness) weaknesses.push(weakness);
            });
        }

        // Extract patterns
        const patternMatches = deanonymizedContent.match(/<pattern>(.*?)<\/pattern>/gs);
        if (patternMatches) {
            patternMatches.forEach(match => {
                const pattern = match.replace(/<\/?pattern>/g, '').trim();
                if (pattern) patterns.push(pattern);
            });
        }

        // Extract grades using the new individual dimension format
        const gradeMatches = content.match(/<grade\s+([^>]+)>(.*?)<\/grade>/gs);
        if (gradeMatches) {
            // Group grades by base model (maker+model)
            const baseModelGradesMap = new Map<string, { 
                grades: Partial<ModelGrades['grades']>, 
                reasoning: Partial<NonNullable<ModelGrades['reasoning']>>,
                maker: string,
                model: string
            }>();

            gradeMatches.forEach(match => {
                const attrMatch = match.match(/<grade\s+([^>]+)>/);
                if (!attrMatch) return;

                const attributes = attrMatch[1];
                const gradeContent = match.replace(/<grade[^>]*>|<\/grade>/g, '').trim();

                // Parse attributes
                const attrs: Record<string, string> = {};
                const attrRegex = /(\w+)="([^"]+)"/g;
                let attrResult;
                while ((attrResult = attrRegex.exec(attributes)) !== null) {
                    attrs[attrResult[1]] = attrResult[2];
                }

                const dimension = attrs.dimension;
                
                if (attrs.maker && attrs.model && dimension && gradeContent) {
                    // Validate dimension is a known key
                    const validDimension = GRADING_DIMENSIONS.find(d => d.key === dimension);
                    if (!validDimension) {
                        console.warn(`Unknown dimension key: ${dimension}`);
                        return;
                    }

                    const gradeData = parseGradeContent(gradeContent);
                    
                    // Use base model key (maker+model only)
                    const baseModelKey = `${attrs.maker}|${attrs.model}`;
                    
                    // Get or create base model grades entry
                    let baseModelGrades = baseModelGradesMap.get(baseModelKey);
                    if (!baseModelGrades) {
                        baseModelGrades = { 
                            grades: {}, 
                            reasoning: {},
                            maker: attrs.maker,
                            model: attrs.model
                        };
                        baseModelGradesMap.set(baseModelKey, baseModelGrades);
                    }

                    // Set the grade and reasoning for this dimension
                    (baseModelGrades.grades as any)[dimension] = gradeData.score;
                    if (gradeData.reasoning) {
                        (baseModelGrades.reasoning as any)[dimension] = gradeData.reasoning;
                    }
                }
            });

            // Apply base model grades to all variants of each model
            for (const [baseModelKey, baseModelData] of baseModelGradesMap.entries()) {
                // Find the first real model ID that matches this base model to use as the representative
                const representativeModelId = findRealModelIdFromAttributes({
                    maker: baseModelData.maker,
                    model: baseModelData.model
                }, mapping);

                if (representativeModelId) {
                    // Use clean base model ID (remove variant suffixes)
                    const parsed = parseModelIdForDisplay(representativeModelId);
                    const cleanBaseModelId = parsed.baseId;
                    
                    const fullGrades = Object.fromEntries(
                        GRADING_DIMENSIONS.map(d => [d.key, baseModelData.grades[d.key as keyof typeof baseModelData.grades] ?? null])
                    ) as ModelGrades['grades'];

                    const modelGrade: ModelGrades = {
                        modelId: cleanBaseModelId, // Use clean base model ID
                        grades: fullGrades,
                        reasoning: Object.keys(baseModelData.reasoning).length > 0 ? baseModelData.reasoning : undefined
                    };

                    grades.push(modelGrade);
                }
            }
        }

        // Always return structured data, even if empty
        return {
            keyFindings,
            strengths,
            weaknesses,
            patterns,
            grades: grades.length > 0 ? grades : undefined,
            autoTags: autoTags.length > 0 ? autoTags : undefined,
        };
    } catch (error) {
        console.error('Error parsing structured summary:', error);
        return null;
    }
}

function findRealModelIdFromAttributes(
    attrs: Record<string, string>, 
    mapping: ModelAnonymizationMapping
): string | null {
    // For base model grading, we only need maker and model
    if (!attrs.maker || !attrs.model) {
        return null;
    }

    // Find any matching real model ID (we'll apply to all variants later)
    for (const [realId, anon] of mapping.realToAnonymized.entries()) {
        if (anon.maker === attrs.maker && anon.model === attrs.model) {
            return realId;
        }
    }

    return null;
}

/**
 * Main function to generate executive summary
 */
export async function generateExecutiveSummary(
    resultData: WevalResult,
    logger: Logger,
): Promise<ExecutiveSummary | { error: string }> {
    try {
        logger.info(`Generating executive summary with model: ${SUMMARIZER_MODEL_ID}`);

        // Create anonymization mapping
        const evaluatedModels = resultData.effectiveModels.filter(m => m !== 'ideal' && m !== IDEAL_MODEL_ID);
        const anonymizationMapping = createModelAnonymizationMapping(evaluatedModels);
        logger.info(`Created anonymization mapping for ${evaluatedModels.length} models`);

        // Anonymize the WevalResult data for report generation
        const anonymizedResultData = anonymizeWevalResultData(resultData, anonymizationMapping);
        
        // Create a reverse mapping from system prompt index to anonymized ID
    const sysIndexToAnonymizedId = new Map<number, string>();
    for (const [anonymizedId, realIndex] of anonymizationMapping.sysToReal.entries()) {
        if (typeof realIndex === 'number') {
            sysIndexToAnonymizedId.set(realIndex, anonymizedId);
        }
    }
    
    // Create a reverse mapping from temperature to anonymized ID
    const tempToAnonymizedId = new Map<number, string>();
    for (const [anonymizedId, realTemp] of anonymizationMapping.tempToReal.entries()) {
        if (typeof realTemp === 'number') {
            tempToAnonymizedId.set(realTemp, anonymizedId);
        }
    }
    
    const markdownReport = generateMarkdownReportAnonymized(anonymizedResultData, MAX_CHARS, sysIndexToAnonymizedId, tempToAnonymizedId);
        
        if (markdownReport.length > MAX_CHARS + 100) { 
            logger.warn(`Markdown report was truncated to ~${markdownReport.length} characters for summary generation.`);
        }

        // Prepare anonymized model references for the system prompt
        const anonymizedModelRefs: AnonymizedModelReference[] = evaluatedModels.map(modelId => {
            const anon = anonymizationMapping.realToAnonymized.get(modelId);
            if (!anon) throw new Error(`Missing anonymization data for model: ${modelId}`);
            
            return {
                maker: anon.maker,
                model: anon.model,
                sys: anon.sys,
                temp: anon.temp,
            };
        });

        // Generate the system prompt
        const systemPrompt = generateSystemPrompt(anonymizedModelRefs);

        // DEBUG: Log anonymization results
        logger.info(`=== ANONYMIZATION DEBUG ===`);
        logger.info(`Anonymized report length: ${markdownReport.length} chars`);
        logger.info(`Anonymized model count: ${anonymizedModelRefs.length}`);
        logger.info(`Sample anonymized models: ${anonymizedModelRefs.slice(0, 3).map(m => `${m.maker}_${m.model}${m.sys ? `_${m.sys}` : ''}${m.temp ? `_${m.temp}` : ''}`).join(', ')}`);

        const userMessage = '=== THE REPORT ===\n\n' + markdownReport;
        const summaryText = await getModelResponse({
            modelId: SUMMARIZER_MODEL_ID,
            messages: [{ role: 'user', content: userMessage }],
            systemPrompt: systemPrompt,
            temperature: 0.1,
            maxTokens: 30000,
            useCache: true,
        });

        // DEBUG: Log LLM response
        logger.info(`=== LLM OUTPUT DEBUG ===`);
        logger.info(`LLM response length: ${summaryText?.length || 0} chars`);
        if (summaryText) {
            logger.info(`Sample of LLM response (first 1000 chars): ${summaryText.substring(0, 1000)}...`);
            logger.info('--------------------------------');
            logger.info(`Sample of LLM response (last 2000 chars): ${summaryText.substring(summaryText.length - 2000)}...`);
        }

        if (!summaryText || summaryText.trim() === '') {
            const errorMessage = `Summarizer model returned an empty response.`;
            logger.error(errorMessage);
            return { error: errorMessage };
        }

        // Parse structured insights from the response
        const structuredInsights = parseStructuredSummary(summaryText, anonymizationMapping);
        const isStructured = structuredInsights !== null;

        if (isStructured) {
            logger.info(`Executive summary generated successfully with structured format.`);
            if (structuredInsights?.autoTags) {
                logger.info(`Identified auto-tags: ${structuredInsights.autoTags.join(', ')}`);
            }
            if (structuredInsights?.grades) {
                const gradedModels = structuredInsights.grades.map(g => g.modelId);
                logger.info(`Grades provided for models: ${gradedModels.join(', ')}`);
                
                // Create list of expected base models (deduplicated from all variants)
                const expectedBaseModels = new Set<string>();
                for (const modelId of evaluatedModels) {
                    const parsed = parseModelIdForDisplay(modelId);
                    expectedBaseModels.add(parsed.baseId);
                }
                
                const expectedBaseModelsList = Array.from(expectedBaseModels);
                const missingGrades = expectedBaseModelsList.filter(expectedBaseId => 
                    !gradedModels.some(gradedId => gradedId === expectedBaseId)
                );

                if (missingGrades.length > 0) {
                    logger.warn(`Missing grades for base models: ${missingGrades.join(', ')}`);
                } else {
                    logger.info(`✓ All expected base models received grades (${expectedBaseModelsList.length} total)`);
                }
            } else {
                logger.warn(`No model grades found in structured summary.`);
            }
        } else {
            logger.warn(`Executive summary generated but failed to parse structured format, falling back to raw content.`);
        }
        
        return {
            modelId: SUMMARIZER_MODEL_ID,
            content: summaryText, // Keep the raw response with ref tags for now
            structured: structuredInsights || undefined,
            isStructured: isStructured,
        };

    } catch (summaryError: any) {
        const errorMessage = `An error occurred during executive summary generation: ${summaryError.message}`;
        logger.error(errorMessage);
        return { error: errorMessage };
    }
}

 