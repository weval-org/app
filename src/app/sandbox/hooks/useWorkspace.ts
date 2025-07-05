'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { v4 as uuidv4 } from 'uuid';

export interface BlueprintFile {
    name: string;
    path: string;
    sha: string;
    isLocal?: boolean;
    lastModified?: string; // ISO string format
    prStatus?: PRStatus;
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

const LOCAL_STORAGE_BLUEPRINT_KEY = 'sandboxV2_blueprints';
const GITHUB_FILES_CACHE_KEY = 'sandboxV2_github_files_cache';
const PR_STATUSES_CACHE_KEY = 'sandboxV2_pr_statuses_cache';
const RUN_HISTORY_KEY = 'sandboxV2_run_history';

export const DEFAULT_BLUEPRINT_CONTENT = `title: "My First Blueprint"
description: "A test to see how different models respond to my prompts."
---
- prompt: "Your first prompt here."
  should:
    - "An expectation for the response."`;

export function useWorkspace(
  isLoggedIn: boolean, 
  username: string | null,
  isAuthLoading: boolean,
) {
  console.log(`[useWorkspace] Hook init. isLoggedIn: ${isLoggedIn}, username: ${username}`);
  const { toast } = useToast();
  const [status, setStatus] = useState<WorkspaceStatus>('idle');
  const [isFetchingFiles, setIsFetchingFiles] = useState(false);
  const [isFetchingGithubData, setIsFetchingGithubData] = useState(false);
  const [isFetchingFileContent, setIsFetchingFileContent] = useState(false);
  const [files, setFiles] = useState<BlueprintFile[]>([]);
  const [activeBlueprint, setActiveBlueprint] = useState<ActiveBlueprint | null>(null);
  const activeBlueprintRef = useRef(activeBlueprint);
  activeBlueprintRef.current = activeBlueprint;
  const [forkName, setForkName] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<SandboxRunStatus>({ status: 'idle' });
  const [runningBlueprintName, setRunningBlueprintName] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<RunResult[]>([]);
  const [prStatuses, setPrStatuses] = useState<Record<string, PRStatus>>({});
  const [forkCreationRequired, setForkCreationRequired] = useState(false);
  const [isSyncingWithGitHub, setIsSyncingWithGitHub] = useState(false);
  const [deletingFilePath, setDeletingFilePath] = useState<string | null>(null);

  const prevIsLoggedIn = useRef(isLoggedIn);

  // Ref to hold the latest state that callbacks might need.
  const stateRef = useRef({ isLoggedIn, forkName });
  useEffect(() => {
    stateRef.current = { isLoggedIn, forkName };
  }, [isLoggedIn, forkName]);

  useEffect(() => {
    try {
      const storedHistory = window.localStorage.getItem(RUN_HISTORY_KEY);
      if (storedHistory) {
        setRunHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.error("Failed to load run history from local storage", e);
    }
  }, []);

  const loadFile = useCallback(async (file: BlueprintFile) => {
    console.log(`[loadFile] Loading file: ${file.path}`);
    if (activeBlueprintRef.current?.path === file.path) {
        console.log(`[loadFile] File already active, returning.`);
        return;
    }

    setIsFetchingFileContent(true);
    if (file.isLocal) {
        try {
            const storedBlueprint = window.localStorage.getItem(file.path);
            if (storedBlueprint) {
                setActiveBlueprint(JSON.parse(storedBlueprint));
            } else {
                throw new Error(`Could not find local blueprint with path: ${file.path}`);
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error loading file', description: e.message });
        } finally {
            setIsFetchingFileContent(false);
        }
        return;
    }

    const { isLoggedIn: currentIsLoggedIn, forkName: currentForkName } = stateRef.current;

    if (!currentIsLoggedIn || !currentForkName) {
        setIsFetchingFileContent(false);
        return;
    }

    try {
        const response = await fetch(`/api/github/workspace/file?path=${encodeURIComponent(file.path)}&forkName=${currentForkName}`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || `Failed to load file: ${file.name}`);
        }
        const { content, sha } = await response.json();
        setActiveBlueprint({ ...file, content, sha });
    } catch (e: any) {
        toast({
            variant: "destructive",
            title: "Error loading file",
            description: e.message,
        });
    } finally {
        setIsFetchingFileContent(false);
    }
  }, [toast]);

  const loadFilesFromLocalStorage = useCallback(() => {
    try {
        const storedFiles = window.localStorage.getItem(LOCAL_STORAGE_BLUEPRINT_KEY);
        if (storedFiles) {
            return JSON.parse(storedFiles);
        }
        return [];
    } catch (e) {
        console.error("Failed to load files from local storage", e);
        return [];
    }
  }, []);

  const initializeDefaultBlueprint = useCallback(() => {
    const defaultFile: BlueprintFile = {
        path: `local/${uuidv4()}.yml`,
        name: 'local-draft.yml',
        sha: uuidv4(),
        isLocal: true,
        lastModified: new Date().toISOString(),
    };
    const defaultBlueprint: ActiveBlueprint = {
        ...defaultFile,
        content: DEFAULT_BLUEPRINT_CONTENT,
    };
    window.localStorage.setItem(LOCAL_STORAGE_BLUEPRINT_KEY, JSON.stringify([defaultFile]));
    window.localStorage.setItem(defaultFile.path, JSON.stringify(defaultBlueprint));
    return [defaultFile];
  }, []);

  const saveToLocalStorage = useCallback((blueprint: ActiveBlueprint) => {
      try {
          const blueprintWithTimestamp = { ...blueprint, lastModified: new Date().toISOString() };
          window.localStorage.setItem(blueprint.path, JSON.stringify(blueprintWithTimestamp));
          
          setFiles(currentFiles => {
              const localFiles = currentFiles.filter(f => f.isLocal && f.path !== blueprint.path);
              const newFileEntry: BlueprintFile = { 
                  name: blueprint.name, 
                  path: blueprint.path, 
                  sha: blueprint.sha,
                  isLocal: true,
                  lastModified: blueprintWithTimestamp.lastModified
              };
              const updatedLocalFiles = [...localFiles, newFileEntry];
              window.localStorage.setItem(LOCAL_STORAGE_BLUEPRINT_KEY, JSON.stringify(updatedLocalFiles));

              const githubFiles = currentFiles.filter(f => !f.isLocal);
              return [...githubFiles, ...updatedLocalFiles];
          });
          toast({ title: "Blueprint Saved", description: "Your changes have been saved locally." });
      } catch (e: any) {
          toast({ variant: 'destructive', title: 'Error saving to Local Storage', description: e.message });
      }
  }, [toast]);

  const loadCache = useCallback(() => {
      try {
          const cachedFiles = window.localStorage.getItem(GITHUB_FILES_CACHE_KEY);
          const cachedPrStatuses = window.localStorage.getItem(PR_STATUSES_CACHE_KEY);
          return {
              files: cachedFiles ? JSON.parse(cachedFiles) : [],
              prStatuses: cachedPrStatuses ? JSON.parse(cachedPrStatuses) : {},
          };
      } catch (e) {
          console.warn("Failed to load cache from local storage", e);
          return { files: [], prStatuses: {} };
      }
  }, []);

  const saveCache = useCallback((files: BlueprintFile[], prStatuses: Record<string, PRStatus>) => {
      try {
          window.localStorage.setItem(GITHUB_FILES_CACHE_KEY, JSON.stringify(files.filter(f => !f.isLocal)));
          window.localStorage.setItem(PR_STATUSES_CACHE_KEY, JSON.stringify(prStatuses));
      } catch (e) {
          console.warn("Failed to save cache to local storage", e);
      }
  }, []);

  const runEvaluation = useCallback(async (models?: string[]) => {
    if (!activeBlueprint) {
        toast({ variant: 'destructive', title: 'No blueprint selected', description: 'Please select a blueprint to run an evaluation.'});
        return;
    }

    setRunningBlueprintName(activeBlueprint.name);
    setStatus('running_eval');
    setRunStatus({ status: 'pending', message: 'Initiating evaluation...' });
    setRunId(null);
    
    try {
        const response = await fetch('/api/sandbox/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                blueprintContent: activeBlueprint.content,
                isAdvanced: isLoggedIn, // Logged in users get advanced mode
                models, // Pass selected models to the backend
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to start evaluation run.');
        }

        const { runId: newRunId } = await response.json();
        setRunId(newRunId);
        setRunStatus({ status: 'pending', message: 'Run accepted and queued.' });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error starting run', description: error.message });
        setRunStatus({ status: 'error', message: error.message });
    } finally {
        setStatus('ready');
    }
  }, [activeBlueprint, isLoggedIn, toast]);

  const fetchPrStatuses = useCallback(async () => {
    if (!isLoggedIn) return {};
    setIsFetchingGithubData(true);
    try {
        const res = await fetch('/api/github/workspace/prs-status');
        if (res.ok) {
            const statuses = await res.json();
            setPrStatuses(statuses);
            return statuses;
        }
    } catch (e) {
        console.error("Failed to fetch PR statuses", e);
    } finally {
        // We'll set this to false in fetchFiles
    }
    return {};
  }, [isLoggedIn]);

  const fetchFiles = useCallback(async () => {
    console.log(`[fetchFiles] Starting. isLoggedIn: ${isLoggedIn}, forkName: ${forkName}`);
    setIsFetchingFiles(true);

    const localFiles = loadFilesFromLocalStorage();
    const cachedData = loadCache();
    console.log(`[fetchFiles] Loaded ${localFiles.length} local files and ${cachedData.files.length} cached GitHub files.`);
    
    // Initial load from local and cache to make the UI responsive.
    const initialFiles = [...localFiles, ...cachedData.files].sort((a, b) => {
        const dateA = a.lastModified ? new Date(a.lastModified) : new Date(0);
        const dateB = b.lastModified ? new Date(b.lastModified) : new Date(0);
        return dateB.getTime() - dateA.getTime();
    });
    setFiles(initialFiles);
    setPrStatuses(cachedData.prStatuses);

    // Now, fetch live data from the network.
    console.log(`[fetchFiles] Beginning network fetch...`);
    let githubFiles: BlueprintFile[] = [];
    const prStatusData = await fetchPrStatuses();

    if (isLoggedIn && forkName) {
        console.log(`[fetchFiles] User is logged in with fork, fetching from GitHub...`);
        setIsFetchingGithubData(true);
        try {
            const listRes = await fetch(`/api/github/workspace/files?forkName=${forkName}`);
            if (listRes.ok) {
                const fileList = await listRes.json();
                const filesWithDates = await Promise.all(fileList.map(async (file: BlueprintFile) => {
                    const commitRes = await fetch(`/api/github/workspace/file-commit?forkName=${forkName}&path=${encodeURIComponent(file.path)}`);
                    if (commitRes.ok) {
                        const { date } = await commitRes.json();
                        return { ...file, lastModified: date };
                    }
                    return file;
                }));
                githubFiles = filesWithDates.map(f => ({ 
                    ...f,
                    isLocal: false,
                    prStatus: prStatusData[f.path]
                }));

                saveCache(githubFiles, prStatusData);
            }
        } catch (e) {
            console.error("Error fetching github files", e);
            toast({ variant: "destructive", title: "Error fetching files", description: "Could not retrieve blueprints from GitHub." });
        } finally {
            console.log(`[fetchFiles] Finished GitHub fetch.`);
            setIsFetchingGithubData(false);
        }
    } else {
        // If not logged in, ensure the GitHub loading indicator is off.
        setIsFetchingGithubData(false);
    }

    // Combine fresh GitHub files with local files.
    let allFiles = [...localFiles, ...githubFiles];
    console.log(`[fetchFiles] Re-combining files. Total: ${allFiles.length}`);

    // If there are no files at all and the user isn't logged in, create a default one.
    if (allFiles.length === 0 && !isLoggedIn) {
        allFiles = initializeDefaultBlueprint();
    }
    
    // Sort all files by modification date.
    allFiles.sort((a, b) => {
        const dateA = a.lastModified ? new Date(a.lastModified) : new Date(0);
        const dateB = b.lastModified ? new Date(b.lastModified) : new Date(0);
        return dateB.getTime() - dateA.getTime();
    });
    
    setFiles(allFiles);

    // If no blueprint is active, load the most recent one.
    if (!activeBlueprintRef.current && allFiles.length > 0) {
        loadFile(allFiles[0]);
    }
    setIsFetchingFiles(false);
    console.log(`[fetchFiles] Finished.`);
    return allFiles;
  }, [isLoggedIn, forkName, toast, loadFile, loadFilesFromLocalStorage, fetchPrStatuses, saveCache, loadCache, initializeDefaultBlueprint]);

  const setupWorkspace = useCallback(async (createFork = false) => {
    setStatus('setting_up');
    try {
      const response = await fetch(`/api/github/workspace/setup?createFork=${createFork}`, { method: 'POST' });
      
      const data = await response.json();

      if (!response.ok) {
        // Handle authentication failure gracefully - don't show error toast
        // This is a valid scenario when frontend auth state is out of sync with backend
        if (response.status === 401) {
          console.log('[setupWorkspace] Authentication failed - falling back to anonymous mode');
          setStatus('ready'); // Set to ready so anonymous mode can work
          return { authFailure: true };
        }
        
        throw new Error(data.error || 'Failed to set up workspace');
      }

      if (data.forkCreationRequired) {
        setForkCreationRequired(true);
        setStatus('idle');
        return;
      }
      
      setForkName(data.forkName);
      setForkCreationRequired(false);
      setStatus('ready');
      return { success: true };
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error setting up workspace",
        description: e.message,
      });
      setStatus('idle'); // Revert to idle if setup fails
      return { error: e.message };
    }
  }, [toast]);

