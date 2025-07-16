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
    ENHANCED_SCORING_GUIDANCE,
    GRADING_DIMENSIONS 
} from '../../lib/grading-criteria';

const SUMMARIZER_MODEL_ID = 'openrouter:google/gemini-2.5-flash';
const MAX_CHARS = 400000; // ~130k tokens

type Logger = ReturnType<typeof getConfig>['logger'];

export function parseStructuredSummary(content: string): StructuredInsights | null {
    try {
        const keyFindings: string[] = [];
        const strengths: string[] = [];
        const weaknesses: string[] = [];
        const patterns: string[] = [];
        const grades: ModelGrades[] = [];

        // Extract key findings
        const keyFindingMatches = content.match(/<key_finding>(.*?)<\/key_finding>/gs);
        if (keyFindingMatches) {
            keyFindingMatches.forEach(match => {
                const finding = match.replace(/<\/?key_finding>/g, '').trim();
                if (finding) keyFindings.push(finding);
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
                const rawModelId = modelMatch && modelMatch[1].trim().replace(/[\[\(](?:sys|temp|tmp):.*/i, '').trim();
        
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
        if (keyFindings.length > 0 || strengths.length > 0 || weaknesses.length > 0 || patterns.length > 0 || grades.length > 0) {
            return {
                keyFindings,
                strengths,
                weaknesses,
                patterns,
                grades: grades.length > 0 ? grades : undefined
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
        const modelList = evaluatedModels.map(m => getModelDisplayLabel(m, {
            hideProvider: true,
            hideSystemPrompt: true,
            hideTemperature: true
        })).join(', ');
        const modelListForGrading = evaluatedModels.map(m => getModelDisplayLabel(m, {
            hideProvider: true,
            hideSystemPrompt: true,
            hideTemperature: true
        }));

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

CRITICAL: You MUST provide a grade block for each of these specific models: ${modelListForGrading.join(', ')}

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

The models being evaluated are: ${modelList}

Please provide multiple instances of each tag type as appropriate. Each tag should contain substantive, specific content rather than generic observations.`;

        const summaryText = await getModelResponse({
            modelId: SUMMARIZER_MODEL_ID,
            messages: [{ role: 'user', content: '=== THE REPORT ===\n\n' + markdownReport }],
            systemPrompt: systemPrompt,
            temperature: 0.1,
            maxTokens: 20000,
            useCache: true,
        });

        if (!summaryText || summaryText.trim() === '') {
            const errorMessage = `Summarizer model returned an empty response.`;
            logger.error(errorMessage);
            return { error: errorMessage };
        }

        // Parse structured insights from the response
        const structuredInsights = parseStructuredSummary(summaryText);
        const isStructured = structuredInsights !== null;

        if (isStructured) {
            logger.info(`Executive summary generated successfully with structured format.`);
            if (structuredInsights?.grades) {
                const gradedModels = structuredInsights.grades.map(g => g.modelId);
                logger.info(`Grades provided for models: ${gradedModels.join(', ')}`);
                
                // Check if we got grades for all expected models
                const expectedModels = modelListForGrading;
                const missingGrades = expectedModels.filter(expected => 
                    !gradedModels.some(graded => 
                        graded.toLowerCase().includes(expected.toLowerCase()) || 
                        expected.toLowerCase().includes(graded.toLowerCase())
                    )
                );
                if (missingGrades.length > 0) {
                    logger.warn(`Missing grades for models: ${missingGrades.join(', ')}`);
                }
            } else {
                logger.warn(`No model grades found in structured summary.`);
            }
        } else {
            logger.warn(`Executive summary generated but failed to parse structured format, falling back to raw content.`);
        }
        
        return {
            modelId: SUMMARIZER_MODEL_ID,
            content: summaryText,
            structured: structuredInsights || undefined,
            isStructured: isStructured,
        };

    } catch (summaryError: any) {
        const errorMessage = `An error occurred during executive summary generation: ${summaryError.message}`;
        logger.error(errorMessage);
        return { error: errorMessage };
    }
} 