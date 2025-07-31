import { WevalResult, ExecutiveSummary, StructuredInsights, ModelGrades } from '@/types/shared';
import { generateMarkdownReport } from '../../app/utils/markdownGenerator';
import { getModelResponse } from './llm-service';
import { getConfig } from '../config';
import { getModelDisplayLabel, parseEffectiveModelId } from '../../app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '../../app/utils/calculationUtils';
import { parseGradeContent, extractScore } from './executive-summary-service';
import { generateSystemPromptV2, AnonymizedModelReference } from './executive-summary-prompt-v2';
import { TOPICS } from '../../lib/topics';

const SUMMARIZER_MODEL_ID = 'openrouter:google/gemini-2.5-flash';
const MAX_CHARS = 400000; // ~130k tokens

type Logger = ReturnType<typeof getConfig>['logger'];

// V2 Anonymization System with Opaque IDs
export interface AnonymizedModelData {
    realId: string;
    maker: string;
    model: string;
    sys?: string;
    temp?: string;
}

export interface ModelAnonymizationMappingV2 {
    realToAnonymized: Map<string, AnonymizedModelData>;
    anonymizedToReal: Map<string, string>;
    // Reverse lookup maps for individual components
    makerToReal: Map<string, string>;
    modelToReal: Map<string, string>;
    sysToReal: Map<string, string | number>;
    tempToReal: Map<string, number>;
}

/**
 * Creates deterministic but opaque IDs for makers, models, systems, and temperatures.
 * Uses high numbers to avoid confusion with actual values.
 */
export function createModelAnonymizationMappingV2(modelIds: string[]): ModelAnonymizationMappingV2 {
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
        const parsed = parseEffectiveModelId(modelId);
        
        // Extract maker
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
        const parsed = parseEffectiveModelId(modelId);
        
        // Find maker
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
export function anonymizeWevalResultDataV2(
    resultData: WevalResult,
    mapping: ModelAnonymizationMappingV2
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
export function deanonymizeModelNamesInTextV2(
    text: string, 
    mapping: ModelAnonymizationMappingV2
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
        } else if (attrs.maker) {
            // Maker-only reference
            return generateMakerReference(attrs.maker, mapping);
        } else if (attrs.sys) {
            // System prompt reference
            return generateSysReference(attrs.sys, mapping);
        } else if (attrs.temp) {
            // Temperature reference
            return generateTempReference(attrs.temp, mapping);
        }

        // If we can't parse it, return unchanged
        return match;
    });

    return result;
}

function generateVariantLink(attrs: Record<string, string>, mapping: ModelAnonymizationMappingV2): string {
    // Find the real model ID that matches these attributes
    for (const [realId, anon] of mapping.realToAnonymized.entries()) {
        if (anon.maker === attrs.maker && anon.model === attrs.model && 
            anon.sys === attrs.sys && anon.temp === attrs.temp) {
            
            // Generate a user-friendly display name
            const parsed = parseEffectiveModelId(realId);
            let displayName = getModelDisplayLabel(parsed.baseId, { 
                prettifyModelName: true, 
                hideProvider: true, 
                hideModelMaker: true 
            });
            
            // Add variant info
            const variantParts: string[] = [];
            if (parsed.systemPromptIndex !== undefined) {
                variantParts.push(`sys:${parsed.systemPromptIndex}`);
            }
            if (parsed.temperature !== undefined) {
                variantParts.push(`temp:${parsed.temperature}`);
            }
            
            if (variantParts.length > 0) {
                displayName += ` (${variantParts.join(', ')})`;
            }
            
            return `[${displayName}](#model-perf:${realId})`;
        }
    }
    
    return `<ref ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} />`;
}

function generateBaseModelLink(attrs: Record<string, string>, mapping: ModelAnonymizationMappingV2): string {
    // Find any real model ID that matches maker and model (ignoring variants)
    for (const [realId, anon] of mapping.realToAnonymized.entries()) {
        if (anon.maker === attrs.maker && anon.model === attrs.model) {
            const parsed = parseEffectiveModelId(realId);
            const displayName = getModelDisplayLabel(parsed.baseId, { 
                prettifyModelName: false, // Keep original casing
                hideProvider: true, 
                hideModelMaker: true 
            });
            
            return `[${displayName}](#model-perf:${parsed.baseId})`;
        }
    }
    
    return `<ref ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} />`;
}

function generateMakerReference(makerId: string, mapping: ModelAnonymizationMappingV2): string {
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
            default: return realMaker.charAt(0) + realMaker.slice(1).toLowerCase();
        }
    }
    return `<ref maker="${makerId}" />`;
}

function generateSysReference(sysId: string, mapping: ModelAnonymizationMappingV2): string {
    const realSys = mapping.sysToReal.get(sysId);
    if (realSys !== undefined) {
        return `sys:${realSys}`;
    }
    return `<ref sys="${sysId}" />`;
}

function generateTempReference(tempId: string, mapping: ModelAnonymizationMappingV2): string {
    const realTemp = mapping.tempToReal.get(tempId);
    if (realTemp !== undefined) {
        return `temp:${realTemp}`;
    }
    return `<ref temp="${tempId}" />`;
}

/**
 * Parses structured summary content with the new ref tag system.
 */
