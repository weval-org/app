import { LLMApiCallOptions, LLMApiCallResult, StreamChunk } from './types';

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

class OpenRouterModuleClient {
  async makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResult> {
    // Extract modelName from modelId (format: "openrouter:meta-llama/llama-3.1-8b-instruct:free")
    const modelName = options.modelId.split(':').slice(1).join(':') || options.modelId;
    const { messages, systemPrompt, temperature, maxTokens, timeout = 120000 } = options;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return { responseText: '', error: 'OpenRouter API key not found. Please set OPENROUTER_API_KEY environment variable.' };
    }

    let finalMessagesPayload: any[] = [...(messages || [])];
    if (systemPrompt && !finalMessagesPayload.find(m => m.role === 'system')) {
      finalMessagesPayload.unshift({ role: "system", content: systemPrompt });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelName, 
          messages: finalMessagesPayload,
          temperature: temperature ?? 0.7, 
          max_tokens: maxTokens,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`OpenRouter API Error: ${response.status} ${response.statusText}`, errorBody);
        return { responseText: '', error: `OpenRouter API Error: ${response.status} ${response.statusText}. Details: ${errorBody}` };
      }

      const jsonResponse = await response.json() as any;
      const responseText = jsonResponse.choices?.[0]?.message?.content || '';
      
      if (!responseText && jsonResponse.error) {
        console.error('OpenRouter API Error in response:', jsonResponse.error);
        return { responseText: '', error: `OpenRouter Error: ${jsonResponse.error.message || JSON.stringify(jsonResponse.error)}` };
      }
      
      return { responseText };

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { responseText: '', error: `OpenRouter API request timed out after ${timeout}ms` };
      }
      console.error('Failed to make OpenRouter API call:', error);
      return { responseText: '', error: `Network or other error calling OpenRouter: ${error.message}` };
    }
  }

  async *streamApiCall(options: LLMApiCallOptions): AsyncGenerator<StreamChunk, void, undefined> {
    // Extract modelName from modelId (format: "openrouter:meta-llama/llama-3.1-8b-instruct:free")
    const modelName = options.modelId.split(':').slice(1).join(':') || options.modelId;
    const { messages, systemPrompt, temperature, maxTokens, timeout = 120000 } = options;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      yield { type: 'error', error: 'OpenRouter API key not found. Please set OPENROUTER_API_KEY environment variable.' };
      return;
    }

    let finalMessagesPayload: any[] = [...(messages || [])];
    if (systemPrompt && !finalMessagesPayload.find(m => m.role === 'system')) {
      finalMessagesPayload.unshift({ role: "system", content: systemPrompt });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          messages: finalMessagesPayload,
          temperature: temperature ?? 0.7,
          max_tokens: maxTokens,
          stream: true
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`OpenRouter Streaming API Error: ${response.status} ${response.statusText}`, errorBody);
        yield { type: 'error', error: `OpenRouter Streaming API Error: ${response.status} ${response.statusText}. Details: ${errorBody}` };
        return;
      }

      if (!response.body) {
        yield { type: 'error', error: 'Response body is null for OpenRouter streaming call.' };
        return;
      }

      const reader = (response.body as any).getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        
        let eolIndex;
        while ((eolIndex = buffer.indexOf('\n\n')) !== -1) {
            const line = buffer.substring(0, eolIndex).trim();
            buffer = buffer.substring(eolIndex + 2);

            if (line.startsWith("data: ")) {
                const dataContent = line.substring("data: ".length);
                if (dataContent === "[DONE]") {
                    return; 
                }
                try {
                    const parsed = JSON.parse(dataContent);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        yield { type: 'content', content };
                    }
                } catch (e:any) {
                    console.warn('Error parsing OpenRouter stream data chunk:', dataContent, e.message);
                }
            }
        }
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        yield { type: 'error', error: `OpenRouter stream request timed out after ${timeout}ms` };
      } else {
        console.error('Failed to make OpenRouter streaming API call:', error);
        yield { type: 'error', error: `Network or other error streaming from OpenRouter: ${error.message}` };
      }
    }
  }
}

export { OpenRouterModuleClient }; 