import { renderHook, act, waitFor } from '@testing-library/react';
import { useGitHub } from './useGitHub';
import { ActiveBlueprint, BlueprintFile } from './useWorkspace';
import { useToast } from '@/components/ui/use-toast';

// Mock the useToast hook
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({
        toast: mockToast,
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
    lastModified: '2023-01-01T00:00:00.000Z',
    branchName: 'proposal/test-blueprint-123',
};

describe('useGitHub', () => {
    beforeEach(() => {
        (fetch as jest.Mock).mockClear();
        jest.spyOn(Date, 'now').mockImplementation(() => 1234567890);
    });

    afterEach(() => {
        jest.restoreAllMocks();
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

            expect(fetch).toHaveBeenCalledWith('/api/github/pr/create', expect.objectContaining({
                body: JSON.stringify({
                    title: 'New PR',
                    body: 'PR Body',
                    forkName: 'test-user-fork',
                    headBranch: mockBlueprint.branchName,
                })
            }));

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

        test('should throw an error if no active blueprint, fork, or branch is available', async () => {
            const { result } = renderHook(() => useGitHub(true, 'test-user'));
            
            await act(async () => {
                await expect(result.current.createPullRequest({ title: 'New PR', body: 'PR Body' }, { ...mockBlueprint, branchName: undefined }))
                    .rejects.toThrow('No active blueprint, fork, or branch available to create a PR.');
            });
        });
    });

    describe('promoteBlueprintToBranch', () => {
        test('should successfully create a file on a new branch', async () => {
            const { result } = renderHook(() => useGitHub(true, 'test-user'));
            await act(async () => {
                result.current.setForkName('test-user-fork');
            });

            const newFileFromApi = { name: 'new-file.yml', path: 'blueprints/users/test-user/new-file.yml', sha: 'new-sha' };
            (fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => newFileFromApi,
            });

            let newFile: any;
            await act(async () => {
                newFile = await result.current.promoteBlueprintToBranch('new-file.yml', 'content');
            });

            const expectedBranchName = 'proposal/new-file-1234567890';
            expect(fetch).toHaveBeenCalledWith('/api/github/workspace/file', expect.objectContaining({
                body: JSON.stringify({
                    path: 'blueprints/users/test-user/new-file.yml',
                    content: 'content',
                    sha: null,
                    forkName: 'test-user-fork',
                    isNew: true,
                    branchName: expectedBranchName,
                })
            }));
            expect(newFile).not.toBeNull();
            expect(newFile?.sha).toBe('new-sha');
            expect(newFile?.branchName).toBe(expectedBranchName);
        });
    });

    describe('updateFileOnGitHub', () => {
        test('should successfully update a file on a specific branch', async () => {
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
                updatedFile = await result.current.updateFileOnGitHub(mockBlueprint.path, 'new content', mockBlueprint.sha, 'proposal/test-branch');
            });

            expect(fetch).toHaveBeenCalledWith('/api/github/workspace/file', expect.objectContaining({
                body: JSON.stringify({
                    path: mockBlueprint.path,
                    content: 'new content',
                    sha: mockBlueprint.sha,
                    forkName: 'test-user-fork',
                    isNew: false,
                    branchName: 'proposal/test-branch',
                })
            }));
            expect(updatedFile).not.toBeNull();
            expect(updatedFile?.sha).toBe('updated-sha');
        });

        test('should throw an error if branchName is missing', async () => {
             const { result } = renderHook(() => useGitHub(true, 'test-user'));
             await act(async () => {
                result.current.setForkName('test-user-fork');
            });
            await expect(result.current.updateFileOnGitHub(mockBlueprint.path, 'new content', mockBlueprint.sha, '')).rejects.toThrow('A branch name is required to update a file on GitHub.');
        });
    });

    describe('renameFile', () => {
        test('should send a PATCH request with branchName', async () => {
            const { result } = renderHook(() => useGitHub(true, 'test-user'));
            
            await act(async () => {
                result.current.setForkName('test-user/weval-configurations');
            });
            
            const newName = 'renamed-blueprint.yml';
            const oldPath = 'blueprints/users/test-user/old-blueprint.yml';
            const branchName = 'proposal/rename-branch';
            const renamedFileMock: BlueprintFile = {
                name: newName,
                path: `blueprints/users/test-user/${newName}`,
                sha: 'new-sha',
                isLocal: false,
                lastModified: new Date().toISOString(),
                branchName: branchName,
            };

            (fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => renamedFileMock,
            });

            let renamedFileResult: BlueprintFile | null = null;
            await act(async () => {
                renamedFileResult = await result.current.renameFile(oldPath, newName, branchName);
            });

            expect(fetch).toHaveBeenCalledWith('/api/github/workspace/file', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath, newName, forkName: 'test-user/weval-configurations', branchName }),
            });

            expect(renamedFileResult).toEqual({ ...renamedFileMock, branchName });
        });

        test('should return null and show toast on API error', async () => {
            const { result } = renderHook(() => useGitHub(true, 'test-user'));

            await act(async () => {
                result.current.setForkName('test-user/weval-configurations');
            });

            (fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                json: async () => ({ error: 'GitHub API failed' }),
            });
            
            let renamedFileResult: BlueprintFile | null = null;
            await act(async () => {
                renamedFileResult = await result.current.renameFile('old.yml', 'new.yml', 'test-branch');
            });

            expect(renamedFileResult).toBeNull();
            expect(mockToast).toHaveBeenCalledWith({
                variant: 'destructive',
                title: 'Error Renaming on GitHub',
                description: 'GitHub API failed',
            });
        });
    });
}); 