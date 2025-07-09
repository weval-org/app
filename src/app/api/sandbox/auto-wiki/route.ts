import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getModelResponse } from '@/cli/services/llm-service';
import { checkForErrors } from '@/cli/utils/response-utils';
import { parseWevalConfigFromResponse } from '@/app/sandbox/utils/json-response-parser';
import { fromZodError } from 'zod-validation-error';

const WIKI_GENERATOR_MODEL = 'openrouter:google/gemini-2.5-flash-preview-05-20';
const MAX_TEXT_LENGTH = 300000; // A safe character limit for the context window

const autoWikiSchema = z.object({
  wikiUrl: z.string().url().refine(
    (url) => {
      try {
        const hostname = new URL(url).hostname;
        // Allow any language wikipedia, not just 'en'
        return hostname.endsWith('wikipedia.org');
      } catch {
        return false;
      }
    },
    { message: 'Please provide a valid Wikipedia URL.' }
  )
});

const getSystemPrompt = (articleTitle: string, articleSummary: string) => `
You are an expert AI Test Engineer specializing in creating robust evaluation blueprints for Large Language Models. Your task is to analyze the provided text from a Wikipedia article and generate a Weval blueprint structure.

The goal is NOT to simply summarize the article. Instead, you must identify the most "potent" and "testable" claims, nuances, and potential areas of confusion within the text. Create prompts that test a model's ability to reason accurately about this specific information.

**Article Title:** ${articleTitle}
**Summary:** ${articleSummary}

**Instructions:**
1.  **Generate a Blueprint:** Create a complete blueprint configuration as JSON.
2.  **Title and Description:** Write a clear \`title\` and \`description\`.
3.  **Create 5-10 Potent Prompts:** Generate between 5 and 10 distinct prompts. Each prompt should be a question or instruction that requires a deep and specific understanding of the provided text.
    *   **Focus on Nuance:** Design prompts that target subtle distinctions, potential ambiguities, or common misunderstandings related to the topic.
    *   **Avoid Trivial Questions:** Do not ask for simple fact retrieval. The answer should not be a single sentence that can be copied directly from the text.
    *   **Vary Prompt Style:** Use a mix of direct questions, requests for explanation, and scenario-based tests.
4.  **Self-Contained Prompts (CRITICAL):**
    *   **The generated prompts must NOT refer to the source article.** They must be standalone questions that test a model's knowledge on the topic.
    *   **Bad Example:** "According to the article, why did the company fail?"
    *   **Good Example:** "What were the primary reasons for the failure of the company 'Global MegaCorp' in 2023, and what role did its CEO play?"
5.  **Define 'points' Criteria (CRITICAL):**
    *   **Be Specific and Self-Contained:** Each criterion must be a clear, fully-qualified statement that can be understood and judged without needing to re-read the original prompt. Imagine a "blind" judge who only sees the model's response and the criterion.
    *   **Include Both Positive and Negative Criteria:** Use positive statements to describe both what responses should include AND what they should avoid. For negative criteria, phrase them as "does not..." or "avoids..." statements.
    *   For example, instead of "Mentions the three branches," write "States that the three branches of government are the legislative, executive, and judicial branches."
6.  **JSON Structure Format:**
    *   \`title\`: string - blueprint title based on the article
    *   \`description\`: string - blueprint description
    *   \`models\`: array of strings - can be empty []
    *   \`prompts\`: array of prompt objects with:
        - \`id\`: unique identifier string
        - \`promptText\`: the actual prompt/question string
        - \`idealResponse\`: optional ideal response string
        - \`points\`: array of "should" criteria (strings)
7.  **Output Format:**
    *   You MUST wrap your JSON output within \`<JSON>\` and \`</JSON>\` tags.
    *   Do NOT use markdown code fences.

**Example of a Potent Prompt:**

If the article is about "Stoicism", a weak prompt would be "What is Stoicism?".
A potent prompt would be: "Explain the Stoic concept of 'apatheia' and how it differs from the modern definition of 'apathy'."
*   **points:**
    *   - "Defines apatheia as a state of being free from emotional disturbance, achieved through virtue and reason"
    *   - "Contrasts apatheia with the modern definition of apathy, which implies a lack of care or interest"
    *   - "Does not equate the Stoic concept of apatheia with being emotionless or robotic"

Now, analyze the following article text and generate the complete blueprint structure as JSON.
`;

