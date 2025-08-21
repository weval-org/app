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
  const { toast } = useToast();
  const [status, setStatusState] = useState<WorkspaceStatus>('idle');
  const [setupMessage, setSetupMessage] = useState<string>('');
  const [isFetchingFiles, setIsFetchingFiles] = useState(false);
  const [isFetchingFileContent, setIsFetchingFileContent] = useState(false);
  const [files, setFiles] = useState<BlueprintFile[]>([]);
  const [activeBlueprint, setActiveBlueprint] = useState<ActiveBlueprint | null>(null);

  const [editorContent, setEditorContent] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const activeBlueprintRef = useRef(activeBlueprint);
  activeBlueprintRef.current = activeBlueprint;

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

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
    loadFilesFromLocalStorage,
    initializeDefaultBlueprint,
    saveToLocalStorage,
    deleteFromLocalStorage,
    renameInLocalStorage,
    importBlueprint,
  } = useLocalPersistence();

  const [deletingFilePath, setDeletingFilePath] = useState<string | null>(null);

  const prevIsLoggedIn = useRef(isLoggedIn);

  const stateRef = useRef({ isLoggedIn, forkName });
  useEffect(() => {
    stateRef.current = { isLoggedIn, forkName };
  }, [isLoggedIn, forkName]);

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
    if (isDirtyRef.current && !force) {
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
        if ('content' in file) {
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
  }, [toast, loadFileContentFromGitHub]);

  useEffect(() => {
    if (isAuthLoading) return;

    const importedBlueprint = importBlueprint();
    if (importedBlueprint) {
      const currentLocalFiles = loadFilesFromLocalStorage();
      
      let finalName = importedBlueprint.name;
      let counter = 2;
      while(currentLocalFiles.some((f: BlueprintFile) => f.name === finalName)) {
          finalName = `${importedBlueprint.name.replace(/\.yml$/, '')} (${counter}).yml`;
          counter++;
      }
      const finalBlueprint = { ...importedBlueprint, name: finalName, path: `local/${uuidv4()}_${finalName}` };
      
      const newFiles = saveToLocalStorage(finalBlueprint, currentLocalFiles);
      
      setFiles(newFiles);
      loadFile(finalBlueprint);
    }
  }, [isAuthLoading, importBlueprint, loadFilesFromLocalStorage, saveToLocalStorage, loadFile]);

  const fetchFiles = useCallback(async (forceRefresh = false, providedForkName?: string) => {
    // Helper to deduplicate remote GitHub files that may appear multiple times
    // due to multiple branches or sync artifacts. We keep one entry per name,
    // preferring: open PR > closed PR > no PR, and then newest lastModified.
    const dedupeRemoteFilesByName = (filesToDedupe: BlueprintFile[]): BlueprintFile[] => {
      const score = (f: BlueprintFile): number => {
        let s = 0;
        if (f.prStatus?.state === 'open') s += 3_000_000_000_000; // highest priority
        else if (f.prStatus?.state === 'closed') s += 2_000_000_000_000;
        if (f.branchName && f.branchName !== 'main') s += 100_000_000_000; // prefer feature branches over main
        const ts = Date.parse(f.lastModified || '') || 0;
        s += ts;
        return s;
      };

      const nameToBest: Map<string, BlueprintFile> = new Map();
      for (const f of filesToDedupe) {
        const existing = nameToBest.get(f.name);
        if (!existing) {
          nameToBest.set(f.name, f);
        } else if (score(f) > score(existing)) {
          nameToBest.set(f.name, f);
        }
      }
      return Array.from(nameToBest.values());
    };

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
        if (localFilesFromDisk.length > 0) {
            setFiles(localFilesFromDisk);
            if (!activeBlueprintRef.current) {
                loadFile(localFilesFromDisk[0]);
            }
        }
        
        if (!effectiveForkName) {
            if (localFilesFromDisk.length === 0) {
                 const { file, blueprint } = initializeDefaultBlueprint();
                 saveToLocalStorage(blueprint, []);
                 setFiles([file]);
                 setActiveBlueprint(blueprint);
                 setEditorContent(blueprint.content);
            }
            setIsFetchingFiles(false);
            setIsSyncingWithGitHub(false);
            return;
        }
        
        try {
            const response = await fetch(`/api/github/workspace/files?forceRefresh=${forceRefresh}&forkName=${encodeURIComponent(effectiveForkName)}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch files: ${response.statusText}`);
            }

            const remoteFiles = (await response.json()) as BlueprintFile[];
            const dedupedRemote = dedupeRemoteFilesByName(remoteFiles);
            const allFiles = [...localFilesFromDisk, ...dedupedRemote];
            setFiles(allFiles);
            
            if (!activeBlueprintRef.current && allFiles.length > 0) {
                loadFile(allFiles[0]);
            } else if (allFiles.length === 0) {
                const { file, blueprint } = initializeDefaultBlueprint();
                saveToLocalStorage(blueprint, []);
                setFiles([file]);
                setActiveBlueprint(blueprint);
                setEditorContent(blueprint.content);
            }
        } catch (error: any) {
            console.error('[fetchFiles] GitHub API error:', error);
            toast({
                variant: 'destructive',
                title: 'GitHub Sync Failed',
                description: error.message,
            });
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
        setIsFetchingFiles(false);
        setIsSyncingWithGitHub(false);
    }
  }, [isLoggedIn, status, isFetchingFiles, loadFilesFromLocalStorage, forkName, toast, loadFile, setSetupMessage, setIsSyncingWithGitHub, initializeDefaultBlueprint, saveToLocalStorage]);

  useEffect(() => {
    if (isLoggedIn && forkName && files.length === 0 && !isFetchingFiles && status === 'ready') {
      fetchFiles(false, forkName);
    }
  }, [isLoggedIn, forkName, files.length, status, isFetchingFiles, fetchFiles]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (prevIsLoggedIn.current !== isLoggedIn) {
      setFiles([]);
      setActiveBlueprint(null);
      if (isLoggedIn) {
      } else {
        window.localStorage.removeItem('sandboxV2_github_files_cache');
        window.localStorage.removeItem('sandboxV2_pr_statuses_cache');
      }
    }
    prevIsLoggedIn.current = isLoggedIn;

    if (isLoggedIn) {
    } else {
        if (files.length === 0 && !isFetchingFiles) {
            fetchFiles();
        }
    }
  }, [isAuthLoading, isLoggedIn, status, fetchFiles, files.length, isFetchingFiles]);

  const runEvaluation = useCallback(async (models?: string[]) => {
    if (!activeBlueprint) {
        toast({ variant: 'destructive', title: 'No blueprint selected', description: 'Please select a blueprint to run an evaluation.'});
        return;
    }

    if (isDirty) {
        toast({ variant: 'destructive', title: 'Unsaved Changes', description: 'Please save your changes before running an evaluation.' });
        return;
    }

    setStatusState('running_eval');
    try {
        await performRun(models);
    } finally {
        setStatusState('ready');
    }
  }, [activeBlueprint, toast, performRun, isDirty]);
  
  const handleSave = async () => {
    if (!activeBlueprint || !editorContent || !isDirty) {
      return;
    }

    setStatusState('saving');
    try {
        if (activeBlueprint.isLocal) {
            const updatedBlueprint = { ...activeBlueprint, content: editorContent };
            const newFiles = saveToLocalStorage(updatedBlueprint, files);
            setFiles(newFiles);
            setActiveBlueprint(updatedBlueprint); 
        } else {
            if (!activeBlueprint.branchName || activeBlueprint.branchName === 'main') {
                toast({ variant: "destructive", title: "Cannot Save", description: "This file is not on a feature branch and cannot be edited directly." });
                setStatusState('ready');
                return;
            }
            const updatedFile = await updateFileOnGitHub(activeBlueprint.path, editorContent, activeBlueprint.sha, activeBlueprint.branchName);
            if (updatedFile) {
                const refreshedBlueprint = { ...activeBlueprint, ...updatedFile, content: editorContent };
                setActiveBlueprint(refreshedBlueprint);
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
        setStatusState('ready');
    }
  };

  const promoteBlueprint = useCallback(async (filename: string, content: string): Promise<BlueprintFile | null> => {
    setStatusState('saving');
    try {
        const newFile = await promoteBlueprintToBranch(filename, content);
        if (newFile) {
            await fetchFiles(true);
        }
        return newFile;
    } finally {
        setStatusState('ready');
    }
  }, [promoteBlueprintToBranch, fetchFiles]);

  const createBlueprintWithContent = useCallback(async (
    filename: string, 
    content: string, 
    options: { showToast?: boolean, toastTitle?: string, toastDescription?: string } = {}
  ) => {
    const { showToast = true, toastTitle = "Blueprint Created", toastDescription = `New file '${filename}' created.` } = options;

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

    const newFiles = saveToLocalStorage(updatedBlueprint, files);
    
    setFiles(newFiles);
    
    loadFile(updatedBlueprint, { force: true });

    if (showToast) {
      toast({ title: toastTitle, description: toastDescription });
    }
    return updatedBlueprint;
  }, [toast, files, saveToLocalStorage, loadFile]);

  const createBlueprint = useCallback(async (filename: string) => {
    return createBlueprintWithContent(filename, DEFAULT_BLUEPRINT_CONTENT);
  }, [createBlueprintWithContent]);

  const setupWorkspace = useCallback(async (createFork = false) => {
    setStatusState('setting_up');
    const result = await setupGitHubWorkspace(createFork);

    if (result.error || result.authFailure) {
        setStatusState('idle');
        if (result.authFailure) {
        }
        return result;
    }

    if (result.forkCreationRequired) {
        setStatusState('ready');
        return result;
    }

    setStatusState('ready');
    setSetupMessage('');
    return result;
  }, [setupGitHubWorkspace]);

  const deleteBlueprint = useCallback(async (blueprint: BlueprintFile | ActiveBlueprint, options: { silent?: boolean } = {}) => {
    const { silent = false } = options;
    const wasActive = activeBlueprint?.path === blueprint.path;

    if (blueprint.isLocal) {
        try {
            const updatedFiles = deleteFromLocalStorage(blueprint, files);
            setFiles(updatedFiles);
            
            if (wasActive) {
                if (updatedFiles.length > 0) {
                    loadFile(updatedFiles[0]);
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

    if (!blueprint.branchName) {
        toast({ variant: 'destructive', title: 'Delete Error', description: 'Cannot delete a file that is not on a feature branch.' });
        return;
    }
    setDeletingFilePath(blueprint.path);
    try {
        await deleteFileFromGitHub(blueprint.path, blueprint.sha, blueprint.branchName);

        const newFiles = files.filter(f => f.path !== blueprint.path);
        setFiles(newFiles);
        
        if (wasActive) {
            if (newFiles.length > 0) {
                loadFile(newFiles[0]);
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
  }, [activeBlueprint?.path, files, loadFile, deleteFromLocalStorage, deleteFileFromGitHub, toast]);

  const createPullRequest = useCallback(async (data: { title: string; body: string }) => {
    if (!activeBlueprint || !activeBlueprint.branchName) {
        throw new Error('No active blueprint on a feature branch to create a PR for.');
    }
    if (isDirty) {
        toast({ variant: 'destructive', title: 'Unsaved Changes', description: 'Please save your changes before creating a proposal.' });
        throw new Error('Unsaved changes');
    }
    setStatusState('creating_pr');
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
        setStatusState('ready');
    }
  }, [activeBlueprint, createPullRequestOnGitHub, isDirty, toast]);

  const closeProposal = useCallback(async (prNumber: number) => {
    setStatusState('closing_pr');
    try {
        const { updatedPrStatuses, closedPath } = await closePullRequestOnGitHub(prNumber);

        if (closedPath) {
            setFiles(currentFiles => 
                currentFiles.map(f => 
                    f.prStatus?.number === prNumber 
                        ? { ...f, prStatus: { ...f.prStatus, state: 'closed' } }
                        : f
                )
            );

            if (activeBlueprint?.prStatus?.number === prNumber) {
                setActiveBlueprint({ 
                    ...activeBlueprint, 
                    prStatus: { ...activeBlueprint.prStatus, state: 'closed' } 
                });
            }
        }
    } finally {
        setStatusState('ready');
    }
  }, [activeBlueprint, closePullRequestOnGitHub]);

  const duplicateBlueprint = async (sourceFile: BlueprintFile) => {
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
  }, []);

  const renameBlueprint = useCallback(async (blueprint: BlueprintFile | ActiveBlueprint, newName: string) => {
    setStatusState('saving');
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
            setFiles(currentFiles => 
                currentFiles.map(f => f.path === blueprint.path ? renamedFile! : f)
            );

            if (activeBlueprint?.path === blueprint.path) {
                await loadFile(renamedFile, { force: true });
            }
        }
    } catch (error: any) {
        console.error("Rename failed:", error);
    } finally {
        setStatusState('ready');
    }
  }, [activeBlueprint, loadFile, renameInLocalStorage, renameFileOnGitHub]);

  useEffect(() => {
    const allFiles = loadFilesFromLocalStorage();
    if (allFiles.length === 0) {
        const { blueprint, file } = initializeDefaultBlueprint();
        saveToLocalStorage(blueprint, []);
        setFiles([file]);
        setActiveBlueprint(blueprint);
        setEditorContent(blueprint.content);
    } else {
        const lastActivePath = localStorage.getItem('lastActiveBlueprintPath');
        const fileToLoad = allFiles.find((f: BlueprintFile) => f.path === lastActivePath) || allFiles[0];
        if (fileToLoad) {
            loadFile(fileToLoad);
        } else {
            setFiles(allFiles);
        }
    }
  }, [initializeDefaultBlueprint, loadFilesFromLocalStorage, loadFile, saveToLocalStorage, setActiveBlueprint, setEditorContent]);

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