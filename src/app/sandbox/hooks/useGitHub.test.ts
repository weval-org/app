import { renderHook, act, waitFor } from '@testing-library/react';
import { useGitHub } from './useGitHub';
import { ActiveBlueprint } from './useWorkspace';
import { useToast } from '@/components/ui/use-toast';

// Mock the useToast hook
jest.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({
        toast: jest.fn(),
    }),
}));

// Mock fetch
global.fetch = jest.fn();

const mockBlueprint: ActiveBlueprint = {
    name: 'Test Blueprint.yml',
    path: 'blueprints/users/test-user/Test Blueprint.yml',
    sha: '123',
    content: 'title: Test',
    isLocal: false,
};

describe('useGitHub', () => {
    beforeEach(() => {
        (fetch as jest.Mock).mockClear();
    });

    test('should initialize with default values', () => {
        const { result } = renderHook(() => useGitHub(true, 'test-user'));

        expect(result.current.forkName).toBeNull();
        expect(result.current.prStatuses).toEqual({});
        expect(result.current.forkCreationRequired).toBe(false);
        expect(result.current.isSyncingWithGitHub).toBe(false);
        expect(result.current.setupMessage).toBe('');
    });

    describe('setupWorkspace', () => {
        test('should succeed if user has an existing fork', async () => {
            const { result } = renderHook(() => useGitHub(true, 'test-user'));

            (fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ forkName: 'test-user-fork' }),
            });

            await act(async () => {
                await result.current.setupWorkspace();
            });

            await waitFor(() => {
                expect(result.current.forkName).toBe('test-user-fork');
                expect(result.current.forkCreationRequired).toBe(false);
            });
        });

        test('should set forkCreationRequired if user does not have a fork', async () => {
            const { result } = renderHook(() => useGitHub(true, 'test-user'));

            (fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ forkCreationRequired: true }),
            });

            await act(async () => {
                await result.current.setupWorkspace();
            });

            await waitFor(() => {
                expect(result.current.forkCreationRequired).toBe(true);
            });
        });

        test('should create a fork if createFork is true', async () => {
            const { result } = renderHook(() => useGitHub(true, 'test-user'));

            (fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ forkName: 'test-user-fork', forkCreated: true }),
            });

            await act(async () => {
                await result.current.setupWorkspace(true);
            });

            await waitFor(() => {
                expect(result.current.forkName).toBe('test-user-fork');
                expect(result.current.forkCreationRequired).toBe(false);
            });
        });
    });

    describe('createPullRequest', () => {
        test('should successfully create a pull request', async () => {
            const { result } = renderHook(() => useGitHub(true, 'test-user'));

            // Setup the fork first
            await act(async () => {
                result.current.setForkName('test-user-fork');
            });
            
            (fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ number: 123, url: 'http://example.com/pr/123' }),
            });

            let prData: any;
            await act(async () => {
                prData = await result.current.createPullRequest({ title: 'New PR', body: 'PR Body' }, mockBlueprint);
            });

            await waitFor(() => {
                expect(prData.prData.number).toBe(123);
                expect(result.current.prStatuses[mockBlueprint.path].state).toBe('open');
            });
        });

        test('should handle failure to create a pull request', async () => {
            const { result } = renderHook(() => useGitHub(true, 'test-user'));
            
            await act(async () => {
                result.current.setForkName('test-user-fork');
            });

            (fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                json: async () => ({ error: 'Failed to create' }),
            });

            await act(async () => {
                await expect(result.current.createPullRequest({ title: 'New PR', body: 'PR Body' }, mockBlueprint))
                    .rejects.toThrow('Failed to create');
            });
        });
    });

    describe('createFileOnGitHub', () => {
        test('should successfully create a file', async () => {
            const { result } = renderHook(() => useGitHub(true, 'test-user'));
            await act(async () => {
                result.current.setForkName('test-user-fork');
            });

            (fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ name: 'new-file.yml', path: 'blueprints/users/test-user/new-file.yml', sha: 'new-sha' }),
            });

            let newFile: any;
            await act(async () => {
                newFile = await result.current.createFileOnGitHub('new-file.yml', 'content');
            });

            expect(fetch).toHaveBeenCalledWith('/api/github/workspace/file', expect.objectContaining({
                body: JSON.stringify({
                    path: 'blueprints/users/test-user/new-file.yml',
                    content: 'content',
                    sha: null,
                    forkName: 'test-user-fork',
                    isNew: true,
                })
            }));
            expect(newFile).not.toBeNull();
            expect(newFile?.sha).toBe('new-sha');
        });
    });

    describe('updateFileOnGitHub', () => {
        test('should successfully update a file', async () => {
            const { result } = renderHook(() => useGitHub(true, 'test-user'));
            await act(async () => {
                result.current.setForkName('test-user-fork');
            });

            (fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ name: 'Test Blueprint.yml', path: mockBlueprint.path, sha: 'updated-sha' }),
            });

            let updatedFile: any;
            await act(async () => {
                updatedFile = await result.current.updateFileOnGitHub(mockBlueprint.path, 'new content', mockBlueprint.sha);
            });

            expect(fetch).toHaveBeenCalledWith('/api/github/workspace/file', expect.objectContaining({
                body: JSON.stringify({
                    path: mockBlueprint.path,
                    content: 'new content',
                    sha: mockBlueprint.sha,
                    forkName: 'test-user-fork',
                    isNew: false,
                })
            }));
            expect(updatedFile).not.toBeNull();
            expect(updatedFile?.sha).toBe('updated-sha');
        });
    });
}); 