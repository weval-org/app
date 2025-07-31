import { jest } from '@jest/globals';
import { deleteFromPairsCommand } from './delete-from-pairs';
import * as storageService from '../../lib/storageService';
import { getConfig } from '../config';
import * as pairwiseService from '../services/pairwise-task-queue-service';
import * as confirmUtil from '../utils/confirm';

jest.mock('../../lib/storageService');
jest.mock('../services/pairwise-task-queue-service');
jest.mock('../config');
jest.mock('../utils/confirm');

const mockedPairwiseService = jest.mocked(pairwiseService);
const mockedGetConfig = jest.mocked(getConfig);
const mockedConfirm = jest.mocked(confirmUtil);

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('delete-from-pairs command', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        (mockedGetConfig as any).mockReturnValue({ logger: mockLogger });
        mockedPairwiseService.deletePairwiseTasks.mockResolvedValue({ deletedCount: 10 });
    });

    it('should call deletePairwiseTasks with configId when specified and confirmed', async () => {
        mockedConfirm.confirmAction.mockResolvedValue(true);
        await deleteFromPairsCommand.parseAsync(['node', 'test', '--config-id', 'test-config']);
        
        expect(mockedConfirm.confirmAction).toHaveBeenCalledWith(expect.objectContaining({
            details: expect.arrayContaining(["You are about to delete all pairs tasks associated with config ID: test-config"])
        }));
        expect(mockedPairwiseService.deletePairwiseTasks).toHaveBeenCalledWith({
            configId: 'test-config',
            logger: mockLogger
        });
        expect(mockLogger.info).toHaveBeenCalledWith('Operation complete. Deleted 10 tasks.');
    });

    it('should call deletePairwiseTasks without configId when not specified and confirmed', async () => {
        mockedConfirm.confirmAction.mockResolvedValue(true);
        await deleteFromPairsCommand.parseAsync(['node', 'test']);

        expect(mockedConfirm.confirmAction).toHaveBeenCalledWith(expect.objectContaining({
            details: expect.arrayContaining(["You are about to delete ALL pairs tasks from the entire system."])
        }));
        expect(mockedPairwiseService.deletePairwiseTasks).toHaveBeenCalledWith({
            configId: undefined,
            logger: mockLogger
        });
        expect(mockLogger.info).toHaveBeenCalledWith('Operation complete. Deleted 10 tasks.');
    });

    it('should NOT call deletePairwiseTasks if user cancels the operation', async () => {
        mockedConfirm.confirmAction.mockResolvedValue(false);
        await deleteFromPairsCommand.parseAsync(['node', 'test', '--config-id', 'test-config']);

        expect(mockedConfirm.confirmAction).toHaveBeenCalled();
        expect(mockedPairwiseService.deletePairwiseTasks).not.toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith('Operation cancelled by user.');
    });

    it('should handle errors during deletion', async () => {
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: any) => never);
        mockedConfirm.confirmAction.mockResolvedValue(true);
        const testError = new Error('Test deletion error');
        mockedPairwiseService.deletePairwiseTasks.mockRejectedValue(testError);

        await deleteFromPairsCommand.parseAsync(['node', 'test']);

        expect(mockLogger.error).toHaveBeenCalledWith(`An error occurred during deletion: ${testError.message}`);
        expect(mockExit).toHaveBeenCalledWith(1);
        mockExit.mockRestore();
    });
}); 