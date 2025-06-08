import { LLMClient, LLMApiCallOptions, LLMApiCallResponse, LLMStreamApiCallOptions, StreamChunk } from './types';

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

class OpenRouterModuleClient implements LLMClient {
  async makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResponse> {
    const { modelName, prompt, systemPrompt, temperature, maxTokens, messages: optionMessages } = options;
    const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return { responseText: '', error: 'OpenRouter API key not found. Please set OPENROUTER_API_KEY environment variable.' };
    }

    let finalMessagesPayload: any[];

    if (optionMessages && optionMessages.length > 0) {
      let tempMessages = [...optionMessages];
      if (systemPrompt && !tempMessages.find(m => m.role === 'system')) {
        tempMessages.unshift({ role: "system", content: systemPrompt });
      }
      finalMessagesPayload = tempMessages;
    } else if (prompt) {
      finalMessagesPayload = [];
      if (systemPrompt) {
        finalMessagesPayload.push({ role: "system", content: systemPrompt });
      }
      finalMessagesPayload.push({ role: "user", content: prompt });
    } else {
      return { responseText: '', error: 'No valid prompt or messages provided to OpenRouter client.' };
    }

    try {
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
        })
      });

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
      console.error('Failed to make OpenRouter API call:', error);
      return { responseText: '', error: `Network or other error calling OpenRouter: ${error.message}` };
    }
  }

  async *streamApiCall(options: LLMStreamApiCallOptions): AsyncGenerator<StreamChunk, void, undefined> {
    const { modelName, prompt, systemPrompt, temperature, maxTokens, messages: optionMessages } = options;
    const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      yield { type: 'error', error: 'OpenRouter API key not found. Please set OPENROUTER_API_KEY environment variable.' };
      return;
    }

    let finalMessagesPayload: any[];

    if (optionMessages && optionMessages.length > 0) {
      let tempMessages = [...optionMessages];
      if (systemPrompt && !tempMessages.find(m => m.role === 'system')) {
        tempMessages.unshift({ role: "system", content: systemPrompt });
      }
      finalMessagesPayload = tempMessages;
    } else if (prompt) {
      finalMessagesPayload = [];
      if (systemPrompt) {
        finalMessagesPayload.push({ role: "system", content: systemPrompt });
      }
      finalMessagesPayload.push({ role: "user", content: prompt });
    } else {
      yield { type: 'error', error: 'No valid prompt or messages provided to OpenRouter client for streaming.' };
      return;
    }

    try {
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
        })
      });

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
      console.error('Failed to make OpenRouter streaming API call:', error);
      yield { type: 'error', error: `Network or other error streaming from OpenRouter: ${error.message}` };
    }
  }
}

export { OpenRouterModuleClient }; 