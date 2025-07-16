import { WevalResult } from '@/types/shared';
import { generateMarkdownReport } from '../../app/utils/markdownGenerator';
import { getModelResponse } from './llm-service';
import { checkForErrors } from '../utils/response-utils';
import { getConfig } from '../config';

const SUMMARIZER_MODEL_ID = 'openrouter:google/gemini-2.5-flash';
const MAX_CHARS = 400000; // ~130k tokens

type Logger = ReturnType<typeof getConfig>['logger'];

export async function generateExecutiveSummary(
    resultData: WevalResult,
    logger: Logger,
): Promise<{ modelId: string; content: string } | { error: string }> {
    try {
        logger.info(`Generating executive summary with model: ${SUMMARIZER_MODEL_ID}`);

        const markdownReport = generateMarkdownReport(resultData, MAX_CHARS);
        
        if (markdownReport.length > MAX_CHARS + 100) { 
            logger.warn(`Markdown report was truncated to ~${markdownReport.length} characters for summary generation.`);
        }

        const systemPrompt = `You are an expert AI analyst. The following is a markdown report of a comprehensive evaluation run comparing multiple large language models on a specific set of tasks. Your goal is to synthesize this data and extract the most important, actionable insights for a human reader.

Please provide a summary that covers (these could each be h2 level headings followed by their content)
1.  **Overall Key Findings**: What are the 1-3 most important takeaways from this entire evaluation?
2.  **Model Strengths and Weaknesses**: Which models excelled and where? Which models struggled? Were there any surprising results? 
3.  **Interesting Patterns**: Did you notice any interesting patterns in the data? For example, did certain models cluster together in their responses? Was performance sensitive to temperature or system prompts? Any oddities or things people would find very potent, insightful or intriguing.

You should feel free to be highly specific, lending verbatim quotes or specific topics and how they've been handled by the various models. Provide it as a contiguous markdown piece for easy human consumption. Typically this should be something like:

===Example output===
## Key findings

* Example
* Example
* ...

## Model Strengths and Weaknesses

* **Example Model 1** behaved quite oddly and poorly, in that....
* Etc.

## Patterns

The following curious patterns were observed:

* ...
etc.

===/End Example output===`;

        const summaryText = await getModelResponse({
            modelId: SUMMARIZER_MODEL_ID,
            messages: [{ role: 'user', content: '=== THE REPORT ===\n\n' + markdownReport }],
            systemPrompt: systemPrompt,
            temperature: 0.1,
            useCache: false,
        });

        if (!summaryText || summaryText.trim() === '') {
            const errorMessage = `Summarizer model returned an empty response.`;
            logger.error(errorMessage);
            return { error: errorMessage };
        }
        
        logger.info(`Executive summary generated successfully.`);
        return {
            modelId: SUMMARIZER_MODEL_ID,
            content: summaryText,
        };

    } catch (summaryError: any) {
        const errorMessage = `An error occurred during executive summary generation: ${summaryError.message}`;
        logger.error(errorMessage);
        return { error: errorMessage };
    }
} 