  const saveBlueprint = useCallback(async (content: string) => {
    if (!activeBlueprint) return;
    
    setStatus('saving');

    if (activeBlueprint.isLocal) {
        const updatedBlueprint: ActiveBlueprint = { ...activeBlueprint, content, sha: uuidv4() };
        setActiveBlueprint(updatedBlueprint);
        saveToLocalStorage(updatedBlueprint);
        setStatus('ready');
        return;
    }

    if (!isLoggedIn || !forkName) {
        toast({
            variant: "destructive",
            title: "Save failed",
            description: "No active blueprint or fork name to save.",
        });
        return;
    }

    try {
        const response = await fetch('/api/github/workspace/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: activeBlueprint.path,
                content: content,
                sha: activeBlueprint.sha,
                forkName: forkName,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save blueprint.');
        }

        const savedContent = await response.json();
        
        // Update the active blueprint with the new sha and content
        setActiveBlueprint(prev => {
            if (!prev) return null;
            return { 
                ...prev, 
                content: content, // use the local content which is freshest
                sha: savedContent.sha 
            };
        });

    } catch (err: any) {
        toast({
            variant: "destructive",
            title: "Error saving blueprint",
            description: err.message,
        });
    } finally {
        setStatus('ready');
    }
  }, [activeBlueprint, forkName, toast, isLoggedIn, saveToLocalStorage]);

