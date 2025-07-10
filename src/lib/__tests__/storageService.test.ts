/**
 * @jest-environment node
 */
import { 
    updateSummaryDataWithNewRun,
    getConfigSummary,
    saveConfigSummary,
    getHomepageSummary,
    saveHomepageSummary,
    HomepageSummaryFileContent,
    saveModelSummary,
    getModelSummary,
    listModelSummaries,
    listConfigIds,
    listRunsForConfig,
} from '../storageService';
import { EnhancedComparisonConfigInfo } from '../../app/utils/homepageDataUtils';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { RESULTS_DIR, MULTI_DIR } from '@/cli/constants';
import { ModelSummary } from '@/types/shared';

// Mock calculation utilities as their specific output isn't being tested here.
jest.mock('../../app/utils/calculationUtils', () => ({
  calculateAverageHybridScoreForRun: jest.fn(() => ({ average: 0.9, stddev: 0.1 })),
  calculatePerModelHybridScoresForRun: jest.fn(() => new Map([['model-1', { average: 0.9, stddev: 0.1 }]])),
  calculateStandardDeviation: jest.fn(() => 0.05),
}));

// Mock filesystem and S3 client
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn(),
    mkdirSync: jest.fn(), // Mock mkdirSync as well
}));
const mockedFsSync = fsSync as jest.Mocked<typeof fsSync>;

jest.mock('@aws-sdk/client-s3', () => {
    const originalModule = jest.requireActual('@aws-sdk/client-s3');
    return {
        __esModule: true,
        ...originalModule,
        S3Client: jest.fn(),
    };
});

const mockSummary: EnhancedComparisonConfigInfo = {
  configId: 'test-config',
  configTitle: 'Test Config',
  id: 'test-config',
  title: 'Test Config',
  runs: [],
  latestRunTimestamp: '2024-01-01T00-00-00-000Z'
};

const serializableMockSummary = {
    ...mockSummary,
    runs: []
};

const mockHomepageSummary: HomepageSummaryFileContent = {
    configs: [
        {
            configId: 'test-config',
            configTitle: 'Test Config',
            id: 'test-config',
            title: 'Test Config',
            description: 'A test config',
            runs: [
                {
                    runLabel: 'run-1',
                    timestamp: '2024-03-15T10-00-00-000Z',
                    fileName: 'run-1_2024-03-15T10-00-00-000Z_comparison.json',
                    perModelHybridScores: new Map([['model-a', { average: 0.9, stddev: 0.1 }]])
                }
            ],
            latestRunTimestamp: '2024-03-15T10-00-00-000Z',
            tags: ['test'],
            overallAverageHybridScore: 0.9,
            hybridScoreStdDev: 0.1
        }
    ],
    headlineStats: null,
    driftDetectionResult: null,
    lastUpdated: '2024-03-15T12-00-00-000Z',
};

// This is what it should look like after serialization (Map -> object)
const serializableMockHomepageSummary = {
    ...mockHomepageSummary,
    configs: mockHomepageSummary.configs.map(c => ({
        ...c,
        runs: c.runs.map(r => ({
            ...r,
            perModelHybridScores: Object.fromEntries(r.perModelHybridScores!)
        }))
    }))
};

const mockModelSummary: ModelSummary = {
    modelId: 'test-provider:test-model',
    displayName: 'Test Model',
    provider: 'test-provider',
    overallStats: {
        averageHybridScore: 0.85,
        totalRuns: 10,
        totalBlueprints: 5,
    },
    strengthsAndWeaknesses: {
        topPerforming: [],
        weakestPerforming: [],
    },
    runs: [],
    lastUpdated: '2024-01-01T00:00:00.000Z',
};

const baseMockResultData: FetchedComparisonData = {
    configId: 'test-config',
    configTitle: 'Test Config',
    runLabel: 'test-run',
    timestamp: '', // This will be set per test
    config: {
      id: 'test-config',
      title: 'Test Config',
      configId: 'test-config',
      configTitle: 'Test Config',
      models: [],
      prompts: [],
    },
    evalMethodsUsed: ['embedding'],
    effectiveModels: ['model-1'],
    modelSystemPrompts: {},
    promptIds: ['p-1'],
    promptContexts: {},
    allFinalAssistantResponses: {},
    evaluationResults: {},
  };

