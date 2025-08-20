import { jest } from '@jest/globals';
import { cloneRunCommand } from '../../commands/clone-run';
import * as storageService from '@/lib/storageService';
import * as runConfig from '@/cli/commands/run-config';
import * as pipeline from '@/cli/services/comparison-pipeline-service';
import * as llmService from '@/cli/services/llm-service';
import { getConfig } from '@/cli/config';
import * as blueprintService from '@/lib/blueprint-service';

jest.mock('@/lib/storageService');
jest.mock('@/cli/commands/run-config');
jest.mock('@/cli/services/comparison-pipeline-service');
jest.mock('@/cli/services/llm-service');
jest.mock('@/cli/config');
jest.mock('@/lib/blueprint-service');

const mockedStorage = storageService as jest.Mocked<typeof storageService>;
const mockedRunConfig = runConfig as jest.Mocked<typeof runConfig>;
const mockedPipeline = pipeline as jest.Mocked<typeof pipeline>;
const mockedLLM = llmService as jest.Mocked<typeof llmService>;
const mockedGetConfig = getConfig as jest.MockedFunction<typeof getConfig>;
const mockedBlueprint = blueprintService as jest.Mocked<typeof blueprintService>;

describe('clone-run command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedGetConfig as any).mockReturnValue({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn() } });
  });

  it('reuses existing responses and only generates missing pairs', async () => {
    // Source run has a response for prompt p1 and model m[temp:0.0]
    mockedStorage.getResultByFileName.mockResolvedValue({
      allFinalAssistantResponses: {
        p1: { 'openai:gpt-4o[temp:0.0]': 'old text' }
      },
      fullConversationHistories: {
        p1: { 'openai:gpt-4o[temp:0.0]': [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'old text' }] }
      }
    } as any);

    // Target blueprint: same prompt/messages and model/temp; add a second model so one pair is reused and one generated
    mockedRunConfig.loadAndValidateConfig.mockResolvedValue({
      id: 'cfg',
      title: 'cfg',
      models: ['openai:gpt-4o', 'openai:gpt-4o-mini'],
      prompts: [{ id: 'p1', messages: [{ role: 'user', content: 'hi' }] }],
      temperatures: [0.0],
      systems: ['SYS_A'],
      embeddingModel: 'openai:text-embedding-3-small',
    } as any);

    mockedRunConfig.parseEvalMethods.mockReturnValue(['embedding', 'llm-coverage'] as any);

    mockedLLM.getModelResponse.mockResolvedValue('new text');

    mockedPipeline.executeComparisonPipeline.mockResolvedValue({ data: {} as any, fileName: 'file.json' });

    await cloneRunCommand.parseAsync(['node', 'test', 'cfg1/run1/2024-01-01T00-00-00-000Z', '--config', 'blueprint.yml', '--cache']);

    // Should have generated at least once for the new model variant
    expect(mockedLLM.getModelResponse.mock.calls.length).toBeGreaterThanOrEqual(1);
    // Pipeline invoked with an existingResponsesMap prefilled
    expect(mockedPipeline.executeComparisonPipeline).toHaveBeenCalled();
  });

  it('infers blueprint by configId when --config is omitted (GitHub path)', async () => {
    mockedStorage.getResultByFileName.mockResolvedValue({
      allFinalAssistantResponses: {},
      fullConversationHistories: {}
    } as any);

    mockedBlueprint.fetchBlueprintContentByName.mockResolvedValue({
      content: 'id: cfg\nprompts:\n  - id: p1\n    messages:\n      - { role: user, content: hi }\nmodels: [openai:gpt-4o]',
      blueprintPath: 'configs/cfg.yml',
      fileType: 'yaml',
      commitSha: 'abc',
    } as any);

    mockedRunConfig.loadAndValidateConfig.mockResolvedValue({
      id: 'cfg', title: 'cfg', models: ['openai:gpt-4o'], prompts: [{ id: 'p1', messages: [{ role: 'user', content: 'hi' }] }], embeddingModel: 'openai:text-embedding-3-small'
    } as any);

    mockedRunConfig.parseEvalMethods.mockReturnValue(['embedding'] as any);
    mockedPipeline.executeComparisonPipeline.mockResolvedValue({ data: {} as any, fileName: 'file.json' });

    await cloneRunCommand.parseAsync(['node', 'test', 'cfg/run1/2024-01-01T00-00-00-000Z']);

    expect(mockedBlueprint.fetchBlueprintContentByName).toHaveBeenCalledWith('cfg', process.env.GITHUB_TOKEN, expect.anything());
    expect(mockedPipeline.executeComparisonPipeline).toHaveBeenCalled();
  });
});


