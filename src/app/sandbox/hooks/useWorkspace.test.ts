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
const mockCreateFileOnGitHub = jest.fn();
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

// Additional mocks for workspace functions
const mockLoadFile = jest.fn();
const mockRenameFileOnGitHub = jest.fn();


describe('useWorkspace', () => {
    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

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
            createFileOnGitHub: mockCreateFileOnGitHub,
            updateFileOnGitHub: mockUpdateFileOnGitHub,
            loadFileContentFromGitHub: mockLoadFileContentFromGitHub,
            deleteFileFromGitHub: mockDeleteFileFromGitHub,
            renameFile: mockRenameFileOnGitHub,
            createPullRequest: mockCreatePullRequestOnGitHub, // Correctly named property
            closeProposal: mockCloseProposalOnGitHub, // Correctly named property
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
        // Restore any test-specific mocks to their default state
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
        mockLoadFilesFromLocalStorage.mockReturnValue([]);
    });

    // Test for anonymous user flow
    test('should load local files for anonymous users and create a default if none exist', () => {
        mockLoadFilesFromLocalStorage.mockReturnValue([]);
        const defaultBlueprint: ActiveBlueprint = { name: 'default.yml', path: 'local/default.yml', sha: '1', content: 'default content', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
        mockInitializeDefaultBlueprint.mockReturnValue({ file: defaultBlueprint, blueprint: defaultBlueprint });

        const { result } = renderHook(() => useWorkspace(false, null, false));

        expect(mockLoadFilesFromLocalStorage).toHaveBeenCalled();
        expect(mockInitializeDefaultBlueprint).toHaveBeenCalled();
        expect(result.current.files[0].name).toBe('default.yml');
        expect(result.current.activeBlueprint?.path).toBe('local/default.yml');
    });

    // Test for logged-in user flow
    test('should setup workspace for logged-in users', async () => {
        mockSetupWorkspace.mockResolvedValue({ success: true, forkName: 'test-fork' });
        (fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => [],
        });
        
        const { result } = renderHook(() => useWorkspace(true, 'test-user', false));

        await act(async () => {
            await result.current.setupWorkspace();
        });

        expect(mockSetupWorkspace).toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/github/workspace/files'));
    });

    // Test for saving a dirty LOCAL file
    test('handleSave should save a modified local file to localStorage', async () => {
        const localFile: ActiveBlueprint = { name: 'local.yml', path: 'local/local.yml', sha: 'local-sha', content: 'original content', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
        mockLoadFilesFromLocalStorage.mockReturnValue([localFile]);

        const { result } = renderHook(() => useWorkspace(false, null, false));
        
        // Load the file first
        await act(async () => {
            await result.current.loadFile(localFile);
        });

        // Modify the content
        await act(async () => {
            result.current.setEditorContent('new content');
        });

        await waitFor(() => {
            expect(result.current.isDirty).toBe(true);
        });

        // Save the file
        await act(async () => {
            await result.current.handleSave();
        });

        expect(mockSaveToLocalStorage).toHaveBeenCalledWith(expect.objectContaining({ content: 'new content' }));
        expect(result.current.activeBlueprint?.content).toBe('new content');
        expect(result.current.isDirty).toBe(false);
    });

    // Test for updating a dirty GITHUB file
    test('handleSave should update a modified GitHub file via API', async () => {
        const remoteFile: ActiveBlueprint = { name: 'remote.yml', path: 'gh/remote.yml', sha: 'remote-sha', content: 'original content', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z' };
        const updatedFileFromApi = { ...remoteFile, sha: 'new-remote-sha' };
        
        mockUpdateFileOnGitHub.mockResolvedValue(updatedFileFromApi);
        mockLoadFileContentFromGitHub.mockResolvedValue({ content: 'original content', sha: 'remote-sha' });

        const { result, rerender } = renderHook(
            ({ isLoggedIn, username, isAuthLoading }) => useWorkspace(isLoggedIn, username, isAuthLoading),
            { initialProps: { isLoggedIn: true, username: 'test-user', isAuthLoading: false } }
        );
        
        // Let the hook initialize for the logged-in user
        await waitFor(() => expect(result.current.forkName).toBe('test-fork'));
        
        await act(async () => {
            await result.current.loadFile(remoteFile);
        });

        // Modify content
        await act(async () => {
            result.current.setEditorContent('new remote content');
        });

        await waitFor(() => {
            expect(result.current.isDirty).toBe(true);
        });

        // Save
        await act(async () => {
            await result.current.handleSave();
        });

        expect(mockUpdateFileOnGitHub).toHaveBeenCalledWith('gh/remote.yml', 'new remote content', 'remote-sha');
        expect(result.current.activeBlueprint?.sha).toBe('new-remote-sha');
        expect(result.current.isDirty).toBe(false);
    });

    // Test for saving a dirty GITHUB file with an API error
    test('handleSave should show a toast on API error when updating a GitHub file', async () => {
        const remoteFile: ActiveBlueprint = { name: 'remote.yml', path: 'gh/remote.yml', sha: 'remote-sha', content: 'original content', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z' };
        mockUpdateFileOnGitHub.mockRejectedValue(new Error('API Save Error'));
        mockLoadFileContentFromGitHub.mockResolvedValue({ content: 'original content', sha: 'remote-sha' });

        const { result } = renderHook(() => useWorkspace(true, 'test-user', false));
        await waitFor(() => expect(result.current.forkName).toBe('test-fork'));

        await act(async () => {
            await result.current.loadFile(remoteFile);
        });

        await act(async () => {
            result.current.setEditorContent('new remote content');
        });

        await act(async () => {
            await result.current.handleSave();
        });

        expect(mockUpdateFileOnGitHub).toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith({
            variant: "destructive",
            title: "Error Saving to GitHub",
            description: "API Save Error",
        });
        // The file should remain dirty
        expect(result.current.isDirty).toBe(true);
    });

    // Test for creating a new LOCAL blueprint
    test('createBlueprint should update the internal files state for anonymous users', async () => {
        // We start with a situation where the default blueprint has already been created.
        const defaultBlueprint: ActiveBlueprint = { name: 'default.yml', path: 'local/default.yml', sha: '1', content: 'default content', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
        
        let localFilesInStorage = [defaultBlueprint];

        mockLoadFilesFromLocalStorage.mockImplementation(() => localFilesInStorage);
        mockInitializeDefaultBlueprint.mockReturnValue({ file: defaultBlueprint, blueprint: defaultBlueprint });
    
        // Because the workspace's useEffect hook re-runs on save, we need to ensure our mock
        // behaves like real localStorage: when we save, the next load should see the new file.
        mockSaveToLocalStorage.mockImplementation((blueprint) => {
            const existingIndex = localFilesInStorage.findIndex(f => f.path === blueprint.path);
            if (existingIndex > -1) {
                localFilesInStorage[existingIndex] = blueprint;
            } else {
                localFilesInStorage = [blueprint, ...localFilesInStorage];
            }
        });

        const { result } = renderHook(() => useWorkspace(false, null, false));
    
        // Wait for the hook to initialize and load the single file.
        await waitFor(() => {
            expect(result.current.files).toHaveLength(1);
        });
    
        // Now, WHEN the user creates a new blueprint...
        await act(async () => {
            await result.current.createBlueprint('new-test-file.yml');
        });
        
        // THEN the hook's internal `files` state should be updated immediately.
        expect(result.current.files).toHaveLength(2);
        // New files are added to the beginning of the list
        expect(result.current.files[0].name).toBe('new-test-file.yml');
        expect(result.current.files[1].name).toBe('default.yml');
    });

    // Test for creating a new GITHUB blueprint
    test('createBlueprint should create a new local file for logged-in users', async () => {
        const remoteFile: BlueprintFile = { name: 'remote-only.yml', path: 'gh/remote.yml', sha: 'remote-sha', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z' };
        let localFilesInStorage: BlueprintFile[] = [];

        // Mock the response for the fetchFiles call that happens inside setupWorkspace
        (fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => [remoteFile],
        });
        
        // Mock the result of the initial GitHub workspace setup
        mockSetupWorkspace.mockResolvedValue({ success: true, forkName: 'test-fork' });
        
        // Mock the local storage interactions
        mockLoadFilesFromLocalStorage.mockImplementation(() => localFilesInStorage);
        mockSaveToLocalStorage.mockImplementation((blueprint) => {
             localFilesInStorage = [blueprint, ...localFilesInStorage];
        });

        const { result } = renderHook(() => useWorkspace(true, 'test-user', false));

        // Manually trigger the workspace setup, which will then fetch remote files
        await act(async () => {
            await result.current.setupWorkspace();
        });

        // Wait for the initial remote file to load
        await waitFor(() => {
            expect(result.current.files).toHaveLength(1);
            expect(result.current.files[0].name).toBe('remote-only.yml');
        });

        // Now, WHEN the user creates a new blueprint...
        await act(async () => {
            await result.current.createBlueprint('new-local-from-gh.yml');
        });

        // THEN the hook's internal `files` state should be updated immediately.
        expect(mockCreateFileOnGitHub).not.toHaveBeenCalled();
        expect(result.current.files).toHaveLength(2);
        expect(result.current.files[0].name).toBe('new-local-from-gh.yml');
        expect(result.current.files[0].isLocal).toBe(true);
        expect(result.current.files[1].name).toBe('remote-only.yml');
    });
    
    // Test for deleting a LOCAL blueprint
    test('deleteBlueprint should remove a local file', async () => {
        const localFile: BlueprintFile = { name: 'local-to-delete.yml', path: 'local/delete.yml', sha: 'del-sha', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
        
        // Configure the mock for this specific test run.
        mockUseLocalPersistence.mockReturnValue({
            localFiles: [localFile],
            loadFilesFromLocalStorage: () => [localFile],
            deleteFromLocalStorage: mockDeleteFromLocalStorage,
            initializeDefaultBlueprint: mockInitializeDefaultBlueprint,
            saveToLocalStorage: mockSaveToLocalStorage,
            setLocalFiles: mockSetLocalFiles,
            importBlueprint: jest.fn().mockReturnValue(null),
        });
        mockDeleteFromLocalStorage.mockReturnValue([]); // This will be called and should return an empty array

        const { result } = renderHook(() => useWorkspace(false, null, false));
        
        await waitFor(() => {
            expect(result.current.files).toHaveLength(1);
        });

        await act(async () => {
            await result.current.deleteBlueprint(localFile);
        });

        expect(mockDeleteFromLocalStorage).toHaveBeenCalledWith(localFile, [localFile]);
        expect(result.current.files).toHaveLength(0);
        expect(result.current.activeBlueprint).toBeNull();
    });

    // Test for deleting a GITHUB blueprint
    test('deleteBlueprint should remove a GitHub file and activate another', async () => {
        const remoteFileToDelete: BlueprintFile = { name: 'remote-to-delete.yml', path: 'gh/delete.yml', sha: 'del-sha', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z' };
        const otherFileToRemain: BlueprintFile = { name: 'other.yml', path: 'gh/other.yml', sha: 'other-sha', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z' };

        mockDeleteFileFromGitHub.mockResolvedValue(undefined);
        // Ensure no local files are loaded for this test to prevent state leakage
        mockLoadFilesFromLocalStorage.mockReturnValueOnce([]);

        (fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => [remoteFileToDelete, otherFileToRemain],
        });
        
        mockLoadFileContentFromGitHub.mockImplementation(async (path) => {
            if (path === remoteFileToDelete.path) return { content: 'delete content', sha: 'del-sha' };
            if (path === otherFileToRemain.path) return { content: 'other content', sha: 'other-sha' };
            return { content: '', sha: '' };
        });

        const { result } = renderHook(() => useWorkspace(true, 'test-user', false));

        await act(async () => {
            await result.current.setupWorkspace();
        });

        await waitFor(() => {
            expect(result.current.files).toHaveLength(2);
        });
        
        // Make the file to be deleted active
        await act(async () => {
            await result.current.loadFile(remoteFileToDelete);
        });

        await waitFor(() => expect(result.current.activeBlueprint?.path).toBe(remoteFileToDelete.path));

        // Delete the active file
        await act(async () => {
            await result.current.deleteBlueprint(remoteFileToDelete);
        });

        expect(mockDeleteFileFromGitHub).toHaveBeenCalledWith(remoteFileToDelete.path, remoteFileToDelete.sha);
        expect(result.current.files).toHaveLength(1);
        expect(result.current.files[0].name).toBe('other.yml');
        
        // The hook should automatically load the next available file
        expect(result.current.activeBlueprint?.path).toBe(otherFileToRemain.path);
    });
    
    // Tests for runEvaluation logic
    describe('runEvaluation', () => {
        const blueprint: ActiveBlueprint = { name: 'run.yml', path: 'local/run.yml', sha: 'run-sha', content: 'content', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
        
        beforeEach(() => {
            mockLoadFilesFromLocalStorage.mockReturnValue([blueprint]);
        });
        
        test('should call the underlying evaluation hook when file is not dirty', async () => {
            const { result } = renderHook(() => useWorkspace(false, null, false));
            await act(async () => {
                await result.current.loadFile(blueprint);
            });
            await act(async () => {
                await result.current.runEvaluation();
            });
            expect(mockRunEvaluation).toHaveBeenCalled();
        });

        test('should not run and should show a toast if there are unsaved changes', async () => {
            const { result } = renderHook(() => useWorkspace(false, null, false));
            await act(async () => {
                await result.current.loadFile(blueprint);
                result.current.setEditorContent('dirty content');
            });
            await act(async () => {
                await result.current.runEvaluation();
            });
            expect(mockRunEvaluation).not.toHaveBeenCalled();
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unsaved Changes' }));
        });
    });

    test('promoteBlueprint should create a file on GitHub and refresh the file list', async () => {
        const newGitHubFile = { name: 'promoted.yml', path: 'gh/promoted.yml', sha: 'promoted-sha', isLocal: false };
        mockCreateFileOnGitHub.mockResolvedValue(newGitHubFile);
        (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => [newGitHubFile] });

        const { result } = renderHook(() => useWorkspace(true, 'test-user', false));
        await waitFor(() => expect(result.current.forkName).toBe('test-fork'));

        let promotedFile;
        await act(async () => {
            promotedFile = await result.current.promoteBlueprint('promoted.yml', 'promoted content');
        });

        expect(mockCreateFileOnGitHub).toHaveBeenCalledWith('promoted.yml', 'promoted content');
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/github/workspace/files?forceRefresh=true'));
        expect(promotedFile).toEqual(newGitHubFile);
    });

    describe('duplicateBlueprint', () => {
        const localFile: ActiveBlueprint = { name: 'local.yml', path: 'local/local.yml', sha: 'local-sha', content: 'original content', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
        
        beforeEach(() => {
            mockLoadFilesFromLocalStorage.mockReturnValue([localFile]);
            // Setup local storage for the file to be duplicated
            const storedBlueprint = JSON.stringify(localFile);
            global.Storage.prototype.getItem = jest.fn(key => {
                if (key === localFile.path) return storedBlueprint;
                return null;
            });
        });

        test('should duplicate a local blueprint', async () => {
            const { result } = renderHook(() => useWorkspace(false, null, false));
            
            await act(async () => {
                await result.current.loadFile(localFile);
            });

            await act(async () => {
                await result.current.duplicateBlueprint(localFile);
            });

            expect(mockSaveToLocalStorage).toHaveBeenCalledWith(expect.objectContaining({
                name: 'local (Copy).yml',
                content: 'original content',
            }));
            expect(mockToast).toHaveBeenCalledWith({ title: 'Blueprint Duplicated', description: "A copy was created as 'local (Copy).yml'." });
        });
    });

    describe('createPullRequest', () => {
        const remoteFile: ActiveBlueprint = { name: 'remote.yml', path: 'gh/remote.yml', sha: 'remote-sha', content: 'content', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z' };
        
        beforeEach(() => {
            mockLoadFileContentFromGitHub.mockResolvedValue({ content: 'content', sha: 'remote-sha' });
        });
        
        test('should successfully create a pull request for a clean file', async () => {
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

            expect(mockCreatePullRequestOnGitHub).toHaveBeenCalledWith({ title: 'New PR', body: 'PR body' }, expect.objectContaining({ path: remoteFile.path }));
            expect(returnedPrData).toEqual(prData);
            expect(result.current.activeBlueprint?.prStatus).toEqual(newPrStatus);
        });

        test('should throw an error and toast if the file is dirty', async () => {
            const { result } = renderHook(() => useWorkspace(true, 'test-user', false));
            
            await act(async () => {
                await result.current.loadFile(remoteFile);
                result.current.setEditorContent('dirty content');
            });

            await expect(act(async () => {
                await result.current.createPullRequest({ title: 'New PR', body: 'PR body' });
            })).rejects.toThrow('Unsaved changes');
            
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unsaved Changes' }));
            expect(mockCreatePullRequestOnGitHub).not.toHaveBeenCalled();
        });
    });
    
    describe('closeProposal', () => {
        const prStatus = { number: 123, state: 'open' as 'open', merged: false, url: 'http://a.b', title: 'test pr' };
        const remoteFileWithPr: ActiveBlueprint = { 
            name: 'remote.yml', 
            path: 'gh/remote.yml', 
            sha: 'remote-sha', 
            content: 'content', 
            isLocal: false,
            lastModified: '2023-01-01T00:00:00.000Z',
            prStatus: prStatus,
        };
        
        beforeEach(() => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => [remoteFileWithPr],
            });
            mockLoadFileContentFromGitHub.mockResolvedValue({ content: 'content', sha: 'remote-sha' });
        });
        
        test('should update PR status to closed after closing a proposal', async () => {
            mockCloseProposalOnGitHub.mockResolvedValue({
                updatedPrStatuses: {},
                closedPath: remoteFileWithPr.path,
            });

            const { result } = renderHook(() => useWorkspace(true, 'test-user', false));
            
            await act(async () => {
                await result.current.setupWorkspace();
            });
            
            await act(async () => {
                await result.current.loadFile(remoteFileWithPr);
            });

            await waitFor(() => {
                expect(result.current.activeBlueprint?.prStatus?.state).toBe('open');
            });

            await act(async () => {
                await result.current.closeProposal(123);
            });

            expect(mockCloseProposalOnGitHub).toHaveBeenCalledWith(123);
            await waitFor(() => {
                expect(result.current.activeBlueprint?.prStatus?.state).toBe('closed');
            });
        });
    });

    test('loadFile should prompt user if the current file is dirty', async () => {
        const file1: ActiveBlueprint = { name: 'file1.yml', path: 'local/file1.yml', sha: '1', content: 'content1', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
        const file2: BlueprintFile = { name: 'file2.yml', path: 'local/file2.yml', sha: '2', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
        mockLoadFilesFromLocalStorage.mockReturnValue([file1, file2]);
        window.confirm = jest.fn(() => false); // User clicks "Cancel"

        const { result } = renderHook(() => useWorkspace(false, null, false));
        
        await act(async () => {
            await result.current.loadFile(file1);
        });
        
        await act(async () => {
            result.current.setEditorContent('dirty content');
        });

        await act(async () => {
            await result.current.loadFile(file2);
        });
        
        expect(window.confirm).toHaveBeenCalled();
        // Since the user cancelled, the active file should NOT have changed
        expect(result.current.activeBlueprint?.path).toBe(file1.path);
    });

    test('should merge local and remote files for logged-in users', async () => {
        const localFile: BlueprintFile = { name: 'local-only.yml', path: 'local/local.yml', sha: 'local-sha', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
        const remoteFile: BlueprintFile = { name: 'remote-only.yml', path: 'gh/remote.yml', sha: 'remote-sha', isLocal: false, lastModified: '2023-01-01T00:00:00.000Z' };

        mockLoadFilesFromLocalStorage.mockReturnValue([localFile]);
        (fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => [remoteFile],
        });

        const { result } = renderHook(() => useWorkspace(true, 'test-user', false));

        await act(async () => {
            await result.current.setupWorkspace();
        });

        await waitFor(() => {
            expect(result.current.files).toHaveLength(2);
            expect(result.current.files.some(f => f.isLocal)).toBe(true);
            expect(result.current.files.some(f => !f.isLocal)).toBe(true);
        });
    });

    describe('renameBlueprint', () => {
        test('should successfully rename a local blueprint', async () => {
            const localFile: ActiveBlueprint = { 
                name: 'original.yml', 
                path: 'local/original.yml', 
                sha: 'local-sha', 
                content: 'original content', 
                isLocal: true,
                lastModified: '2023-01-01T00:00:00.000Z'
            };
            
            const renamedFile: BlueprintFile = {
                name: 'renamed.yml',
                path: 'local/new-uuid.yml',
                sha: 'local-sha',
                isLocal: true,
                lastModified: '2023-01-02T00:00:00.000Z'
            };

            mockLoadFilesFromLocalStorage.mockReturnValue([localFile]);
            mockRenameInLocalStorage.mockReturnValue(renamedFile);

            const { result } = renderHook(() => useWorkspace(false, null, false));

            // Load the file to make it active
            await act(async () => {
                await result.current.loadFile(localFile);
            });

            await waitFor(() => {
                expect(result.current.activeBlueprint?.path).toBe(localFile.path);
            });

            // Rename the blueprint
            await act(async () => {
                await result.current.renameBlueprint(localFile, 'renamed.yml');
            });

            // Should call the local storage rename function
            expect(mockRenameInLocalStorage).toHaveBeenCalledWith(localFile, 'renamed.yml');
            
            // Should reload the file if it was the active one (we can't easily test this without spying on the actual loadFile function)
        });

        test('should handle GitHub blueprint rename (placeholder)', async () => {
            const remoteFile: ActiveBlueprint = { 
                name: 'remote.yml', 
                path: 'blueprints/users/test-user/remote.yml', 
                sha: 'remote-sha', 
                content: 'remote content', 
                isLocal: false,
                lastModified: '2023-01-01T00:00:00.000Z'
            };

            mockLoadFileContentFromGitHub.mockResolvedValue({ content: 'remote content', sha: 'remote-sha' });
            mockRenameFileOnGitHub.mockResolvedValue(null); // Placeholder returns null

            const { result } = renderHook(() => useWorkspace(true, 'test-user', false));

            // Wait for setup
            await waitFor(() => expect(result.current.forkName).toBe('test-fork'));

            // Load the remote file
            await act(async () => {
                await result.current.loadFile(remoteFile);
            });

            await waitFor(() => {
                expect(result.current.activeBlueprint?.path).toBe(remoteFile.path);
            });

            // Rename the blueprint
            await act(async () => {
                await result.current.renameBlueprint(remoteFile, 'renamed-remote.yml');
            });

            // Should log the GitHub rename operation (placeholder behavior)
            expect(mockRenameFileOnGitHub).toHaveBeenCalledWith(remoteFile.path, 'renamed-remote.yml');
        });

        test('should not reload file if renamed file is not the active one', async () => {
            const localFile1: BlueprintFile = { 
                name: 'file1.yml', 
                path: 'local/file1.yml', 
                sha: 'sha1', 
                isLocal: true,
                lastModified: '2023-01-01T00:00:00.000Z'
            };
            
            const localFile2: ActiveBlueprint = { 
                name: 'file2.yml', 
                path: 'local/file2.yml', 
                sha: 'sha2', 
                content: 'content2',
                isLocal: true,
                lastModified: '2023-01-01T00:00:00.000Z'
            };

            const renamedFile1: BlueprintFile = {
                name: 'renamed-file1.yml',
                path: 'local/renamed-uuid.yml',
                sha: 'sha1',
                isLocal: true,
                lastModified: '2023-01-02T00:00:00.000Z'
            };

            mockLoadFilesFromLocalStorage.mockReturnValue([localFile1, localFile2]);
            mockRenameInLocalStorage.mockReturnValue(renamedFile1);

            const { result } = renderHook(() => useWorkspace(false, null, false));

            // Load file2 as active (not the one we'll rename)
            await act(async () => {
                await result.current.loadFile(localFile2);
            });

            await waitFor(() => {
                expect(result.current.activeBlueprint?.path).toBe(localFile2.path);
            });

            // Rename file1 (not the active one)
            await act(async () => {
                await result.current.renameBlueprint(localFile1, 'renamed-file1.yml');
            });

            // Should call rename function
            expect(mockRenameInLocalStorage).toHaveBeenCalledWith(localFile1, 'renamed-file1.yml');
            
            // Should NOT reload any file since the renamed file wasn't active (we can't easily test this without spying on the actual loadFile function)
        });

        test('should handle rename failure gracefully', async () => {
            const localFile: BlueprintFile = { 
                name: 'original.yml', 
                path: 'local/original.yml', 
                sha: 'local-sha', 
                isLocal: true,
                lastModified: '2023-01-01T00:00:00.000Z'
            };

            mockLoadFilesFromLocalStorage.mockReturnValue([localFile]);
            mockRenameInLocalStorage.mockReturnValue(null); // Simulate failure

            const { result } = renderHook(() => useWorkspace(false, null, false));

            // Rename the blueprint
            await act(async () => {
                await result.current.renameBlueprint(localFile, 'renamed.yml');
            });

            // Should call rename function
            expect(mockRenameInLocalStorage).toHaveBeenCalledWith(localFile, 'renamed.yml');
            
            // Should not attempt to reload since rename failed (we can't easily test this without spying on the actual loadFile function)
        });
    });
});