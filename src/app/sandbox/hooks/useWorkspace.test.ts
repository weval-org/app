import { renderHook, act, waitFor } from '@testing-library/react';
import { useWorkspace, ActiveBlueprint, BlueprintFile } from './useWorkspace';
import { useGitHub } from './useGitHub';
import { useEvaluation } from './useEvaluation';
import { useLocalPersistence } from './useLocalPersistence';
import { useToast } from '@/components/ui/use-toast';

// Mock the dependent hooks and services
jest.mock('./useGitHub');
jest.mock('./useEvaluation');
jest.mock('./useLocalPersistence');
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({
        toast: mockToast,
    }),
}));
global.fetch = jest.fn();

// Setup mock implementations
const mockUseGitHub = useGitHub as jest.Mock;
const mockUseEvaluation = useEvaluation as jest.Mock;
const mockUseLocalPersistence = useLocalPersistence as jest.Mock;

const mockSetForkName = jest.fn();
const mockSetupWorkspace = jest.fn();
const mockPromoteBlueprintToBranch = jest.fn();
const mockUpdateFileOnGitHub = jest.fn();
const mockLoadFileContentFromGitHub = jest.fn();
const mockDeleteFileFromGitHub = jest.fn();
const mockSetIsSyncingWithGitHub = jest.fn();
const mockSetSetupMessage = jest.fn();
const mockCreatePullRequestOnGitHub = jest.fn();
const mockCloseProposalOnGitHub = jest.fn();

const mockRunEvaluation = jest.fn();

const mockLoadFilesFromLocalStorage = jest.fn();
const mockInitializeDefaultBlueprint = jest.fn();
const mockSaveToLocalStorage = jest.fn();
const mockDeleteFromLocalStorage = jest.fn();
const mockRenameInLocalStorage = jest.fn();
const mockSetLocalFiles = jest.fn();

const mockRenameFileOnGitHub = jest.fn();


