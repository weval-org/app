import { NextResponse } from 'next/server';
import { getResultByFileName } from '@/lib/storageService';
import { WevalResult } from '@/types/shared';

export const dynamic = 'force-dynamic'; // defaults to auto

// Helper function to parse our model ID into their schema's format
function parseModelId(wevalModelId: string) {
    // e.g., openrouter:deepseek/deepseek-r1 -> { family: 'deepseek', name: 'deepseek-r1' }
    // e.g., openai:gpt-4o-mini -> { family: 'gpt', name: 'gpt-4o-mini' }
    const parts = wevalModelId.split(':');
    let provider = 'unknown';
    let modelName = wevalModelId;

    if (parts.length > 1) {
        provider = parts[0];
        modelName = parts.slice(1).join(':');
    }

    let family = provider;
    // Heuristics to map family
    if (modelName.toLowerCase().includes('llama')) family = 'Llama';
    if (modelName.toLowerCase().includes('mistral')) family = 'Mistral';
    if (modelName.toLowerCase().includes('gemma')) family = 'gemma';
    if (provider.toLowerCase().includes('openai') || modelName.toLowerCase().includes('gpt')) family = 'gpt';
    if (provider.toLowerCase().includes('anthropic') || modelName.toLowerCase().includes('claude')) family = 'claude';
    if (modelName.toLowerCase().includes('qwen')) family = 'Qwen';
    
    // Check if the deduced family is in their enum, otherwise default.
    const validFamilies = ['Llama', 'Mistral', 'OLMo', 'gemma', 'gpt', 'palm', 'claude', 'falcon', 'Qwen'];
    if (!validFamilies.includes(family)) {
        // A simple fallback
        family = provider;
    }

    return {
        name: modelName,
        family: family,
    };
}

// Helper to determine if a tag indicates a "risk"
function getTagInterpretation(tag: string): 'capability' | 'risk' {
    const riskKeywords = ['bias', 'hallucination', 'toxicity', 'jailbreak', 'harm', 'adversarial'];
    if (riskKeywords.some(keyword => tag.toLowerCase().includes(keyword))) {
        return 'risk';
    }
    return 'capability';
}

// The translation function
function transformWevalResult(wevalResult: WevalResult) {
    const flattenedResults = [];

    for (const prompt of wevalResult.config.prompts) {
        for (const modelId of wevalResult.effectiveModels) {
            if (modelId === 'ideal') continue; // Skip the ideal response

            const responseText = wevalResult.allFinalAssistantResponses?.[prompt.id]?.[modelId];
            if (!responseText) continue; // Skip if no response exists

            const coverageResult = wevalResult.evaluationResults?.llmCoverageScores?.[prompt.id]?.[modelId];
            const avgCoverageScore = coverageResult?.avgCoverageExtent ?? 0;

            const modelInfo = parseModelId(modelId);

            const result = {
                schema_version: '0.0.1-weval-transformed',
                evaluation_id: `${wevalResult.configId}/${wevalResult.runLabel}/${wevalResult.timestamp}/${prompt.id}/${modelId}`,
                model: {
                    model_info: {
                        name: modelInfo.name,
                        family: modelInfo.family,
                    },
                    // We don't have this detailed data, so we provide what we can
                    configuration: {
                        context_window: null, // Not tracked
                        hf_path: modelInfo.family === 'hf' ? modelInfo.name : null, // Best guess
                    },
                    inference_settings: {
                        // We do have some of this
                        quantization: { bit_precision: 'none', method: 'None' }, // Assuming no quantization
                        generation_args: {
                            temperature: prompt.temperature ?? wevalResult.config.temperature ?? null,
                        },
                    },
                    weval_model_id: modelId, // Add our precise ID for traceability
                },
                prompt_config: {
                    prompt_class: 'OpenEnded', // Our prompts are generally open-ended
                    // we don't have their detailed dimension structure
                    dimensions: null, 
                    weval_prompt_id: prompt.id,
                },
                instance: {
                    task_type: 'generation',
                    raw_input: prompt.messages, // We provide the full message history
                    language: 'en', // Assuming English for now
                    sample_identifier: { // We don't have this, so we construct a placeholder
                        dataset_name: wevalResult.configId,
                        hf_repo: 'weval-org/configs',
                        hf_split: 'custom',
                        hf_index: -1,
                    },
                },
                output: {
                    response: responseText,
                },
                evaluation: {
                    evaluation_method: {
                        method_name: 'weval-llm-coverage',
                        description: 'A score (0.0-1.0) generated by an LLM judge evaluating the response against a rubric of criteria.',
                    },
                    ground_truth: prompt.idealResponse || '', // Their schema wants a string
                    score: avgCoverageScore,
                },
                weval_tags: (wevalResult.config.tags || []).map(tag => ({
                    name: tag,
                    type: getTagInterpretation(tag), // 'capability' or 'risk'
                }))
            };

            flattenedResults.push(result);
        }
    }
    return flattenedResults;
}


export async function GET(
    request: Request,
    { params }: { params: { configId: string, runLabel: string, timestamp: string } }
) {
    const { configId, runLabel, timestamp } = params;
    
    if (!configId || !runLabel || !timestamp) {
        return NextResponse.json({ error: 'Config ID, Run Label, and Timestamp are required.' }, { status: 400 });
    }
    
    const fileName = `${runLabel}_${timestamp}_comparison.json`;

    try {
        const resultData: WevalResult | null = await getResultByFileName(configId, fileName);

        if (!resultData) {
            return NextResponse.json({ error: `Evaluation run not found for ${configId}/${runLabel}/${timestamp}` }, { status: 404 });
        }

        const transformedData = transformWevalResult(resultData);

        return NextResponse.json(transformedData);
    } catch (error: any) {
        console.error(`[API /evaluations/.../${fileName}] Error:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
