import { backfillSummaryCommand } from './backfill-summary';
import * as storageService from '../../lib/storageService';
import { getConfig }from '../config';
import { EnhancedComparisonConfigInfo } from '../../app/utils/homepageDataUtils';

jest.mock('../../lib/storageService');
jest.mock('../config');

const mockedStorage = storageService as jest.Mocked<typeof storageService>;
const mockedGetConfig = getConfig as jest.Mocked<typeof getConfig>;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockConfigData1 = {
    configId: 'config-1',
    configTitle: 'Config 1',
    tags: ['_featured'],
    runs: [{ runLabel: 'run-1', timestamp: '2024-01-01T10-00-00-000Z', fileName: 'f1' }],
    latestRunTimestamp: '2024-01-01T10-00-00-000Z',
};

const mockConfigData2 = {
    configId: 'config-2',
    configTitle: 'Config 2',
    tags: ['not-featured'],
    runs: [{ runLabel: 'run-2', timestamp: '2024-01-02T10-00-00-000Z', fileName: 'f2' }],
    latestRunTimestamp: '2024-01-02T10-00-00-000Z',
};

const mockRunInfo1 = { runLabel: 'run-1', timestamp: '2024-01-01T10-00-00-000Z', fileName: 'f1.json' };
const mockResultData1 = { configId: 'config-1', runLabel: 'run-1', timestamp: '2024-01-01T10-00-00-000Z', tags: ['_featured'] };

const mockRunInfo2 = { runLabel: 'run-2', timestamp: '2024-01-02T10-00-00-000Z', fileName: 'f2.json' };
const mockResultData2 = { configId: 'config-2', runLabel: 'run-2', timestamp: '2024-01-02T10-00-00-000Z', tags: ['not-featured'] };


describe('backfill-summary command', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (mockedGetConfig as any).mockReturnValue({ logger: mockLogger });

        // Reset mocks to a default "happy path" state
        mockedStorage.listConfigIds.mockResolvedValue(['config-1', 'config-2']);
        mockedStorage.listRunsForConfig.mockImplementation((configId: string) => {
            if (configId === 'config-1') return Promise.resolve([mockRunInfo1]);
            if (configId === 'config-2') return Promise.resolve([mockRunInfo2]);
            return Promise.resolve([]);
        });
        mockedStorage.getResultByFileName.mockImplementation((configId: string, fileName: string) => {
            if (configId === 'config-1') return Promise.resolve(mockResultData1 as any);
            if (configId === 'config-2') return Promise.resolve(mockResultData2 as any);
            return Promise.resolve(null);
        });
        mockedStorage.updateSummaryDataWithNewRun.mockImplementation((summary: EnhancedComparisonConfigInfo[] | null, newData: any) => {
             if (newData.configId === 'config-1') return [mockConfigData1 as any];
             if (newData.configId === 'config-2') return [mockConfigData2 as any];
             return [];
        });
    });

    it('should process all configs and runs, saving a summary for each', async () => {
        await backfillSummaryCommand.parseAsync(['node', 'test']);

        expect(mockedStorage.listConfigIds).toHaveBeenCalledTimes(1);
        expect(mockedStorage.listRunsForConfig).toHaveBeenCalledWith('config-1');
        expect(mockedStorage.listRunsForConfig).toHaveBeenCalledWith('config-2');
        expect(mockedStorage.getResultByFileName).toHaveBeenCalledTimes(2);
        
        // Check that a per-config summary was saved for each config
        expect(mockedStorage.saveConfigSummary).toHaveBeenCalledTimes(2);
        expect(mockedStorage.saveConfigSummary).toHaveBeenCalledWith('config-1', mockConfigData1);
        expect(mockedStorage.saveConfigSummary).toHaveBeenCalledWith('config-2', mockConfigData2);
    });

    it('should save a hybrid homepage summary with run data only for featured configs', async () => {
        await backfillSummaryCommand.parseAsync(['node', 'test']);

        // Check that the final homepage summary was saved
        expect(mockedStorage.saveHomepageSummary).toHaveBeenCalledTimes(1);
        
        // Get the argument passed to saveHomepageSummary
        const savedHomepageSummary = mockedStorage.saveHomepageSummary.mock.calls[0][0];

        // Assert that the summary contains metadata for ALL configs
        expect(savedHomepageSummary.configs).toHaveLength(2);

        // Find the featured config and assert it has its run data
        const featuredConfig = savedHomepageSummary.configs.find(c => c.configId === 'config-1');
        expect(featuredConfig).toBeDefined();
        expect(featuredConfig!.tags).toContain('_featured');
        expect(featuredConfig!.runs).toHaveLength(1); // It should have its run data

        // Find the non-featured config and assert its run data is stripped
        const nonFeaturedConfig = savedHomepageSummary.configs.find(c => c.configId === 'config-2');
        expect(nonFeaturedConfig).toBeDefined();
        expect(nonFeaturedConfig!.tags).not.toContain('_featured');
        expect(nonFeaturedConfig!.runs).toHaveLength(0); // Its runs should be an empty array
    });

    it('should handle cases where no configs are found', async () => {
        mockedStorage.listConfigIds.mockResolvedValue([]);
        await backfillSummaryCommand.parseAsync(['node', 'test']);
        expect(mockLogger.warn).toHaveBeenCalledWith('No configuration IDs found. Nothing to backfill.');
        expect(mockedStorage.saveConfigSummary).not.toHaveBeenCalled();
        expect(mockedStorage.saveHomepageSummary).not.toHaveBeenCalled();
    });

    it('should handle configs with no runs', async () => {
        mockedStorage.listRunsForConfig.mockResolvedValue([]);
        await backfillSummaryCommand.parseAsync(['node', 'test']);
        expect(mockedStorage.listRunsForConfig).toHaveBeenCalledWith('config-1');
        expect(mockedStorage.listRunsForConfig).toHaveBeenCalledWith('config-2');
        expect(mockedStorage.getResultByFileName).not.toHaveBeenCalled();
        expect(mockedStorage.saveConfigSummary).not.toHaveBeenCalled();
    });

    it('should handle failure to fetch a result file', async () => {
        mockedStorage.getResultByFileName.mockResolvedValue(null);
        await backfillSummaryCommand.parseAsync(['node', 'test']);
        expect(mockLogger.warn).toHaveBeenCalledWith('  Could not fetch or parse result data for run file: f1.json');
        expect(mockLogger.warn).toHaveBeenCalledWith('  Could not fetch or parse result data for run file: f2.json');
        expect(mockedStorage.saveConfigSummary).not.toHaveBeenCalled();
    });

}); 