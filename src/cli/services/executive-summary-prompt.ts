import { TOPICS } from '../../lib/topics';
import {
  generateGradingCriteriaText,
  GRADING_INSTRUCTIONS,
  ENHANCED_SCORING_GUIDANCE,
  GRADING_DIMENSIONS,
} from '../../lib/grading-criteria';

export interface AnonymizedModelReference {
    maker: string;
    model: string;
    sys?: string;
    temp?: string;
}

export function generateSystemPrompt(anonymizedModels: AnonymizedModelReference[]): string {
    // Detect what permutations exist in the data
    const hasSysVariations = anonymizedModels.some(model => model.sys);
    const hasTempVariations = anonymizedModels.some(model => model.temp);
    
    // For grading purposes, deduplicate to unique maker+model combinations
    const uniqueBaseModels = new Map<string, AnonymizedModelReference>();
    anonymizedModels.forEach(model => {
        const baseKey = `${model.maker}|${model.model}`;
        if (!uniqueBaseModels.has(baseKey)) {
            uniqueBaseModels.set(baseKey, {
                maker: model.maker,
                model: model.model,
                // Don't include sys/temp for grading
            });
        }
    });
    
    const baseModelsForGrading = Array.from(uniqueBaseModels.values());
    
    // Create the list of models for grading instructions in exact XML format
    const gradingModelList = baseModelsForGrading
        .map(anon => {
            return `<grade maker="${anon.maker}" model="${anon.model}" dimension="DIMENSION_KEY">...</grade>`;
        })
        .join('\n');

    // Generate example individual grade blocks for each dimension
    const dimensionKeys = GRADING_DIMENSIONS.map(d => d.key);
    let exampleGradeBlocks = `For each model, you must provide individual grade blocks for each applicable dimension. Here's the format:\n\n`;
    
    // Show format for each dimension (base model only)
    dimensionKeys.forEach(key => {
        const exampleFormat = `<grade maker="..." model="..." dimension="${key}">`;
        
        exampleGradeBlocks += `${exampleFormat}\n`;
        exampleGradeBlocks += `REASONING: [Explain your assessment for this specific dimension]\n`;
        exampleGradeBlocks += `SCORE: X/10\n`;
        exampleGradeBlocks += `</grade>\n\n`;
    });

    return `You are an expert AI analyst. The following is a markdown report of a comprehensive evaluation run comparing multiple large language models on a specific set of tasks. Your goal is to synthesize this data and extract the most important, actionable insights for a human reader.

You must provide your analysis using specific XML-like tags to structure your response. This is a THREE-PART task:

=== PART 1: QUALITATIVE ANALYSIS ===

For this analysis section, when you refer to models, makers${hasSysVariations ? ', system prompts' : ''}${hasTempVariations ? ', or temperatures' : ''}, you MUST use the <ref /> tag format. Here are the rules:

• To refer to a MAKER: <ref maker="MK_XXXX" />
• To refer to a BASE MODEL: <ref maker="MK_XXXX" model="MD_YYYY" />
${hasSysVariations || hasTempVariations ? `• To refer to a SPECIFIC VARIANT: <ref maker="MK_XXXX" model="MD_YYYY"${hasSysVariations ? ' sys="S_ZZZZ"' : ''}${hasTempVariations ? ' temp="T_WWWW"' : ''} />` : ''}
${hasSysVariations ? '• To refer to just a SYSTEM PROMPT: <ref sys="S_ZZZZ" />' : ''}
${hasTempVariations ? '• To refer to just a TEMPERATURE: <ref temp="T_WWWW" />' : ''}
• To refer to a SPECIFIC PROMPT: <ref prompt="prompt-id" />

Use the following tags for your analysis:

For key findings (1-4 most important takeaways):
<key_finding>Your finding here with proper <ref /> tags</key_finding>

For model strengths (specific models that excelled and why):
<strength>Model X excelled at Y because...</strength>

For model weaknesses (specific models that struggled and why):
<weakness>Model Y struggled with Z because...</weakness>

For interesting patterns (clusters, temperature sensitivity, oddities, system prompt effects):
<pattern>Pattern description here</pattern>

=== PART 2: QUANTITATIVE GRADING ===

For this grading section, you MUST provide individual grade blocks for EVERY applicable dimension for EVERY BASE MODEL (maker+model combination). Grade the fundamental capabilities of each model, not specific configuration variants.

${exampleGradeBlocks}

Available dimensions (use these exact keys for the dimension attribute):
${dimensionKeys.map(key => `• ${key}: ${GRADING_DIMENSIONS.find(d => d.key === key)?.label}`).join('\n')}

CRITICAL GRADING INSTRUCTIONS:
• You MUST provide a separate <grade> block for each dimension that is applicable to this evaluation
• Grade BASE MODELS only (maker + model), not individual system prompt or temperature variants
• If a dimension is not relevant to the evaluation (e.g., "argumentation" in a pure factual retrieval task), you can either:
  a) Skip that dimension entirely, OR
  b) Include it with SCORE: N/A and explain why it's not applicable in the REASONING
• Each grade block must contain both REASONING (explaining your assessment) and SCORE (0-10 or N/A)
• Be thoughtful and specific in your reasoning - avoid generic explanations
• Scores should reflect genuine differences in performance, not cluster around 8-9
• Focus on the inherent capabilities of each model architecture, aggregating performance across all tested configurations

You MUST evaluate these base models using the EXACT maker+model combinations shown below:

${gradingModelList}

=== PART 3: TOPIC CLASSIFICATION ===

Finally, provide the main over-arching topics of this evaluation that will help users locate and get a quick picture of the evaluation (choose 3-8 from the provided list):
<topic>Chosen Topic</topic>

Here are the topics you MUST choose from for the <topic> tags:
=== TOPICS ===
${TOPICS.join(',\n')}
=== /END TOPICS ===

=== IMPORTANT ANALYSIS CONSIDERATIONS ===

- The anonymized model names give you clues about their relationships. Models with the same maker ID come from the same company.${hasSysVariations ? ' Models with the same sys ID use identical system prompts.' : ''}${hasTempVariations ? ' Models with the same temp ID use identical temperature settings.' : ''}
${hasSysVariations ? `- Pay close attention to the "System Prompt Strategy" section - this tells you whether the evaluation tested different system prompts, used a single global prompt, or used default model behavior
- When system prompt permutations were tested, consider whether performance differences might be attributable to prompting strategy rather than inherent model capabilities  
- Look for patterns related to system prompt effectiveness across different models
- Consider how the system prompt strategy might influence your interpretation of the results
- For grading, focus on the underlying model capabilities rather than prompt-specific performance` : '- Pay close attention to the "System Prompt Strategy" section for context about how models were configured'}

${generateGradingCriteriaText()}

${ENHANCED_SCORING_GUIDANCE}

${GRADING_INSTRUCTIONS}

=== FINAL IMPORTANT REQUIREMENTS ===
1. You MUST analyze ALL model variants that participated in this evaluation.${hasSysVariations || hasTempVariations ? ` Each model entry${hasSysVariations && hasTempVariations ? ' (including different system prompts and temperatures)' : hasSysVariations ? ' (including different system prompts)' : ' (including different temperatures)'} should be considered in your analysis.` : ''}
2. You MUST provide individual grade blocks for EVERY applicable dimension for EVERY BASE MODEL (maker+model only)—no exceptions.
3. Be highly specific, using verbatim quotes and specific examples from the evaluation.
4. Focus on actionable insights that would help someone choose between these models.
5. Each grade should be based on evidence from the evaluation data and include specific reasoning.
6. If a dimension is not applicable to the evaluation, either skip it or mark it as N/A with clear reasoning.
7. Grade the fundamental model capabilities, considering performance across all tested configurations but providing one grade per base model.
${hasSysVariations ? '8. Consider the system prompt strategy when interpreting performance differences—note if results might be influenced by prompting choices rather than model capabilities.' : ''}
${hasSysVariations ? '9.' : '8.'} For Part 1 (analysis), use <ref /> tags consistently. For Part 2 (grading), use individual grade blocks with reasoning for each applicable dimension.

Please provide multiple instances of each tag type as appropriate. Each tag should contain substantive, specific content rather than generic observations.`;
} 