// Function to extract the article title and language from a Wikipedia URL
function extractWikipediaInfo(url: string): { title: string; lang: string } | null {
  try {
    const urlObject = new URL(url);
    const hostnameParts = urlObject.hostname.split('.');
    
    let lang = 'en'; // Default to English
    // Handles subdomains like `en.wikipedia.org`
    if (hostnameParts.length >= 3 && hostnameParts[1] === 'wikipedia' && hostnameParts[2] === 'org') {
      lang = hostnameParts[0];
    }

    const pathParts = urlObject.pathname.split('/');
    const wikiIndex = pathParts.findIndex(part => part === 'wiki');
    
    if (wikiIndex !== -1 && wikiIndex + 1 < pathParts.length) {
      const title = decodeURIComponent(pathParts.slice(wikiIndex + 1).join('/'));
      return { title, lang };
    }
    
    return null;
  } catch (e) {
    console.error('Invalid URL:', e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Dynamically import ESM modules
    const wtfModule = await import('wtf_wikipedia');
    const wtf = wtfModule.default;
    const wtfPluginSummary = (await import('wtf-plugin-summary')).default;
    wtf.extend(wtfPluginSummary);

    const body = await req.json();

    const validation = autoWikiSchema.safeParse(body);
    if (!validation.success) {
      const friendlyError = fromZodError(validation.error);
      return NextResponse.json({ error: friendlyError.message }, { status: 400 });
    }

    const { wikiUrl } = validation.data;
    const wikiInfo = extractWikipediaInfo(wikiUrl);

    if (!wikiInfo) {
      return NextResponse.json({ error: 'Could not extract a valid Wikipedia article title from the URL.' }, { status: 400 });
    }
    
    const { title: articleTitle, lang } = wikiInfo;

    // URL-encode forward slashes in the title to prevent wtf_wikipedia from treating it as a path
    const encodedArticleTitle = articleTitle.replace(/\//g, '%2F');

    // 1. Fetch and parse the wikipedia article
    let doc = await wtf.fetch(encodedArticleTitle, { lang: lang });
    if (!doc) {
      return NextResponse.json({ error: `Could not find or parse the Wikipedia page for "${articleTitle}".` }, { status: 404 });
    }
    
    // wtf.fetch can return an array if it follows redirects, take the last one.
    if (Array.isArray(doc)) {
      doc = doc[doc.length - 1];
    }

    const articleText = doc.text();
    const articleSummary = (doc as any).summary() || 'No summary available.';
    const title = doc.title() || articleTitle;

    if (!articleText || articleText.length < 100) {
        return NextResponse.json({ error: 'The article content is too short to generate a meaningful blueprint.' }, { status: 400 });
    }

    let truncatedText = articleText;
    const wasTruncated = articleText.length > MAX_TEXT_LENGTH;
    if (wasTruncated) {
        truncatedText = articleText.substring(0, MAX_TEXT_LENGTH);
    }

    // 2. Prepare the request for the LLM
    const systemPrompt = getSystemPrompt(title, articleSummary);
    
    // 3. Call the LLM to generate the blueprint
    const generatedYaml = await getModelResponse({
        modelId: WIKI_GENERATOR_MODEL,
        messages: [{ role: 'user', content: truncatedText }],
        systemPrompt: systemPrompt,
        temperature: 0.1,
        useCache: false,
        maxTokens: 5000
    });

    if (checkForErrors(generatedYaml)) {
        throw new Error(`The YAML generation model returned an error: ${generatedYaml}`);
    }

         const configParseResult = await parseWevalConfigFromResponse(generatedYaml, {
         modelId: WIKI_GENERATOR_MODEL
     });

     return NextResponse.json({ 
         yaml: configParseResult.yaml, 
         truncated: wasTruncated, 
         sanitized: configParseResult.sanitized,
         validationError: configParseResult.validationError
     });

  } catch (error: any) {
    console.error('[Auto-Wiki Error]', error);
    return NextResponse.json({ error: 'An unexpected error occurred.', details: error.message }, { status: 500 });
  }
}