export function parseStructuredSummaryV2(
    content: string, 
    mapping: ModelAnonymizationMappingV2
): StructuredInsights | null {
    try {
        const keyFindings: string[] = [];
        const strengths: string[] = [];
        const weaknesses: string[] = [];
        const patterns: string[] = [];
        const grades: ModelGrades[] = [];
        const autoTags: string[] = [];

        // First, deanonymize all ref tags in qualitative sections
        const deanonymizedContent = deanonymizeModelNamesInTextV2(content, mapping);

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
                        console.warn(`[ExecutiveSummaryV2] Non-canonical auto-tag found: "${tag}"`);
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

        // Extract grades using the new attribute format
        const gradeMatches = content.match(/<grade\s+([^>]+)>(.*?)<\/grade>/gs);
        if (gradeMatches) {
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

                // Find the real model ID that matches these attributes
                const realModelId = findRealModelIdFromAttributes(attrs, mapping);
                if (realModelId && gradeContent) {
                    const gradeData = parseGradeContent(gradeContent);
                    if (gradeData) {
                        grades.push({ modelId: realModelId, grades: gradeData });
                    }
                }
            });
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
        console.error('Error parsing structured summary V2:', error);
        return null;
    }
}

function findRealModelIdFromAttributes(
    attrs: Record<string, string>, 
    mapping: ModelAnonymizationMappingV2
): string | null {
    // Need at least maker and model for a valid grade
    if (!attrs.maker || !attrs.model) {
        return null;
    }

    // Find matching real model ID
    for (const [realId, anon] of mapping.realToAnonymized.entries()) {
        const matches = anon.maker === attrs.maker && 
                       anon.model === attrs.model &&
                       anon.sys === attrs.sys &&
                       anon.temp === attrs.temp;
        
        if (matches) {
            return realId;
        }
    }

    return null;
}

/**
 * Main function to generate executive summary using the V2 system.
 */
export async function generateExecutiveSummaryV2(
    resultData: WevalResult,
    logger: Logger,
): Promise<ExecutiveSummary | { error: string }> {
    try {
        logger.info(`Generating executive summary V2 with model: ${SUMMARIZER_MODEL_ID}`);

        // Create anonymization mapping
        const evaluatedModels = resultData.effectiveModels.filter(m => m !== 'ideal' && m !== IDEAL_MODEL_ID);
        const anonymizationMapping = createModelAnonymizationMappingV2(evaluatedModels);
        logger.info(`Created anonymization mapping for ${evaluatedModels.length} models`);

        // Anonymize the WevalResult data for report generation
        const anonymizedResultData = anonymizeWevalResultDataV2(resultData, anonymizationMapping);
        
        const markdownReport = generateMarkdownReport(anonymizedResultData, MAX_CHARS);
        
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
        const systemPrompt = generateSystemPromptV2(anonymizedModelRefs);

        // DEBUG: Log anonymization results
        logger.info(`=== ANONYMIZATION DEBUG V2 ===`);
        logger.info(`Anonymized report length: ${markdownReport.length} chars`);
        logger.info(`Anonymized model count: ${anonymizedModelRefs.length}`);
        logger.info(`Sample anonymized models: ${anonymizedModelRefs.slice(0, 3).map(m => `${m.maker}_${m.model}${m.sys ? `_${m.sys}` : ''}${m.temp ? `_${m.temp}` : ''}`).join(', ')}`);

        const userMessage = '=== THE REPORT ===\n\n' + markdownReport;
        const summaryText = await getModelResponse({
            modelId: SUMMARIZER_MODEL_ID,
            messages: [{ role: 'user', content: userMessage }],
            systemPrompt: systemPrompt,
            temperature: 0.1,
            maxTokens: 20000,
            useCache: true,
        });

        // DEBUG: Log LLM response
        logger.info(`=== LLM OUTPUT DEBUG V2 ===`);
        logger.info(`LLM response length: ${summaryText?.length || 0} chars`);
        if (summaryText) {
            const sampleResponse = summaryText.substring(0, 1000);
            logger.info(`Sample of LLM response: ${sampleResponse}...`);
        }

        if (!summaryText || summaryText.trim() === '') {
            const errorMessage = `Summarizer model returned an empty response.`;
            logger.error(errorMessage);
            return { error: errorMessage };
        }

        // Parse structured insights from the response
        const structuredInsights = parseStructuredSummaryV2(summaryText, anonymizationMapping);
        const isStructured = structuredInsights !== null;

        if (isStructured) {
            logger.info(`Executive summary V2 generated successfully with structured format.`);
            if (structuredInsights?.autoTags) {
                logger.info(`Identified auto-tags: ${structuredInsights.autoTags.join(', ')}`);
            }
            if (structuredInsights?.grades) {
                const gradedModels = structuredInsights.grades.map(g => g.modelId);
                logger.info(`Grades provided for models: ${gradedModels.join(', ')}`);
                
                const missingGrades = evaluatedModels.filter(expected => 
                    !gradedModels.some(graded => graded === expected)
                );

                if (missingGrades.length > 0) {
                    logger.warn(`Missing grades for models: ${missingGrades.join(', ')}`);
                } else {
                    logger.info(`✓ All expected models received grades`);
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
        const errorMessage = `An error occurred during executive summary generation V2: ${summaryError.message}`;
        logger.error(errorMessage);
        return { error: errorMessage };
    }
}

 