'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { useEvaluation } from './useEvaluation';
import { useGitHub } from './useGitHub';
import { useLocalPersistence, DEFAULT_BLUEPRINT_CONTENT } from './useLocalPersistence';

export interface BlueprintFile {
    name: string;
    path: string;
    sha: string;
    isLocal: boolean;
    lastModified: string;
    prStatus?: PRStatus | null;
    branchName?: string;
}

export interface ActiveBlueprint extends BlueprintFile {
    content: string;
    resultUrl?: string;
}

export interface SandboxRunStatus {
    status: 'idle' | 'pending' | 'generating_responses' | 'evaluating' | 'saving' | 'complete' | 'error';
    message?: string;
    progress?: {
        completed: number;
        total: number;
    };
    resultUrl?: string;
}

export interface PRStatus {
    number: number;
    state: 'open' | 'closed';
    merged: boolean;
    url: string;
    title: string;
}

export interface RunResult {
  runId: string;
  resultUrl: string;
  completedAt: string; // ISO string
  blueprintName: string;
}

export type WorkspaceStatus = 'idle' | 'setting_up' | 'loading' | 'ready' | 'saving' | 'deleting' | 'creating_pr' | 'running_eval' | 'closing_pr';

export { DEFAULT_BLUEPRINT_CONTENT };