describe('useWorkspace', () => {
    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        const defaultBlueprint: ActiveBlueprint = { name: 'default.yml', path: 'local/default.yml', sha: '1', content: 'default content', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
        mockLoadFilesFromLocalStorage.mockReturnValue([]);
        mockInitializeDefaultBlueprint.mockReturnValue({ file: defaultBlueprint, blueprint: defaultBlueprint });

        mockUseGitHub.mockReturnValue({
            forkName: 'test-fork',
            prStatuses: {},
            forkCreationRequired: false,
            isSyncingWithGitHub: false,
            setupMessage: '',
            setForkName: mockSetForkName,
            setForkCreationRequired: jest.fn(),
            setIsSyncingWithGitHub: mockSetIsSyncingWithGitHub,
            setSetupMessage: mockSetSetupMessage,
            setupWorkspace: mockSetupWorkspace,
            promoteBlueprintToBranch: mockPromoteBlueprintToBranch,
            updateFileOnGitHub: mockUpdateFileOnGitHub,
            loadFileContentFromGitHub: mockLoadFileContentFromGitHub,
            deleteFileFromGitHub: mockDeleteFileFromGitHub,
            renameFile: mockRenameFileOnGitHub,
            createPullRequest: mockCreatePullRequestOnGitHub,
            closeProposal: mockCloseProposalOnGitHub,
        });

        mockUseEvaluation.mockReturnValue({
            runId: null,
            runStatus: { status: 'idle' },
            runHistory: [],
            runEvaluation: mockRunEvaluation,
            setRunStatus: jest.fn(),
            setRunId: jest.fn(),
        });

        mockUseLocalPersistence.mockReturnValue({
            localFiles: [],
            loadFilesFromLocalStorage: mockLoadFilesFromLocalStorage,
            initializeDefaultBlueprint: mockInitializeDefaultBlueprint,
            saveToLocalStorage: mockSaveToLocalStorage,
            deleteFromLocalStorage: mockDeleteFromLocalStorage,
            renameInLocalStorage: mockRenameInLocalStorage,
            setLocalFiles: mockSetLocalFiles,
            importBlueprint: jest.fn().mockReturnValue(null),
        });

        // Mock localStorage
        const store: Record<string, string> = {};
        global.Storage.prototype.getItem = jest.fn(key => store[key] || null);
        global.Storage.prototype.setItem = jest.fn((key, value) => {
            store[key] = value.toString();
        });
    });

    afterEach(() => {
        mockLoadFilesFromLocalStorage.mockReturnValue([]);
    });

    // Test for saving a dirty GITHUB file
    test('handleSave should update a modified GitHub file via API on its branch', async () => {
        const remoteFile: ActiveBlueprint = { name: 'remote.yml', path: 'gh/remote.yml', sha: 'remote-sha', content: 'original content', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z', branchName: 'proposal/test-branch' };
        const updatedFileFromApi = { ...remoteFile, sha: 'new-remote-sha' };
        
        mockUpdateFileOnGitHub.mockResolvedValue(updatedFileFromApi);
        mockLoadFileContentFromGitHub.mockResolvedValue({ content: 'original content', sha: 'remote-sha' });

        const { result } = renderHook(() => useWorkspace(true, 'test-user', false));
        
        await act(async () => {
            await result.current.loadFile(remoteFile);
        });

        await act(async () => {
            result.current.setEditorContent('new remote content');
        });

        await act(async () => {
            await result.current.handleSave();
        });

        expect(mockUpdateFileOnGitHub).toHaveBeenCalledWith('gh/remote.yml', 'new remote content', 'remote-sha', 'proposal/test-branch');
        expect(result.current.activeBlueprint?.sha).toBe('new-remote-sha');
        expect(result.current.isDirty).toBe(false);
    });

    test('handleSave should fail if the GitHub file is not on a feature branch', async () => {
        const remoteFileOnMain: ActiveBlueprint = { name: 'remote.yml', path: 'gh/remote.yml', sha: 'remote-sha', content: 'original content', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z', branchName: 'main' };
        
        mockLoadFileContentFromGitHub.mockResolvedValue({ content: 'original content', sha: 'remote-sha' });

        const { result } = renderHook(() => useWorkspace(true, 'test-user', false));
        
        await act(async () => {
            await result.current.loadFile(remoteFileOnMain);
        });

        await act(async () => {
            result.current.setEditorContent('new remote content');
        });

        await act(async () => {
            await result.current.handleSave();
        });

        expect(mockUpdateFileOnGitHub).not.toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cannot Save' }));
    });

    test('handleSave should handle API failure gracefully when updating a GitHub file', async () => {
        const remoteFile: ActiveBlueprint = { name: 'remote.yml', path: 'gh/remote.yml', sha: 'remote-sha', content: 'original content', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z', branchName: 'proposal/test-branch' };
        
        // Mock the API to reject, which will be caught by useWorkspace's handleSave
        const apiError = new Error('GitHub API is down');
        mockUpdateFileOnGitHub.mockRejectedValue(apiError);
        mockLoadFileContentFromGitHub.mockResolvedValue({ content: 'original content', sha: 'remote-sha' });

        const { result } = renderHook(() => useWorkspace(true, 'test-user', false));
        
        await act(async () => {
            await result.current.loadFile(remoteFile);
        });

        await act(async () => {
            result.current.setEditorContent('new remote content');
        });
        
        expect(result.current.isDirty).toBe(true);

        await act(async () => {
            await result.current.handleSave();
        });

        expect(mockUpdateFileOnGitHub).toHaveBeenCalled();
        expect(result.current.status).toBe('ready'); // from finally block
        expect(result.current.isDirty).toBe(true); // save failed, should still be dirty
        expect(mockToast).toHaveBeenCalledWith({ // from catch block in useWorkspace
            variant: "destructive",
            title: "Error Saving to GitHub",
            description: apiError.message,
        });
    });

    // Test for promoting a local file to a new branch
    test('promoteBlueprint should create a file on GitHub on a new branch and refresh', async () => {
        const newGitHubFile = { name: 'promoted.yml', path: 'gh/promoted.yml', sha: 'promoted-sha', isLocal: false, branchName: 'proposal/new-branch' };
        mockPromoteBlueprintToBranch.mockResolvedValue(newGitHubFile);
        (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => [newGitHubFile] });

        const { result } = renderHook(() => useWorkspace(true, 'test-user', false));

        let promotedFile;
        await act(async () => {
            promotedFile = await result.current.promoteBlueprint('promoted.yml', 'promoted content');
        });

        expect(mockPromoteBlueprintToBranch).toHaveBeenCalledWith('promoted.yml', 'promoted content');
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/github/workspace/files?forceRefresh=true'));
        expect(promotedFile).toEqual(newGitHubFile);
    });

    // Test for deleting a GITHUB blueprint
    test('deleteBlueprint should remove a GitHub file from its branch', async () => {
        const remoteFileToDelete: BlueprintFile = { name: 'remote-to-delete.yml', path: 'gh/delete.yml', sha: 'del-sha', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z', branchName: 'proposal/delete-branch' };
        
        mockDeleteFileFromGitHub.mockResolvedValue(undefined);
        
        const { result } = renderHook(() => useWorkspace(true, 'test-user', false));

        await act(async () => {
            await result.current.deleteBlueprint(remoteFileToDelete);
        });

        expect(mockDeleteFileFromGitHub).toHaveBeenCalledWith(remoteFileToDelete.path, remoteFileToDelete.sha, remoteFileToDelete.branchName);
    });
    
    // Test for creating a pull request
    describe('createPullRequest', () => {
        const remoteFile: ActiveBlueprint = { name: 'remote.yml', path: 'gh/remote.yml', sha: 'remote-sha', content: 'content', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z', branchName: 'proposal/test-branch' };
        
        beforeEach(() => {
            mockLoadFileContentFromGitHub.mockResolvedValue({ content: 'content', sha: 'remote-sha' });
        });
        
        test('should successfully create a pull request for a file on a branch', async () => {
            const prData = { number: 123, html_url: 'http://pr.url' };
            const newPrStatus = { number: 123, state: 'open', merged: false, url: 'http://pr.url', title: 'New PR' };
            mockCreatePullRequestOnGitHub.mockResolvedValue({ prData, newPrStatus });

            const { result } = renderHook(() => useWorkspace(true, 'test-user', false));
            
            await act(async () => {
                await result.current.loadFile(remoteFile);
            });
            
            let returnedPrData;
            await act(async () => {
                returnedPrData = await result.current.createPullRequest({ title: 'New PR', body: 'PR body' });
            });

            expect(mockCreatePullRequestOnGitHub).toHaveBeenCalledWith({ title: 'New PR', body: 'PR body' }, expect.objectContaining({ path: remoteFile.path, branchName: remoteFile.branchName }));
            expect(returnedPrData).toEqual(prData);
            expect(result.current.activeBlueprint?.prStatus).toEqual(newPrStatus);
        });

        test('should handle failure when creating a pull request', async () => {
            const error = new Error('GitHub PR API is down');
            mockCreatePullRequestOnGitHub.mockRejectedValue(error);
        
            const { result } = renderHook(() => useWorkspace(true, 'test-user', false));
            
            await act(async () => {
                await result.current.loadFile(remoteFile);
            });
            
            // Expect the call to reject
            await act(async () => {
                await expect(result.current.createPullRequest({ title: 'New PR', body: 'PR body' }))
                    .rejects.toThrow('GitHub PR API is down');
            });
        
            // Status should be reset by the finally block
            expect(result.current.status).toBe('ready');
            // No PR status should be attached to the blueprint
            expect(result.current.activeBlueprint?.prStatus).toBeUndefined();
        });
    });

    // Test for renaming a blueprint
    describe('renameBlueprint', () => {
        test('should successfully rename a GitHub blueprint on its branch', async () => {
            const remoteFile: ActiveBlueprint = { name: 'remote.yml', path: 'gh/remote.yml', sha: 'remote-sha', content: 'remote content', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z', branchName: 'proposal/rename-branch' };
            const renamedFile: BlueprintFile = { ...remoteFile, name: 'renamed.yml', path: 'gh/renamed.yml' };

            mockLoadFileContentFromGitHub.mockResolvedValue({ content: 'remote content', sha: 'remote-sha' });
            mockRenameFileOnGitHub.mockResolvedValue(renamedFile);

            const { result } = renderHook(() => useWorkspace(true, 'test-user', false));

            await act(async () => {
                await result.current.loadFile(remoteFile);
            });

            await act(async () => {
                await result.current.renameBlueprint(remoteFile, 'renamed.yml');
            });

            expect(mockRenameFileOnGitHub).toHaveBeenCalledWith(remoteFile.path, 'renamed.yml', remoteFile.branchName);
        });
    });
});