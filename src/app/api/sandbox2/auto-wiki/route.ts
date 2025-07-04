import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getModelResponse } from '@/cli/services/llm-service';
import { checkForErrors } from '@/cli/utils/response-utils';
import { fromZodError } from 'zod-validation-error';
import * as yaml from 'js-yaml';

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
You are an expert AI Test Engineer specializing in creating robust evaluation blueprints for Large Language Models. Your task is to analyze the provided text from a Wikipedia article and generate a Weval blueprint in YAML format.

The goal is NOT to simply summarize the article. Instead, you must identify the most "potent" and "testable" claims, nuances, and potential areas of confusion within the text. Create prompts that test a model's ability to reason accurately about this specific information.

**Article Title:** ${articleTitle}
**Summary:** ${articleSummary}

**Instructions:**
1.  **Generate a Blueprint:** Create a complete YAML blueprint.
2.  **Title and Description:** Write a clear \`title\` and \`description\`.
3.  **Create 5-10 Potent Prompts:** Generate between 5 and 10 distinct prompts. Each prompt should be a question or instruction that requires a deep and specific understanding of the provided text.
    *   **Focus on Nuance:** Design prompts that target subtle distinctions, potential ambiguities, or common misunderstandings related to the topic.
    *   **Avoid Trivial Questions:** Do not ask for simple fact retrieval. The answer should not be a single sentence that can be copied directly from the text.
    *   **Vary Prompt Style:** Use a mix of direct questions, requests for explanation, and scenario-based tests.
4.  **Self-Contained Prompts (CRITICAL):**
    *   **The generated prompts must NOT refer to the source article.** They must be standalone questions that test a model's knowledge on the topic.
    *   **Bad Example:** "According to the article, why did the company fail?"
    *   **Good Example:** "What were the primary reasons for the failure of the company 'Global MegaCorp' in 2023, and what role did its CEO play?"
5.  **Define 'should' and 'should_not' Criteria (CRITICAL):**
    *   **Be Specific and Self-Contained:** Each criterion must be a clear, fully-qualified statement that can be understood and judged without needing to re-read the original prompt. Imagine a "blind" judge who only sees the model's response and the criterion.
    *   For example, instead of "Mentions the three branches," write "States that the three branches of government are the legislative, executive, and judicial branches."
6.  **Format and Quoting (CRITICAL):**
    *   The entire output must be a single, valid YAML code block.
    *   **You MUST enclose all string values in double quotes ("").** This applies to 'title', 'description', 'prompt', and every item in 'should' and 'should_not'.
    *   You MUST wrap your entire YAML output within \`<YAML>\` and \`</YAML>\` tags. DO NOT use markdown code fences (\`\`\`).

**Example of a Potent Prompt:**

If the article is about "Stoicism", a weak prompt would be "What is Stoicism?".
A potent prompt would be: "Explain the Stoic concept of 'apatheia' and how it differs from the modern definition of 'apathy'."
*   **should:**
    *   - "Defines apatheia as a state of being free from emotional disturbance, achieved through virtue and reason."
    *   - "Contrasts apatheia with the modern definition of apathy, which implies a lack of care or interest."
*   **should_not:**
    *   - "Equates the Stoic concept of apatheia with being emotionless or robotic."

Now, analyze the following article text and generate the YAML blueprint.
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

    const yamlRegex = /<YAML>([\s\S]*)<\/YAML>/;
    const match = generatedYaml.match(yamlRegex);

    if (!match || !match[1]) {
        throw new Error("The model did not return a valid YAML response within <YAML> tags.");
    }

    const cleanedYaml = match[1].trim();
    let finalYaml = cleanedYaml;
    let wasSanitized = false;
    
    try {
        const parsed = yaml.loadAll(cleanedYaml);
        if (parsed.filter(p => p !== null).length === 0) {
            throw new Error('Generated YAML is empty or invalid after parsing.');
        }
    } catch (e: any) {
        if (e instanceof yaml.YAMLException) {
            console.warn('[Auto-Wiki] Initial YAML parsing failed. Attempting self-correction.', e.message);

            // Attempt to self-correct the YAML by re-prompting the LLM
            const selfCorrectionSystemPrompt = `You are an expert YAML debugger. The user will provide you with a piece of YAML that has a syntax error, along with the error message. Your task is to fix the YAML and return only the corrected, valid YAML code block. Do not add any explanation, apologies, or surrounding text. Output only the raw, corrected YAML.`;
            
            const selfCorrectionUserPrompt = `The following YAML is invalid.\nError: ${e.message}\n\nInvalid YAML:\n${cleanedYaml}\n\nPlease provide the corrected YAML.`;

            const correctedYamlResponse = await getModelResponse({
                modelId: WIKI_GENERATOR_MODEL,
                messages: [{ role: 'user', content: selfCorrectionUserPrompt }],
                systemPrompt: selfCorrectionSystemPrompt,
                temperature: 0.0,
                useCache: false,
                maxTokens: 5000
            });

            if (checkForErrors(correctedYamlResponse)) {
                throw new Error(`The self-correction model returned an error: ${correctedYamlResponse}`);
            }
            
            // The model might wrap the corrected YAML in markdown fences, so we need to strip them.
            const markdownYamlRegex = /```(?:yaml\n)?([\s\S]*?)```/;
            const match = correctedYamlResponse.match(markdownYamlRegex);
            finalYaml = (match ? match[1] : correctedYamlResponse).trim();

            try {
                // Try parsing the corrected YAML
                const parsed = yaml.loadAll(finalYaml);
                if (parsed.filter(p => p !== null).length === 0) {
                    throw new Error('Self-corrected YAML is empty or invalid after parsing.');
                }
                console.log('[Auto-Wiki] Self-correction successful.');
                wasSanitized = true; // Use 'sanitized' flag to indicate correction happened
            } catch (e2: any) {
                // If correction fails, throw the original error along with the new one.
                console.error('[Auto-Wiki] Self-correction failed.', e2.message);
                throw new Error(`YAML generation failed and self-correction was unsuccessful. Original error: ${e.message}. Correction error: ${e2.message}`);
            }
        } else {
          // Re-throw other errors not related to YAML parsing
          throw e;
        }
    }

    return NextResponse.json({ yaml: finalYaml, truncated: wasTruncated, sanitized: wasSanitized });

  } catch (error: any) {
    console.error('[Auto-Wiki Error]', error);
    return NextResponse.json({ error: 'An unexpected error occurred.', details: error.message }, { status: 500 });
  }
}