describe('storageService', () => {
    let mockedFs: jest.Mocked<typeof import('fs/promises')>;
    let mockedFsSync: jest.Mocked<typeof import('fs')>;
    let mockSend: jest.Mock;

    beforeEach(() => {
        jest.resetModules(); // This is key to re-evaluating storageService with new env vars

        // Clear environment variables to ensure a clean slate for each test
        delete process.env.STORAGE_PROVIDER;
        delete process.env.APP_S3_BUCKET_NAME;
        delete process.env.APP_S3_REGION;

        // Re-require mocks to get fresh instances after reset
        mockedFs = require('fs/promises');
        mockedFsSync = require('fs');
        const { S3Client } = require('@aws-sdk/client-s3');
        mockSend = jest.fn();
        (S3Client as jest.Mock).mockImplementation(() => ({
            send: mockSend,
        }));
        
        // Clear mock history
        jest.clearAllMocks();
    });

    describe('getConfigSummary', () => {
        it('should read from local fs when provider is local', async () => {
            process.env.STORAGE_PROVIDER = 'local';
            const { getConfigSummary } = require('../storageService');

            mockedFsSync.existsSync.mockReturnValue(true);
            mockedFs.readFile.mockResolvedValue(JSON.stringify(serializableMockSummary));
            
            const summary = await getConfigSummary('test-config');
            
            expect(mockedFs.readFile).toHaveBeenCalledWith(path.join(RESULTS_DIR, MULTI_DIR, 'test-config', 'summary.json'), 'utf-8');
            expect(summary).toEqual(expect.objectContaining({ configId: 'test-config' }));
        });

        it('should return null if local file does not exist', async () => {
            process.env.STORAGE_PROVIDER = 'local';
            const { getConfigSummary } = require('../storageService');
            
            mockedFsSync.existsSync.mockReturnValue(false);
            const summary = await getConfigSummary('test-config');
            expect(summary).toBeNull();
        });

        it('should read from S3 when provider is s3', async () => {
            process.env.STORAGE_PROVIDER = 's3';
            process.env.APP_S3_BUCKET_NAME = 'test-bucket';
            process.env.APP_S3_REGION = 'us-east-1'; // Set region to avoid warnings
            const { getConfigSummary } = require('../storageService');

            const stream = new Readable();
            stream.push(JSON.stringify(serializableMockSummary));
            stream.push(null);
            mockSend.mockResolvedValue({ Body: stream });

            const summary = await getConfigSummary('test-config');
            
            expect(mockSend).toHaveBeenCalled();
            const sentCommand = mockSend.mock.calls[0][0] as GetObjectCommand;
            expect(sentCommand.input.Bucket).toBe('test-bucket');
            expect(sentCommand.input.Key).toBe('multi/test-config/summary.json');
            expect(summary).toEqual(expect.objectContaining({ configId: 'test-config' }));
        });

        it('should return null if S3 object does not exist', async () => {
            process.env.STORAGE_PROVIDER = 's3';
            process.env.APP_S3_BUCKET_NAME = 'test-bucket';
            process.env.APP_S3_REGION = 'us-east-1';
            const { getConfigSummary } = require('../storageService');

            const error = new Error('Not Found') as any;
            error.name = 'NoSuchKey';
            mockSend.mockRejectedValue(error);

            const summary = await getConfigSummary('test-config');
            expect(summary).toBeNull();
        });
    });

    describe('saveConfigSummary', () => {
        it('should write to local fs when provider is local', async () => {
            process.env.STORAGE_PROVIDER = 'local';
            const { saveConfigSummary } = require('../storageService');

            await saveConfigSummary('test-config', mockSummary);
            
            expect(mockedFs.writeFile).toHaveBeenCalledWith(
                path.join(RESULTS_DIR, MULTI_DIR, 'test-config', 'summary.json'),
                JSON.stringify(serializableMockSummary, null, 2),
                'utf-8'
            );
        });

        it('should write to S3 when provider is s3', async () => {
            process.env.STORAGE_PROVIDER = 's3';
            process.env.APP_S3_BUCKET_NAME = 'test-bucket';
            process.env.APP_S3_REGION = 'us-east-1';
            const { saveConfigSummary } = require('../storageService');
            
            await saveConfigSummary('test-config', mockSummary);

            expect(mockSend).toHaveBeenCalled();
            const sentCommand = mockSend.mock.calls[0][0] as PutObjectCommand;
            expect(sentCommand.input.Bucket).toBe('test-bucket');
            expect(sentCommand.input.Key).toBe('multi/test-config/summary.json');
            expect(sentCommand.input.Body).toBe(JSON.stringify(serializableMockSummary, null, 2));
        });
    });

    describe('Model Summaries', () => {
        const safeModelId = 'test-provider_test-model';

        describe('saveModelSummary', () => {
            it('should write to local fs when provider is local', async () => {
                process.env.STORAGE_PROVIDER = 'local';
                const { saveModelSummary } = require('../storageService');
                await saveModelSummary(mockModelSummary.modelId, mockModelSummary);
                expect(mockedFs.writeFile).toHaveBeenCalledWith(
                    path.join(RESULTS_DIR, MULTI_DIR, 'models', `${safeModelId}.json`),
                    JSON.stringify(mockModelSummary, null, 2),
                    'utf-8'
                );
            });

            it('should write to S3 when provider is s3', async () => {
                process.env.STORAGE_PROVIDER = 's3';
                process.env.APP_S3_BUCKET_NAME = 'test-bucket';
                process.env.APP_S3_REGION = 'us-east-1';
                const { saveModelSummary } = require('../storageService');
                await saveModelSummary(mockModelSummary.modelId, mockModelSummary);
                expect(mockSend).toHaveBeenCalled();
                const sentCommand = mockSend.mock.calls[0][0] as PutObjectCommand;
                expect(sentCommand.input.Bucket).toBe('test-bucket');
                expect(sentCommand.input.Key).toBe(`multi/models/${safeModelId}.json`);
                expect(sentCommand.input.Body).toBe(JSON.stringify(mockModelSummary, null, 2));
            });
        });

        describe('getModelSummary', () => {
            it('should read from local fs when provider is local', async () => {
                process.env.STORAGE_PROVIDER = 'local';
                const { getModelSummary } = require('../storageService');
                mockedFsSync.existsSync.mockReturnValue(true);
                mockedFs.readFile.mockResolvedValue(JSON.stringify(mockModelSummary));
                const summary = await getModelSummary(mockModelSummary.modelId);
                expect(mockedFs.readFile).toHaveBeenCalledWith(path.join(RESULTS_DIR, MULTI_DIR, 'models', `${safeModelId}.json`),'utf-8');
                expect(summary).toEqual(mockModelSummary);
            });

             it('should read from S3 when provider is s3', async () => {
                process.env.STORAGE_PROVIDER = 's3';
                process.env.APP_S3_BUCKET_NAME = 'test-bucket';
                process.env.APP_S3_REGION = 'us-east-1';
                const { getModelSummary } = require('../storageService');
                const stream = new Readable();
                stream.push(JSON.stringify(mockModelSummary));
                stream.push(null);
                mockSend.mockResolvedValue({ Body: stream });
                const summary = await getModelSummary(mockModelSummary.modelId);
                expect(mockSend).toHaveBeenCalled();
                const sentCommand = mockSend.mock.calls[0][0] as GetObjectCommand;
                expect(sentCommand.input.Key).toBe(`multi/models/${safeModelId}.json`);
                expect(summary).toEqual(mockModelSummary);
            });
        });

        describe('listModelSummaries', () => {
             it('should list from local fs when provider is local', async () => {
                process.env.STORAGE_PROVIDER = 'local';
                const { listModelSummaries } = require('../storageService');
                const mockDirent = [{ name: `${safeModelId}.json`, isFile: () => true }];
                mockedFs.readdir.mockResolvedValue(mockDirent as any);
                const summaries = await listModelSummaries();
                expect(mockedFs.readdir).toHaveBeenCalledWith(path.join(process.cwd(), RESULTS_DIR, MULTI_DIR, 'models'), { withFileTypes: true });
                expect(summaries).toEqual([safeModelId]);
            });

            it('should list from S3 when provider is s3', async () => {
                process.env.STORAGE_PROVIDER = 's3';
                process.env.APP_S3_BUCKET_NAME = 'test-bucket';
                process.env.APP_S3_REGION = 'us-east-1';
                const { listModelSummaries } = require('../storageService');
                mockSend.mockResolvedValue({ Contents: [{ Key: `multi/models/${safeModelId}.json` }] });
                const summaries = await listModelSummaries();
                expect(mockSend).toHaveBeenCalled();
                const sentCommand = mockSend.mock.calls[0][0];
                expect(sentCommand.input.Prefix).toBe('multi/models/');
                expect(summaries).toEqual([safeModelId]);
            });
        });
    });

    describe('updateSummaryDataWithNewRun', () => {
      it('should correctly sort runs by URL-safe timestamps', () => {
        const { updateSummaryDataWithNewRun } = require('../storageService');
        const safeTimestamp1 = '2024-01-01T10-00-00-000Z'; // oldest
        const safeTimestamp2 = '2024-01-02T12-30-00-000Z'; // newest
        const safeTimestamp3 = '2024-01-01T11-00-00-000Z'; // middle

        const existingSummary: EnhancedComparisonConfigInfo[] = [
          {
            configId: 'test-config',
            configTitle: 'Test Config',
            id: 'test-config',
            title: 'Test Config',
            description: '',
            runs: [
              { runLabel: 'run1', timestamp: safeTimestamp1, fileName: `run1_${safeTimestamp1}_comparison.json`, perModelHybridScores: new Map() },
              { runLabel: 'run3', timestamp: safeTimestamp3, fileName: `run3_${safeTimestamp3}_comparison.json`, perModelHybridScores: new Map() },
            ],
            latestRunTimestamp: safeTimestamp3,
            tags: [],
            overallAverageHybridScore: 0.8,
            hybridScoreStdDev: 0.1,
          },
        ];

        const newResultData: FetchedComparisonData = { ...baseMockResultData, timestamp: safeTimestamp2 };
        const newRunFileName = `run2_${safeTimestamp2}_comparison.json`;

        const updatedSummary = updateSummaryDataWithNewRun(existingSummary, newResultData, newRunFileName);
        const updatedConfig = updatedSummary.find((c: EnhancedComparisonConfigInfo) => c.configId === 'test-config');

        expect(updatedConfig).toBeDefined();
        expect(updatedConfig!.runs).toHaveLength(3);
        expect(updatedConfig!.runs[0].timestamp).toBe(safeTimestamp2);
        expect(updatedConfig!.runs[1].timestamp).toBe(safeTimestamp3);
        expect(updatedConfig!.runs[2].timestamp).toBe(safeTimestamp1);
        expect(updatedConfig!.latestRunTimestamp).toBe(safeTimestamp2);
      });

      it('should handle a mix of safe and unsafe (legacy) timestamps gracefully during sorting', () => {
        const { updateSummaryDataWithNewRun } = require('../storageService');
        const legacyTimestamp = '2024-02-01T10:00:00.000Z';
        const safeTimestamp = '2024-01-15T12-00-00-000Z';

        const existingSummary: EnhancedComparisonConfigInfo[] = [
          {
            configId: 'test-config',
            configTitle: 'Test Config',
            id: 'test-config',
            title: 'Test Config',
            description: '',
            runs: [{ runLabel: 'run-safe', timestamp: safeTimestamp, fileName: `run-safe_${safeTimestamp}_comparison.json`, perModelHybridScores: new Map() }],
            latestRunTimestamp: safeTimestamp,
            tags: [],
            overallAverageHybridScore: 0.8,
            hybridScoreStdDev: 0.1,
          },
        ];
        
        const newResultData: FetchedComparisonData = { ...baseMockResultData, timestamp: legacyTimestamp };
        const newRunFileName = `run-legacy_${legacyTimestamp.replace(/[:.]/g, '-')}_comparison.json`;

        const updatedSummary = updateSummaryDataWithNewRun(existingSummary, newResultData, newRunFileName);
        const updatedConfig = updatedSummary.find((c: EnhancedComparisonConfigInfo) => c.configId === 'test-config');

        expect(updatedConfig).toBeDefined();
        expect(updatedConfig!.runs).toHaveLength(2);
        expect(updatedConfig!.runs[0].timestamp).toBe(legacyTimestamp);
        expect(updatedConfig!.runs[1].timestamp).toBe(safeTimestamp);
        expect(updatedConfig!.latestRunTimestamp).toBe(legacyTimestamp);
      });
    });

    describe('Homepage Summary', () => {
        const homepageSummaryFileName = 'homepage_summary.json';

        describe('getHomepageSummary', () => {
            it('should read from local fs and rehydrate maps', async () => {
                process.env.STORAGE_PROVIDER = 'local';
                const { getHomepageSummary } = require('../storageService');

                mockedFsSync.existsSync.mockReturnValue(true);
                mockedFs.readFile.mockResolvedValue(JSON.stringify(serializableMockHomepageSummary));

                const summary = await getHomepageSummary();

                expect(mockedFs.readFile).toHaveBeenCalledWith(path.join(RESULTS_DIR, MULTI_DIR, homepageSummaryFileName), 'utf-8');
                expect(summary).toEqual(mockHomepageSummary);
                expect(summary?.configs[0].runs[0].perModelHybridScores).toBeInstanceOf(Map);
            });

            it('should read from S3 and rehydrate maps', async () => {
                process.env.STORAGE_PROVIDER = 's3';
                process.env.APP_S3_BUCKET_NAME = 'test-bucket';
                process.env.APP_S3_REGION = 'us-east-1';
                const { getHomepageSummary } = require('../storageService');
                
                const stream = new Readable();
                stream.push(JSON.stringify(serializableMockHomepageSummary));
                stream.push(null);
                mockSend.mockResolvedValue({ Body: stream });

                const summary = await getHomepageSummary();

                expect(mockSend).toHaveBeenCalled();
                const sentCommand = mockSend.mock.calls[0][0] as GetObjectCommand;
                expect(sentCommand.input.Key).toBe(homepageSummaryFileName);
                expect(summary).toEqual(mockHomepageSummary);
                expect(summary?.configs[0].runs[0].perModelHybridScores).toBeInstanceOf(Map);
            });

            it('should return null if the S3 object does not exist', async () => {
                process.env.STORAGE_PROVIDER = 's3';
                process.env.APP_S3_BUCKET_NAME = 'test-bucket';
                process.env.APP_S3_REGION = 'us-east-1';
                const { getHomepageSummary } = require('../storageService');

                const error = new Error('Not Found') as any;
                error.name = 'NoSuchKey';
                mockSend.mockRejectedValue(error);

                const summary = await getHomepageSummary();
                expect(summary).toBeNull();
            });
        });

        describe('saveHomepageSummary', () => {
            it('should write serialized data to local fs', async () => {
                process.env.STORAGE_PROVIDER = 'local';
                const { saveHomepageSummary } = require('../storageService');

                await saveHomepageSummary(mockHomepageSummary);

                expect(mockedFs.writeFile).toHaveBeenCalledWith(
                    path.join(RESULTS_DIR, MULTI_DIR, homepageSummaryFileName),
                    JSON.stringify(serializableMockHomepageSummary, null, 2),
                    'utf-8'
                );
            });

            it('should write serialized data to S3', async () => {
                process.env.STORAGE_PROVIDER = 's3';
                process.env.APP_S3_BUCKET_NAME = 'test-bucket';
                process.env.APP_S3_REGION = 'us-east-1';
                const { saveHomepageSummary } = require('../storageService');

                await saveHomepageSummary(mockHomepageSummary);

                expect(mockSend).toHaveBeenCalled();
                const sentCommand = mockSend.mock.calls[0][0] as PutObjectCommand;
                expect(sentCommand.input.Bucket).toBe('test-bucket');
                expect(sentCommand.input.Key).toBe(homepageSummaryFileName);
                expect(sentCommand.input.Body).toBe(JSON.stringify(serializableMockHomepageSummary, null, 2));
            });
        });
    });

    describe('Listing and Discovery', () => {
        describe('listConfigIds', () => {
            it('should list directory names from local fs', async () => {
                process.env.STORAGE_PROVIDER = 'local';
                const { listConfigIds } = require('../storageService');
                
                const mockDirents = [
                    { name: 'config-one', isDirectory: () => true },
                    { name: 'config-two', isDirectory: () => true },
                    { name: 'a-file.txt', isDirectory: () => false },
                ];
                mockedFs.readdir.mockResolvedValue(mockDirents as any);

                const ids = await listConfigIds();
                expect(ids).toEqual(['config-one', 'config-two']);
                expect(mockedFs.readdir).toHaveBeenCalledWith(
                    path.join(process.cwd(), RESULTS_DIR, MULTI_DIR),
                    { withFileTypes: true }
                );
            });
            
            it('should return an empty array if local base directory does not exist', async () => {
                process.env.STORAGE_PROVIDER = 'local';
                const { listConfigIds } = require('../storageService');
                
                const error = new Error('Not Found') as any;
                error.code = 'ENOENT';
                mockedFs.readdir.mockRejectedValue(error);

                const ids = await listConfigIds();
                expect(ids).toEqual([]);
            });

            it('should list common prefixes from S3', async () => {
                process.env.STORAGE_PROVIDER = 's3';
                process.env.APP_S3_BUCKET_NAME = 'test-bucket';
                process.env.APP_S3_REGION = 'us-east-1';
                const { listConfigIds } = require('../storageService');
                
                mockSend.mockResolvedValue({
                    CommonPrefixes: [
                        { Prefix: 'multi/config-alpha/' },
                        { Prefix: 'multi/config-beta/' },
                    ],
                });

                const ids = await listConfigIds();
                expect(ids).toEqual(['config-alpha', 'config-beta']);
                
                const sentCommand = mockSend.mock.calls[0][0] as ListObjectsV2Command;
                expect(sentCommand.input.Prefix).toBe('multi/');
                expect(sentCommand.input.Delimiter).toBe('/');
            });
        });
        
        describe('listRunsForConfig', () => {
            it('should list and parse filenames from local fs, sorted newest first', async () => {
                process.env.STORAGE_PROVIDER = 'local';
                const { listRunsForConfig } = require('../storageService');

                const mockFiles = [
                    'run1_2024-01-01T10-00-00-000Z_comparison.json', // oldest
                    'summary.json', // should be ignored
                    'run3_2024-01-01T12-00-00-000Z_comparison.json', // newest
                    'run2_2024-01-01T11-00-00-000Z_comparison.json',
                    'a-run-with-no-timestamp_comparison.json', // no timestamp, sorted by name
                ];
                mockedFs.readdir.mockResolvedValue(mockFiles as any);

                const runs = await listRunsForConfig('test-config');
                expect(runs).toHaveLength(4);
                expect(runs.map((r: any) => r.runLabel)).toEqual(['run3', 'run2', 'run1', 'a-run-with-no-timestamp']);
                expect(runs[0].timestamp).toBe('2024-01-01T12-00-00-000Z');
                expect(runs[3].timestamp).toBeNull();
            });

            it('should list and parse keys from S3, sorted newest first', async () => {
                process.env.STORAGE_PROVIDER = 's3';
                process.env.APP_S3_BUCKET_NAME = 'test-bucket';
                process.env.APP_S3_REGION = 'us-east-1';
                const { listRunsForConfig } = require('../storageService');
                
                mockSend.mockResolvedValue({
                    Contents: [
                        { Key: 'multi/test-config/run-new_2024-02-01T10-00-00-000Z_comparison.json' },
                        { Key: 'multi/test-config/run-old_2024-01-15T10-00-00-000Z_comparison.json' },
                        { Key: 'multi/test-config/summary.json' }, // should be ignored
                    ]
                });

                const runs = await listRunsForConfig('test-config');
                expect(runs).toHaveLength(2);
                expect(runs.map((r: any) => r.runLabel)).toEqual(['run-new', 'run-old']);
                expect(runs[0].timestamp).toBe('2024-02-01T10-00-00-000Z');
                
                const sentCommand = mockSend.mock.calls[0][0] as ListObjectsV2Command;
                expect(sentCommand.input.Prefix).toBe('multi/test-config');
            });
        });
    });
}); 