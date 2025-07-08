import { renderHook, act, waitFor } from '@testing-library/react';
import { useEvaluation } from './useEvaluation';
import { ActiveBlueprint } from './useWorkspace';

// Mock timers to control polling
jest.useFakeTimers();

// Mock fetch
global.fetch = jest.fn();

const mockBlueprint: ActiveBlueprint = {
    name: 'Test Blueprint',
    path: 'local/test-blueprint.yml',
    sha: '123',
    content: 'title: Test',
    isLocal: true,
    lastModified: '2023-01-01T00:00:00.000Z',
};

describe('useEvaluation', () => {
    beforeEach(() => {
        (fetch as jest.Mock).mockClear();
    });

    test('should initialize with idle status and no runId', () => {
        const { result } = renderHook(() => useEvaluation(true, mockBlueprint));

        expect(result.current.runStatus.status).toBe('idle');
        expect(result.current.runId).toBeNull();
        expect(result.current.runHistory).toEqual([]);
    });

    test('should handle a full successful evaluation lifecycle', async () => {
        const { result } = renderHook(() => useEvaluation(true, mockBlueprint));

        // Mock the initial call to start the evaluation
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ runId: 'test-run-123' }),
        });
        
        // Mock the IMMEDIATE poll that happens right after runId is set.
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ status: 'pending' }),
        });

        await act(async () => {
            await result.current.runEvaluation();
        });
        
        // Wait for the initial poll to complete and check the status
        await waitFor(() => {
            expect(result.current.runId).toBe('test-run-123');
            expect(result.current.runStatus.status).toBe('pending');
        });
        
        // Mock the SUBSEQUENT status polling call
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ status: 'complete', resultUrl: '/results/test-run-123' }),
        });
        
        // Advance timers to trigger the next poll
        await act(async () => {
            jest.advanceTimersByTime(3000);
        });
        
        // Wait for the status to update to 'complete'
        await waitFor(() => {
            expect(result.current.runStatus.status).toBe('complete');
        });
    });

    test('should handle API error when starting an evaluation', async () => {
        const { result } = renderHook(() => useEvaluation(true, mockBlueprint));

        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'Failed to start evaluation' }),
        });

        await act(async () => {
            await result.current.runEvaluation();
        });

        await waitFor(() => {
            expect(result.current.runStatus.status).toBe('error');
            expect(result.current.runStatus.message).toBe('Failed to start evaluation');
        });
    });

    test('should handle API error during status polling', async () => {
        const { result } = renderHook(() => useEvaluation(true, mockBlueprint));

        // Mock a successful start
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ runId: 'test-run-fail' }),
        });
        
        // Mock the immediate poll to be successful (still pending)
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ status: 'pending' }),
        });

        await act(async () => {
            await result.current.runEvaluation();
        });

        await waitFor(() => {
            expect(result.current.runId).toBe('test-run-fail');
        });

        // Mock a failed subsequent poll
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({ error: 'Server Error' }),
        });

        await act(async () => {
            jest.advanceTimersByTime(3000);
        });

        await waitFor(() => {
            expect(result.current.runStatus.status).toBe('error');
            expect(result.current.runStatus.message).toBe('Failed to get status (HTTP 500).');
        });
    });
});