  const createBlueprintWithContent = useCallback(async (filename: string, content: string): Promise<BlueprintFile | null> => {
    const finalFilename = filename.endsWith('.yml') ? filename : `${filename}.yml`;

    setStatus('saving');
    const newPath = `local/${uuidv4()}-${finalFilename}`;

    const newFile: BlueprintFile = {
        path: newPath,
        name: finalFilename,
        sha: uuidv4(),
        isLocal: true,
        lastModified: new Date().toISOString(),
    };
    const newBlueprint: ActiveBlueprint = {
        ...newFile,
        content: content,
    };
    
    try {
        const localFiles = loadFilesFromLocalStorage();
        localFiles.push(newFile);
        window.localStorage.setItem(LOCAL_STORAGE_BLUEPRINT_KEY, JSON.stringify(localFiles));
        window.localStorage.setItem(newPath, JSON.stringify(newBlueprint));
        
        setFiles(currentFiles => {
            const updatedFiles = [newFile, ...currentFiles];
            updatedFiles.sort((a, b) => {
                const dateA = a.lastModified ? new Date(a.lastModified) : new Date(0);
                const dateB = b.lastModified ? new Date(b.lastModified) : new Date(0);
                return dateB.getTime() - dateA.getTime();
            });
            return updatedFiles;
        });
        setActiveBlueprint(newBlueprint);
        
        toast({ title: "Blueprint Created", description: `Successfully created ${finalFilename} locally.` });
        return newFile;

    } catch (e: any) {
         toast({ variant: 'destructive', title: 'Error saving to Local Storage', description: e.message });
    } finally {
        setStatus('ready');
    }
    
    return null;
  }, [toast, loadFilesFromLocalStorage]);