export function useWorkspace(
  isLoggedIn: boolean, 
  username: string | null,
  isAuthLoading: boolean,
) {
  console.log(`[useWorkspace] Hook init. isLoggedIn: ${isLoggedIn}, username: ${username}`);
  const { toast } = useToast();
  const [status, setStatusState] = useState<WorkspaceStatus>('idle');
  const [setupMessage, setSetupMessage] = useState<string>('');
  const [isFetchingFiles, setIsFetchingFiles] = useState(false);
  const [isFetchingFileContent, setIsFetchingFileContent] = useState(false);
  const [files, setFiles] = useState<BlueprintFile[]>([]);
  const [activeBlueprint, setActiveBlueprint] = useState<ActiveBlueprint | null>(null);

  // New state to track unsaved changes
  const [editorContent, setEditorContent] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const activeBlueprintRef = useRef(activeBlueprint);
  activeBlueprintRef.current = activeBlueprint;

  const { 
    runId, 
    runStatus, 
    runHistory, 
    runEvaluation: performRun,
    setRunStatus, 
    setRunId 
  } = useEvaluation(isLoggedIn, activeBlueprint);
  
  const {
    forkName,
    prStatuses,
    forkCreationRequired,
    isSyncingWithGitHub,
    setupMessage: setupGitHubMessage,
    setForkCreationRequired,
    setIsSyncingWithGitHub,
    setSetupMessage: setGitHubSetupMessage,
    setupWorkspace: setupGitHubWorkspace,
    updateFileOnGitHub,
    promoteBlueprintToBranch,
    createPullRequest: createPullRequestOnGitHub,
    closeProposal: closePullRequestOnGitHub,
    deleteFileFromGitHub,
    loadFileContentFromGitHub,
    renameFile: renameFileOnGitHub,
  } = useGitHub(isLoggedIn, username);

  const {
    localFiles,
    loadFilesFromLocalStorage,
    initializeDefaultBlueprint,
    saveToLocalStorage,
    deleteFromLocalStorage,
    renameInLocalStorage,
    importBlueprint,
    setLocalFiles,
  } = useLocalPersistence();

  const [deletingFilePath, setDeletingFilePath] = useState<string | null>(null);

  const prevIsLoggedIn = useRef(isLoggedIn);

  // Ref to hold the latest state that callbacks might need.
  const stateRef = useRef({ isLoggedIn, forkName });
  useEffect(() => {
    stateRef.current = { isLoggedIn, forkName };
  }, [isLoggedIn, forkName]);

  // Effect to update dirty status
  useEffect(() => {
    if (activeBlueprint && editorContent !== null) {
        setIsDirty(activeBlueprint.content !== editorContent);
    } else {
        setIsDirty(false);
    }
  }, [activeBlueprint, editorContent]);

  const loadFile = useCallback(async (file: BlueprintFile | ActiveBlueprint, options: { force?: boolean } = {}) => {
    const { force = false } = options;
    console.log(`[loadFile] Loading file: ${file.path}`);
    if (isDirty && !force) {
        const discard = window.confirm("You have unsaved changes that will be lost. Are you sure you want to switch files?");
        if (!discard) return;
    }
    
    if (activeBlueprintRef.current?.path === file.path) {
        console.log(`[loadFile] File already active, returning.`);
        return;
    }

    setIsFetchingFileContent(true);
    setEditorContent(null);

    try {
        if ('content' in file) { // It's already an ActiveBlueprint
            setActiveBlueprint(file);
            setEditorContent(file.content);
            return;
        }

        if (file.isLocal) {
            const storedBlueprint = window.localStorage.getItem(file.path);
            if (storedBlueprint) {
                const parsed = JSON.parse(storedBlueprint);
                setActiveBlueprint(parsed);
                setEditorContent(parsed.content);
            } else {
                throw new Error(`Could not find local blueprint with path: ${file.path}`);
            }
        } else {
            const { isLoggedIn: currentIsLoggedIn, forkName: currentForkName } = stateRef.current;
            if (!currentIsLoggedIn || !currentForkName) return;

            const { content, sha } = await loadFileContentFromGitHub(file.path, file.branchName);
            const loadedBlueprint = { ...file, content, sha };
            setActiveBlueprint(loadedBlueprint);
            setEditorContent(content);
        }
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error loading file', description: e.message });
    } finally {
        setIsFetchingFileContent(false);
    }
  }, [toast, isDirty, loadFileContentFromGitHub]);

  const fetchFiles = useCallback(async (forceRefresh = false, providedForkName?: string) => {
    const effectiveForkName = providedForkName || forkName;
    console.log(`[fetchFiles] Called with forceRefresh=${forceRefresh}, isLoggedIn=${isLoggedIn}, forkName=${effectiveForkName} (provided: ${providedForkName}, state: ${forkName}), status=${status}`);
    
    if (!isLoggedIn) {
        console.log('[fetchFiles] Not logged in, loading local files only');
        setFiles(loadFilesFromLocalStorage());
        return;
    }

    if (isFetchingFiles) {
        console.log('[fetchFiles] Already fetching files, returning early');
        return;
    }
    
    setIsFetchingFiles(true);
    setIsSyncingWithGitHub(true);
    
    if (status === 'setting_up') {
        setSetupMessage('Syncing with your GitHub repository...');
    }
    
    try {
        const localFilesFromDisk = loadFilesFromLocalStorage();
        setFiles(localFilesFromDisk);
        
        if (!effectiveForkName) {
            setIsFetchingFiles(false);
            setIsSyncingWithGitHub(false);
            return;
        }
        
        try {
            const response = await fetch(`/api/github/workspace/files?forceRefresh=${forceRefresh}&forkName=${encodeURIComponent(effectiveForkName)}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch files: ${response.statusText}`);
            }

            const remoteFiles = await response.json();
            const allFiles = [...localFilesFromDisk, ...remoteFiles];
            setFiles(allFiles);
            
            if (!activeBlueprint && allFiles.length > 0) {
                loadFile(allFiles[0]);
            }
        } catch (error: any) {
            console.error('[fetchFiles] GitHub API error:', error);
            toast({
                variant: 'destructive',
                title: 'GitHub Sync Failed',
                description: error.message,
            });
            setFiles(localFilesFromDisk);
        } finally {
            setIsFetchingFiles(false);
            setIsSyncingWithGitHub(false);
        }
    } catch (error: any) {
        console.error('[fetchFiles] Outer catch error:', error);
        toast({
            variant: 'destructive',
            title: 'GitHub Sync Failed',
            description: error.message,
        });
        setFiles(loadFilesFromLocalStorage());
        setIsFetchingFiles(false);
        setIsSyncingWithGitHub(false);
    }
  }, [isLoggedIn, status, isFetchingFiles, loadFilesFromLocalStorage, forkName, activeBlueprint, toast, loadFile, setSetupMessage, setIsSyncingWithGitHub]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (prevIsLoggedIn.current !== isLoggedIn) {
      setFiles([]);
      setActiveBlueprint(null);
      if (isLoggedIn) {
        // Previously, this cleared local files. Now we preserve them
        // so they can be merged with GitHub files upon login.
      } else {
        // When logging out, we clear the GitHub cache.
        window.localStorage.removeItem('sandboxV2_github_files_cache');
        window.localStorage.removeItem('sandboxV2_pr_statuses_cache');
      }
    }
    prevIsLoggedIn.current = isLoggedIn;

    if (isLoggedIn) {
      // Logged in: files will now be loaded EXCLUSIVELY by the `setupWorkspace` function
      // after it confirms the fork is ready. This prevents race conditions.
    } else {
        let currentLocalFiles = loadFilesFromLocalStorage();
        const importedBlueprint = importBlueprint();

        if (importedBlueprint) {
            let finalName = importedBlueprint.name;
            let counter = 2;
            while(currentLocalFiles.some((f: BlueprintFile) => f.name === finalName)) {
                finalName = `${importedBlueprint.name.replace(/\.yml$/, '')} (${counter}).yml`;
                counter++;
            }
            const finalBlueprint = { ...importedBlueprint, name: finalName, path: `local/${uuidv4()}_${finalName}` };
            
            saveToLocalStorage(finalBlueprint);
            currentLocalFiles = [finalBlueprint, ...currentLocalFiles];
            
            setFiles(currentLocalFiles);
            setLocalFiles(currentLocalFiles);
            loadFile(finalBlueprint);
            return;
        }

        if (currentLocalFiles.length === 0) {
            const { file } = initializeDefaultBlueprint();
            currentLocalFiles = [file];
        }
        setFiles(currentLocalFiles);
        if (currentLocalFiles.length > 0 && !activeBlueprint) {
            loadFile(currentLocalFiles[0]);
        }
    }
  }, [isAuthLoading, isLoggedIn, status, fetchFiles, toast, loadFile, activeBlueprint, loadFilesFromLocalStorage, initializeDefaultBlueprint, importBlueprint, saveToLocalStorage, setLocalFiles]);

  const runEvaluation = useCallback(async (models?: string[]) => {
    if (!activeBlueprint) {
        toast({ variant: 'destructive', title: 'No blueprint selected', description: 'Please select a blueprint to run an evaluation.'});
        return;
    }

    if (isDirty) {
        toast({ variant: 'destructive', title: 'Unsaved Changes', description: 'Please save your changes before running an evaluation.' });
        return;
    }

    setStatus('running_eval');
    try {
        await performRun(models);
    } finally {
        setStatus('ready');
    }
  }, [activeBlueprint, toast, performRun, isDirty]);
  
  const handleSave = async () => {
    if (!activeBlueprint || !editorContent || !isDirty) return;

    setStatus('saving');
    try {
        if (activeBlueprint.isLocal) {
            const updatedBlueprint = { ...activeBlueprint, content: editorContent };
            saveToLocalStorage(updatedBlueprint);
            setActiveBlueprint(updatedBlueprint); // Update the "source of truth" content
        } else {
            // This is an update to a GitHub file
            if (!activeBlueprint.branchName || activeBlueprint.branchName === 'main') {
                toast({ variant: "destructive", title: "Cannot Save", description: "This file is not on a feature branch and cannot be edited directly." });
                setStatus('ready');
                return;
            }
            const updatedFile = await updateFileOnGitHub(activeBlueprint.path, editorContent, activeBlueprint.sha, activeBlueprint.branchName);
            if (updatedFile) {
                // Update the active blueprint with the new content and SHA
                const refreshedBlueprint = { ...activeBlueprint, ...updatedFile, content: editorContent };
                setActiveBlueprint(refreshedBlueprint);

                // Update the file in the main list as well
                setFiles(files.map(f => f.path === updatedFile.path ? { ...f, ...updatedFile } : f));
            }
        }
    } catch (e: any) {
        toast({
            variant: "destructive",
            title: "Error Saving to GitHub",
            description: e.message,
        });
    } finally {
        setStatus('ready');
    }
  };

  const promoteBlueprint = useCallback(async (filename: string, content: string): Promise<BlueprintFile | null> => {
    setStatus('saving');
    try {
        const newFile = await promoteBlueprintToBranch(filename, content);
        if (newFile) {
            await fetchFiles(true);
        }
        return newFile;
    } finally {
        setStatus('ready');
    }
  }, [promoteBlueprintToBranch, fetchFiles]);

  const createBlueprintWithContent = useCallback(async (
    filename: string, 
    content: string, 
    options: { showToast?: boolean, toastTitle?: string, toastDescription?: string } = {}
  ) => {
    const { showToast = true, toastTitle = "Blueprint Created", toastDescription = `New file '${filename}' created.` } = options;

    // This logic is now the same for both logged-in and anonymous users.
    // We always create a local blueprint first. The user can then "promote" it.
    const newFile: BlueprintFile = {
      path: `local/${uuidv4()}-${filename}`,
      name: filename,
      sha: uuidv4(),
      isLocal: true,
      lastModified: new Date().toISOString(),
    };
    
    const newBlueprint: ActiveBlueprint = {
      ...newFile,
      content: content,
    };

    let finalName = newFile.name;
    let counter = 2;
    while(files.some(f => f.name === finalName)) {
      finalName = `${newFile.name.replace(/\.yml$/, '')} (${counter}).yml`;
      counter++;
    }
    newFile.name = finalName;
    newFile.path = `local/${uuidv4()}_${finalName}`;

    const updatedBlueprint = { ...newBlueprint, name: finalName, path: newFile.path };

    saveToLocalStorage(updatedBlueprint);
    
    // Update the main files list for the UI
    setFiles(currentFiles => [updatedBlueprint, ...currentFiles]);
    // Also update the dedicated list of local files for persistence
    setLocalFiles(currentLocalFiles => [updatedBlueprint, ...currentLocalFiles]);
    
    loadFile(updatedBlueprint, { force: true });

    if (showToast) {
      toast({ title: toastTitle, description: toastDescription });
    }
    return updatedBlueprint;
  }, [toast, files, saveToLocalStorage, setLocalFiles, loadFile]);

  const createBlueprint = useCallback(async (filename: string) => {
    return createBlueprintWithContent(filename, DEFAULT_BLUEPRINT_CONTENT);
  }, [createBlueprintWithContent]);

  const setupWorkspace = useCallback(async (createFork = false) => {
    setStatus('setting_up');
    const result = await setupGitHubWorkspace(createFork);

    if (result.error || result.authFailure) {
        setStatus('idle');
        if (result.authFailure) {
            // Further action might be needed here, e.g., clearing auth state
        }
        return result;
    }

    if (result.forkCreationRequired) {
        setStatus('ready');
        return result;
    }

    if (result.success && result.forkName) {
        await fetchFiles(false, result.forkName);
    }

    setStatus('ready');
    setSetupMessage('');
    return result;
  }, [setupGitHubWorkspace, fetchFiles, setSetupMessage]);

  const deleteBlueprint = useCallback(async (blueprint: BlueprintFile | ActiveBlueprint, options: { silent?: boolean } = {}) => {
    const { silent = false } = options;
    console.log(`[deleteBlueprint] Deleting: ${blueprint.path}, isLocal: ${blueprint.isLocal}`);
    
    if (blueprint.isLocal) {
        try {
            const updatedLocalFiles = deleteFromLocalStorage(blueprint, localFiles);
            setFiles(currentFiles => [...currentFiles.filter(f => !f.isLocal), ...updatedLocalFiles]);
            
            if (activeBlueprint?.path === blueprint.path) {
                const remainingFiles = files.filter(f => f.path !== blueprint.path);
                if (remainingFiles.length > 0) {
                    loadFile(remainingFiles[0]);
                } else {
                    setActiveBlueprint(null);
                }
            }
            
            if (!silent) {
                toast({ title: "Blueprint Deleted", description: `${blueprint.name} has been removed from your local drafts.` });
            }
        } catch (e: any) {
            if (!silent) {
                toast({ variant: 'destructive', title: 'Error deleting file', description: e.message });
            }
        }
        return;
    }

    // For GitHub files
    if (!blueprint.branchName) {
        toast({ variant: 'destructive', title: 'Delete Error', description: 'Cannot delete a file that is not on a feature branch.' });
        return;
    }
    setDeletingFilePath(blueprint.path);
    try {
        await deleteFileFromGitHub(blueprint.path, blueprint.sha, blueprint.branchName);

        setFiles(currentFiles => currentFiles.filter(f => f.path !== blueprint.path));
        
        if (activeBlueprint?.path === blueprint.path) {
            const remainingFiles = files.filter(f => f.path !== blueprint.path);
            if (remainingFiles.length > 0) {
                loadFile(remainingFiles[0]);
            } else {
                setActiveBlueprint(null);
            }
        }
        
        if (!silent) {
            toast({ title: "Blueprint Deleted", description: `${blueprint.name} has been removed from your repository.` });
        }
    } catch (e: any) {
        if (!silent) {
            toast({ variant: 'destructive', title: 'Error deleting file', description: e.message });
        }
    } finally {
        setDeletingFilePath(null);
    }
  }, [activeBlueprint, files, loadFile, deleteFromLocalStorage, localFiles, deleteFileFromGitHub]);

  const createPullRequest = useCallback(async (data: { title: string; body: string }) => {
    if (!activeBlueprint || !activeBlueprint.branchName) {
        throw new Error('No active blueprint on a feature branch to create a PR for.');
    }
    if (isDirty) {
        toast({ variant: 'destructive', title: 'Unsaved Changes', description: 'Please save your changes before creating a proposal.' });
        throw new Error('Unsaved changes');
    }
    setStatus('creating_pr');
    try {
        const { prData, newPrStatus } = await createPullRequestOnGitHub(data, activeBlueprint);
        
        setFiles(currentFiles => 
            currentFiles.map(f => 
                f.path === activeBlueprint.path 
                    ? { ...f, prStatus: newPrStatus }
                    : f
            )
        );

        if (activeBlueprint) {
            setActiveBlueprint({ ...activeBlueprint, prStatus: newPrStatus });
        }

        return prData;
    } finally {
        setStatus('ready');
    }
  }, [activeBlueprint, createPullRequestOnGitHub, isDirty, toast]);

  const closeProposal = useCallback(async (prNumber: number) => {
    setStatus('closing_pr');
    try {
        const { updatedPrStatuses, closedPath } = await closePullRequestOnGitHub(prNumber);

        if (closedPath) {
            // Update files list
            setFiles(currentFiles => 
                currentFiles.map(f => 
                    f.prStatus?.number === prNumber 
                        ? { ...f, prStatus: { ...f.prStatus, state: 'closed' } }
                        : f
                )
            );

            // Update active blueprint if it matches
            if (activeBlueprint?.prStatus?.number === prNumber) {
                setActiveBlueprint({ 
                    ...activeBlueprint, 
                    prStatus: { ...activeBlueprint.prStatus, state: 'closed' } 
                });
            }
        }
    } finally {
        setStatus('ready');
    }
  }, [activeBlueprint, closePullRequestOnGitHub]);

  const duplicateBlueprint = async (sourceFile: BlueprintFile) => {
    console.log(`[duplicateBlueprint] Starting duplication for: ${sourceFile.path}`);
    try {
        setStatusState('saving');
        
        let contentToClone: string;
        if (sourceFile.isLocal) {
            const stored = localStorage.getItem(sourceFile.path);
            if (stored) {
                contentToClone = JSON.parse(stored).content;
            } else {
                throw new Error('Could not find local file content to duplicate.');
            }
        } else {
             if (!isLoggedIn) throw new Error("Cannot duplicate a remote file when not logged in.");
             const { content } = await loadFileContentFromGitHub(sourceFile.path, sourceFile.branchName);
             contentToClone = content;
        }

        const getUniqueName = (baseName: string): string => {
            const allFileNames = new Set(files.map(f => f.name));
            let newName = baseName;
            if (allFileNames.has(newName)) {
                const parts = baseName.replace(/\.yml$/, '').split('_clone_');
                const base = parts[0];
                let i = 2;
                do {
                    newName = `${base}_clone_${i}.yml`;
                    i++;
                } while (allFileNames.has(newName));
            }
            return newName;
        }

        const baseName = sourceFile.name.replace(/\.yml$/, '_clone.yml');
        const newFileName = getUniqueName(baseName);
        
        const newFile = await createBlueprintWithContent(newFileName, contentToClone);

        if (newFile) {
            await loadFile(newFile, { force: true });
            toast({
                title: "Blueprint Duplicated",
                description: `Successfully created and loaded '${newFileName}'.`,
            });
        }

    } catch (error: any) {
        console.error('[duplicateBlueprint] Error:', error);
        toast({
            variant: 'destructive',
            title: 'Duplication Failed',
            description: error.message,
        });
    } finally {
        setStatusState('ready');
    }
  };

  const setStatus = useCallback((s: WorkspaceStatus, message?: string) => {
    setStatusState(s);
    if (message) {
        setSetupMessage(message);
    }
  }, [setSetupMessage]);

  const renameBlueprint = useCallback(async (blueprint: BlueprintFile | ActiveBlueprint, newName: string) => {
    setStatus('saving', 'Renaming...');
    let renamedFile: BlueprintFile | null = null;

    try {
        if (blueprint.isLocal) {
            renamedFile = renameInLocalStorage(blueprint, newName);
        } else {
            if (!blueprint.branchName) {
                 toast({ variant: 'destructive', title: 'Rename Error', description: 'Cannot rename a file that is not on a feature branch.' });
                 throw new Error('Missing branch name for rename operation.');
            }
            renamedFile = await renameFileOnGitHub(blueprint.path, newName, blueprint.branchName);
        }

        if (renamedFile) {
            // Update the master file list
            setFiles(currentFiles => 
                currentFiles.map(f => f.path === blueprint.path ? renamedFile! : f)
            );

            // If the renamed file is the currently active one, we need to reload it
            // to update the editor state and clear the dirty flag.
            if (activeBlueprint?.path === blueprint.path) {
                await loadFile(renamedFile, { force: true });
            }
        }
    } catch (error: any) {
        // The child hooks (renameInLocalStorage, renameFileOnGitHub) are responsible for showing toasts on error.
        // We just need to reset the status.
        console.error("Rename failed:", error);
    } finally {
        setStatus('ready');
    }
  }, [activeBlueprint, loadFile, renameInLocalStorage, renameFileOnGitHub, setStatus]);

  // Load files on initial mount
  useEffect(() => {
    const allFiles = loadFilesFromLocalStorage();
    if (allFiles.length === 0) {
        const { blueprint } = initializeDefaultBlueprint();
        setActiveBlueprint(blueprint);
        setEditorContent(blueprint.content);
    } else {
        const lastActivePath = localStorage.getItem('lastActiveBlueprintPath');
        const fileToLoad = allFiles.find((f: BlueprintFile) => f.path === lastActivePath) || allFiles[0];
        if (fileToLoad) {
            loadFile(fileToLoad);
        }
    }
  }, [initializeDefaultBlueprint, loadFilesFromLocalStorage]);

  return {
    status,
    setupMessage,
    files,
    activeBlueprint,
    editorContent,
    isDirty,
    isFetchingFiles,
    isFetchingFileContent,
    runId,
    runStatus,
    runHistory,
    forkName,
    prStatuses,
    forkCreationRequired,
    isSyncingWithGitHub,
    deletingFilePath,
    
    // Actions
    setupWorkspace,
    loadFile,
    setEditorContent,
    handleSave,
    createBlueprint,
    createBlueprintWithContent,
    deleteBlueprint,
    createPullRequest,
    runEvaluation,
    setRunStatus,
    setRunId,
    closeProposal,
    duplicateBlueprint,
    promoteBlueprint,
    fetchFiles,
    setForkCreationRequired,
    renameBlueprint,
  };
}