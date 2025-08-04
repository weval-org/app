/**
 * @jest-environment node
 */
import { generateAllResponses } from './comparison-pipeline-service.non-stream';
import { getModelResponse } from './llm-service';
import { ComparisonConfig } from '../types/cli_types';
import { ConversationMessage } from '@/types/shared';

// Mock the LLM service
jest.mock('./llm-service', () => ({
  getModelResponse: jest.fn(),
  DEFAULT_TEMPERATURE: 0.7,
}));

const mockedGetModelResponse = getModelResponse as jest.MockedFunction<typeof getModelResponse>;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

function createConfig(modelId: string, numPrompts: number): ComparisonConfig {
  const prompts = Array.from({ length: numPrompts }, (_, i) => ({
    id: `p${i + 1}`,
    messages: [{ role: 'user', content: `Test prompt ${i + 1}` }] as ConversationMessage[],
  }));

  return {
    id: 'test-config',
    title: 'Test Config',
    models: [modelId],
    prompts,
    concurrency: 20, // High concurrency to test race conditions
  } as ComparisonConfig;
}

describe('generateAllResponses circuit breaker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not trip the breaker if failures are less than threshold', async () => {
    const config = createConfig('working-model', 5);
    mockedGetModelResponse.mockResolvedValue('Success response');

    const result = await generateAllResponses(config, mockLogger, false);

    expect(mockedGetModelResponse).toHaveBeenCalledTimes(5);
    expect(mockLogger.error).not.toHaveBeenCalledWith(expect.stringContaining('Circuit breaker'));
    expect(result.size).toBe(5);
  });

  it('should trip the breaker after 10 consecutive failures and auto-fail subsequent requests', async () => {
    const config = createConfig('failing-model', 12);
    mockedGetModelResponse.mockRejectedValue(new Error('API Error'));

    const result = await generateAllResponses(config, mockLogger, false);

    // With per-model concurrency limiting, should call API exactly 10 times before tripping
    expect(mockedGetModelResponse).toHaveBeenCalledTimes(10);
    
    // Check for the log message that the breaker was tripped
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Circuit breaker for 'failing-model' has been tripped after 10 consecutive failures."));

    // Check for auto-failing messages for the 11th and 12th prompts
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Circuit breaker for model 'failing-model' is open. Auto-failing this request."));
    
    // Count only the auto-fail warnings (not the failure counter warnings)
    const autoFailWarnings = (mockLogger.warn as jest.Mock).mock.calls.filter(call => 
      call[0].includes("Circuit breaker for model 'failing-model' is open")
    );
    expect(autoFailWarnings).toHaveLength(2);

    const p11Response = result.get('p11')?.modelResponses['failing-model[temp:0.7]'];
    const p12Response = result.get('p12')?.modelResponses['failing-model[temp:0.7]'];
    
    expect(p11Response?.errorMessage).toContain('Circuit breaker for model');
    expect(p12Response?.errorMessage).toContain('Circuit breaker for model');
  });

  it('should reset the failure counter after a successful response', async () => {
    const config = createConfig('intermittent-model', 15);
    
    let callCount = 0;
    mockedGetModelResponse.mockImplementation(() => {
      callCount++;
      // Fail first 5, then succeed on 6th, then fail again
      if (callCount <= 5 || callCount > 6) {
        throw new Error('API Error');
      }
      return Promise.resolve('Success response');
    });

    const result = await generateAllResponses(config, mockLogger, false);

    // Should call API for all 15 prompts (no breaker trip due to reset after success)
    expect(mockedGetModelResponse).toHaveBeenCalledTimes(15);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Successful response from 'intermittent-model' received. Resetting failure counter"));
    expect(result.size).toBe(15);
  });

  it('should handle multiple models independently', async () => {
    const config: ComparisonConfig = {
      id: 'test-config',
      title: 'Test Config',
      models: ['failing-model', 'working-model'],
      prompts: [
        { id: 'p1', messages: [{ role: 'user', content: 'Test prompt 1' }] as ConversationMessage[] },
        { id: 'p2', messages: [{ role: 'user', content: 'Test prompt 2' }] as ConversationMessage[] },
      ],
      concurrency: 20,
    } as ComparisonConfig;

    mockedGetModelResponse.mockImplementation(({ modelId }) => {
      if (modelId === 'failing-model') {
        throw new Error('API Error');
      }
      return Promise.resolve('Success response');
    });

    const result = await generateAllResponses(config, mockLogger, false);

    // Should call API 4 times total (2 prompts × 2 models)
    expect(mockedGetModelResponse).toHaveBeenCalledTimes(4);
    
    // Check auto-fail logs for the failing model - should be none since only 2 failures per model
    const autoFailWarnings = (mockLogger.warn as jest.Mock).mock.calls.filter(call => 
      call[0].includes("Circuit breaker for model 'failing-model' is open")
    );
    expect(autoFailWarnings).toHaveLength(0); // No auto-fails yet since only 2 failures per model
  });
}); 