  const createBlueprint = useCallback(async (filename: string) => {
    await createBlueprintWithContent(filename, DEFAULT_BLUEPRINT_CONTENT);
  }, [createBlueprintWithContent]);

  const duplicateBlueprint = useCallback(async (blueprintToDuplicate: ActiveBlueprint) => {
    const originalName = blueprintToDuplicate.name.replace(/\.yml$/, '');
    let newName = `${originalName}_copy.yml`;
    let counter = 1;
    // Ensure the new name is unique
    while (files.some(f => f.name === newName)) {
        newName = `${originalName}_copy_${counter}.yml`;
        counter++;
    }

    await createBlueprintWithContent(newName, blueprintToDuplicate.content);
    toast({
        title: 'Blueprint Duplicated',
        description: `Created a local copy: ${newName}`,
    });
  }, [files, createBlueprintWithContent, toast]);

  const promoteBlueprint = useCallback(async (filename: string, content: string) => {
    if (!isLoggedIn || !forkName) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to save a blueprint to GitHub.'
      });
      return null;
    }

    setStatus('saving');
    try {
      const filePath = `blueprints/users/${username}/${filename}`;
      const response = await fetch('/api/github/workspace/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          content: content,
          // For a new file, SHA is not needed and can be null/undefined
          sha: null, 
          forkName: forkName,
          isNew: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save blueprint to GitHub.');
      }

      const savedFile = await response.json();
      
      toast({
        title: 'Saved to GitHub',
        description: `Successfully saved '${filename}'.`
      });

      // After successful save, refresh the file list to get the new remote file
      await fetchFiles();

      return savedFile;

    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error Saving to GitHub",
        description: err.message,
      });
      return null;
    } finally {
      setStatus('ready');
    }
  }, [isLoggedIn, forkName, username, toast, fetchFiles]);

  const createPullRequest = useCallback(async ({ title, body }: { title: string; body: string }) => {
    if (!isLoggedIn || !forkName || !activeBlueprint) {
      toast({
        variant: "destructive",
        title: "Error creating pull request",
        description: "Cannot create PR: missing required information.",
      });
      return null;
    }

    setStatus('creating_pr');
    try {
      const response = await fetch('/api/github/pr/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forkName,
          title,
          body,
          blueprintPath: activeBlueprint.path,
          blueprintContent: activeBlueprint.content,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create pull request: ${errorData.message}`);
      }

      const prData = await response.json();
      
      // Refresh state to show the new PR status
      const newFiles = await fetchFiles();
      const updatedFile = newFiles.find(f => f.path === activeBlueprint.path);
      if (updatedFile) {
        setActiveBlueprint(prev => prev ? { ...prev, ...updatedFile } : null);
      }

      return prData.html_url;

    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error Creating Pull Request",
        description: err.message,
      });
      return null;
    } finally {
      setStatus('ready');
    }
  }, [isLoggedIn, forkName, activeBlueprint, toast, fetchFiles]);

  const deleteBlueprint = useCallback(async (file: BlueprintFile, options?: { silent?: boolean }) => {
    // Prevent multiple deletions at the same time
    if (deletingFilePath) return;

    if (file.isLocal) {
        setStatus('deleting');
        try {
            setFiles(files => {
                const updatedFiles = files.filter(f => f.path !== file.path);
                const localFiles = updatedFiles.filter(f => f.isLocal);
                window.localStorage.setItem(LOCAL_STORAGE_BLUEPRINT_KEY, JSON.stringify(localFiles));
                return updatedFiles;
            });
            window.localStorage.removeItem(file.path);
            
            if (activeBlueprintRef.current?.path === file.path) {
                setActiveBlueprint(null);
            }
            if (!options?.silent) {
                toast({ title: "Blueprint Deleted", description: `Blueprint '${file.name}' was deleted.` });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error deleting local file', description: e.message });
        } finally {
            setStatus('ready');
        }
        return;
    }
    
    if (!isLoggedIn || !forkName) {
        toast({
            variant: "destructive",
            title: "Error deleting file",
            description: "Cannot delete file: fork name is missing.",
        });
        return;
    }

    setDeletingFilePath(file.path);
    try {
        const response = await fetch('/api/github/workspace/file', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: file.path,
                sha: file.sha,
                forkName: forkName,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete blueprint.');
        }

        setFiles(currentFiles => currentFiles.filter(f => f.path !== file.path));

        if (activeBlueprint?.path === file.path) {
            setActiveBlueprint(null);
            // If there are other files, load the first one
            const remainingFiles = files.filter(f => f.path !== file.path);
            if (remainingFiles.length > 0) {
                loadFile(remainingFiles[0]);
            }
        }
        
    } catch (err: any) {
        toast({
            variant: "destructive",
            title: "Error deleting blueprint",
            description: err.message,
        });
    } finally {
        setDeletingFilePath(null);
    }
  }, [forkName, activeBlueprint, toast, isLoggedIn, files, deletingFilePath, loadFile]);

  const closeProposal = useCallback(async (prNumber: number) => {
    setStatus('closing_pr');
    try {
        const response = await fetch('/api/github/pr/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prNumber }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to close proposal.');
        }

        toast({ title: "Proposal Closed", description: `Pull Request #${prNumber} has been closed.` });
        
        // Refresh the state
        const newFiles = await fetchFiles();
        const updatedFile = newFiles.find(f => f.path === activeBlueprint?.path);
        if (updatedFile) {
            setActiveBlueprint(prev => prev ? { ...prev, ...updatedFile } : null);
        }

    } catch (err: any) {
        toast({
            variant: "destructive",
            title: "Error Closing Proposal",
            description: err.message,
        });
    } finally {
        setStatus('ready');
    }
  }, [fetchFiles, toast]);

  useEffect(() => {
    // Only fetch files once the workspace setup is complete (for logged-in users)
    // or immediately for logged-out users.
    if (!isLoggedIn || status === 'ready') {
      fetchFiles();
    }
  }, [isLoggedIn, status, fetchFiles]);

  useEffect(() => {
    // Detect logout and clear GitHub-related cache and state
    if (prevIsLoggedIn.current && !isLoggedIn) {
        console.log('[useWorkspace] User logged out, clearing GitHub cache.');
        window.localStorage.removeItem(GITHUB_FILES_CACHE_KEY);
        window.localStorage.removeItem(PR_STATUSES_CACHE_KEY);
        setFiles(files => files.filter(f => f.isLocal));
        setPrStatuses({});
        if (activeBlueprintRef.current && !activeBlueprintRef.current.isLocal) {
            setActiveBlueprint(null);
        }
    }
    prevIsLoggedIn.current = isLoggedIn;
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && status === 'idle') {
        setupWorkspace();
    }
  }, [isLoggedIn, status, setupWorkspace]);

  useEffect(() => {
    if (!runId) return;

    const poll = async () => {
        try {
            const response = await fetch(`/api/sandbox/status/${runId}`);
            if (response.ok) {
                const newStatus: SandboxRunStatus = await response.json();
                setRunStatus(newStatus);
                if (newStatus.status === 'complete' || newStatus.status === 'error') {
                    clearInterval(intervalId);
                    if (newStatus.status === 'complete' && newStatus.resultUrl) {
                        const newResult: RunResult = {
                            runId: runId,
                            resultUrl: newStatus.resultUrl,
                            completedAt: new Date().toISOString(),
                            blueprintName: runningBlueprintName || 'Untitled Blueprint',
                        };
                        setRunHistory(prevHistory => {
                            const updatedHistory = [newResult, ...prevHistory].slice(0, 20);
                            try {
                                window.localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(updatedHistory));
                            } catch (e) {
                                console.error("Failed to save run history", e);
                            }
                            return updatedHistory;
                        });
                    }
                }
            } else if (response.status !== 404 && response.status !== 202) {
                setRunStatus({ status: 'error', message: `Failed to get status (HTTP ${response.status}).` });
                clearInterval(intervalId);
            }
        } catch (error) {
            setRunStatus({ status: 'error', message: 'Polling failed.' });
            clearInterval(intervalId);
        }
    };
    
    const intervalId = setInterval(poll, 3000);
    poll(); // Initial poll
    return () => clearInterval(intervalId);
  }, [runId, runningBlueprintName]);

  return {
    status,
    setupWorkspace,
    files,
    isFetchingFiles,
    isFetchingFileContent,
    activeBlueprint,
    loadFile,
    saveBlueprint,
    createBlueprint,
    deleteBlueprint,
    createPullRequest,
    forkName,
    // Evaluation state and functions
    runId,
    runStatus,
    runEvaluation,
    setRunStatus,
    setRunId,
    runHistory,
    createBlueprintWithContent,
    closeProposal,
    isFetchingGithubData,
    duplicateBlueprint,
    forkCreationRequired,
    setForkCreationRequired,
    isSyncingWithGitHub,
    promoteBlueprint,
    deletingFilePath,
    fetchFiles,
  };
} 