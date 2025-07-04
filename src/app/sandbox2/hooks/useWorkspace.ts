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
}

export interface ActiveBlueprint extends BlueprintFile {
    content: string;
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

export type WorkspaceStatus = 'idle' | 'setting_up' | 'loading' | 'ready' | 'saving' | 'deleting' | 'creating_pr' | 'running_eval';

const LOCAL_STORAGE_BLUEPRINT_KEY = 'sandboxV2_blueprints';

export const DEFAULT_BLUEPRINT_CONTENT = `title: "My First Blueprint"
description: "A test to see how different models respond to my prompts."
---
- prompt: "Your first prompt here."
  should:
    - "An expectation for the response."`;

export function useWorkspace(isLoggedIn: boolean, username: string | null) {
  const { toast } = useToast();
  const [status, setStatus] = useState<WorkspaceStatus>('idle');
  const [isFetchingFiles, setIsFetchingFiles] = useState(false);
  const [isFetchingFileContent, setIsFetchingFileContent] = useState(false);
  const [files, setFiles] = useState<BlueprintFile[]>([]);
  const [activeBlueprint, setActiveBlueprint] = useState<ActiveBlueprint | null>(null);
  const activeBlueprintRef = useRef(activeBlueprint);
  activeBlueprintRef.current = activeBlueprint;
  const [forkName, setForkName] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<SandboxRunStatus>({ status: 'idle' });

  // Ref to hold the latest state that callbacks might need.
  const stateRef = useRef({ isLoggedIn, forkName });
  useEffect(() => {
    stateRef.current = { isLoggedIn, forkName };
  }, [isLoggedIn, forkName]);

  const loadFile = useCallback(async (file: BlueprintFile) => {
    if (activeBlueprintRef.current?.path === file.path) {
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
            setStatus('ready');
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
        setStatus('ready');
    } catch (e: any) {
        toast({
            variant: "destructive",
            title: "Error loading file",
            description: e.message,
        });
        setStatus('ready');
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

  const runEvaluation = useCallback(async (models?: string[]) => {
    if (!activeBlueprint) {
        toast({ variant: 'destructive', title: 'No blueprint selected', description: 'Please select a blueprint to run an evaluation.'});
        return;
    }

    setStatus('running_eval');
    setRunStatus({ status: 'pending', message: 'Initiating evaluation...' });
    setRunId(null);
    
    try {
        const response = await fetch('/api/sandbox2/run', {
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

  const fetchFiles = useCallback(async () => {
    setIsFetchingFiles(true);
    let githubFiles: BlueprintFile[] = [];
    if (isLoggedIn && forkName) {
        try {
            const listRes = await fetch(`/api/github/workspace/files?forkName=${forkName}`);
            if (listRes.ok) {
                const fileList = await listRes.json();
                // Fetch last commit date for each file
                const filesWithDates = await Promise.all(fileList.map(async (file: BlueprintFile) => {
                    const commitRes = await fetch(`/api/github/workspace/file-commit?forkName=${forkName}&path=${encodeURIComponent(file.path)}`);
                    if (commitRes.ok) {
                        const { date } = await commitRes.json();
                        return { ...file, lastModified: date };
                    }
                    return file;
                }));
                githubFiles = filesWithDates.map(f => ({ ...f, isLocal: false }));
            }
        } catch (e) {
            console.error("Failed to fetch GitHub files", e);
            toast({ variant: "destructive", title: "Error fetching files", description: "Could not retrieve blueprints from GitHub." });
        }
    }

    const localFiles = loadFilesFromLocalStorage();
    
    let combinedFiles = [...githubFiles, ...localFiles];

    if (combinedFiles.length === 0 && !isLoggedIn) {
        combinedFiles = initializeDefaultBlueprint();
    }
    
    combinedFiles.sort((a, b) => {
        const dateA = a.lastModified ? new Date(a.lastModified) : new Date(0);
        const dateB = b.lastModified ? new Date(b.lastModified) : new Date(0);
        return dateB.getTime() - dateA.getTime();
    });

    setFiles(combinedFiles);
    
    if (combinedFiles.length > 0) {
      setActiveBlueprint(currentBlueprint => {
        if (!currentBlueprint) {
          loadFile(combinedFiles[0]);
        }
        return currentBlueprint;
      });
    }

    setIsFetchingFiles(false);
    return combinedFiles;
    
  }, [forkName, toast, isLoggedIn, loadFilesFromLocalStorage, initializeDefaultBlueprint, loadFile]);

  const setupWorkspace = useCallback(async () => {
    if (!isLoggedIn) return;
    setStatus('setting_up');
    try {
      const response = await fetch('/api/github/workspace/setup', { method: 'POST' });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to set up workspace');
      }
      const { forkName: newForkName } = await response.json();
      setForkName(newForkName);
      setStatus('ready');
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error setting up workspace",
        description: e.message,
      });
      setStatus('idle'); // Revert to idle if setup fails
    }
  }, [toast, isLoggedIn]);

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

  const createBlueprint = useCallback(async (filename: string) => {
    const finalFilename = filename.endsWith('.yml') ? filename : `${filename}.yml`;

    if (!isLoggedIn) {
      // Anonymous / LocalStorage Logic
      setStatus('saving');
      const newPath = `local/${uuidv4()}.yml`;
      const newFile: BlueprintFile = {
        name: finalFilename,
        path: newPath,
        sha: uuidv4(),
        isLocal: true,
      };
      const newBlueprint: ActiveBlueprint = {
        ...newFile,
        content: DEFAULT_BLUEPRINT_CONTENT.replace('My First Blueprint', finalFilename.replace('.yml', '')),
      };
      
      setFiles(files => {
          const updatedFiles = [...files, newFile];
          window.localStorage.setItem(LOCAL_STORAGE_BLUEPRINT_KEY, JSON.stringify(updatedFiles));
          return updatedFiles;
      });
      window.localStorage.setItem(newPath, JSON.stringify(newBlueprint));
      
      setActiveBlueprint(newBlueprint);
      setStatus('ready');
      toast({ title: "Blueprint Created", description: `New blueprint '${finalFilename}' created locally.`});
      return;
    }

    // GitHub Logic
    if (!username || !forkName) {
        toast({
            variant: "destructive",
            title: "Error creating file",
            description: "Cannot create file: user or fork name is missing.",
        });
        return;
    }

    const initialStatus = status;
    setStatus('saving');
    try {
        const newPath = `blueprints/users/${username}/${finalFilename}`;
        const defaultContent = `title: "New Blueprint: ${filename}"\ndescription: "A brand new blueprint."\n---\n- prompt: "Your first prompt here."\n  should:\n    - "An expectation for the response."`;

        const response = await fetch('/api/github/workspace/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: newPath,
                content: defaultContent,
                forkName: forkName,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create blueprint.');
        }

        await fetchFiles();

    } catch (err: any) {
        toast({
            variant: "destructive",
            title: "Error creating blueprint",
            description: err.message,
        });
    } finally {
        if (status === 'saving') {
            setStatus('ready');
        }
    }
  }, [username, forkName, fetchFiles, toast, status, isLoggedIn, files]);

  const deleteBlueprint = useCallback(async (file: BlueprintFile) => {
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
            toast({ title: "Blueprint Deleted", description: `Blueprint '${file.name}' was deleted.` });
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

    setStatus('deleting');
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
        }
        
    } catch (err: any) {
        toast({
            variant: "destructive",
            title: "Error deleting blueprint",
            description: err.message,
        });
    } finally {
        setStatus('ready');
    }
  }, [forkName, activeBlueprint, toast, isLoggedIn]);

  const createPullRequest = useCallback(async ({ title, body }: { title: string; body: string }) => {
    if (!isLoggedIn || !forkName) {
      toast({
        variant: "destructive",
        title: "Error creating pull request",
        description: "Cannot create PR: fork name is missing.",
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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create pull request.');
      }

      const prData = await response.json();
      return prData.html_url;

    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error creating pull request",
        description: err.message,
      });
      return null;
    } finally {
        setStatus('ready');
    }
  }, [forkName, toast, isLoggedIn]);

  const createBlueprintWithContent = useCallback(async (filename: string, content: string): Promise<BlueprintFile | null> => {
    setStatus('saving');
    const newPath = isLoggedIn ? `blueprints/users/${username}/${filename}` : `local/${uuidv4()}-${filename}`;

    if (isLoggedIn && forkName && username) {
        try {
            const response = await fetch('/api/github/workspace/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: newPath,
                    content: content,
                    forkName: forkName,
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || `Failed to create file: ${filename}`);
            }
            toast({ title: "Blueprint Created", description: `Successfully created ${filename} in your repository.` });
            const updatedFiles = await fetchFiles();
            // The file list is now updated, find the new file and load it
            if (updatedFiles) {
                const newFile = updatedFiles.find(f => f.path === newPath);
                if(newFile) {
                    loadFile(newFile);
                    return newFile;
                }
            }
            return null;

        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error creating file', description: e.message });
            return null;
        } finally {
            setStatus('ready');
        }
    } else {
        // Not logged in, save to local storage
        const newFile: BlueprintFile = {
            path: newPath,
            name: filename,
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
            
            setFiles(currentFiles => [newFile, ...currentFiles]);
            setActiveBlueprint(newBlueprint);
            
            toast({ title: "Blueprint Created", description: `Successfully created ${filename} locally.` });
            return newFile;

        } catch (e: any) {
             toast({ variant: 'destructive', title: 'Error saving to Local Storage', description: e.message });
        } finally {
            setStatus('ready');
        }
    }
    return null;
  }, [isLoggedIn, forkName, toast, fetchFiles, files, loadFile, loadFilesFromLocalStorage, username]);

  useEffect(() => {
    if (status === 'ready' || !isLoggedIn) { // Fetch files when ready, or immediately for local-only
        fetchFiles();
    }
  }, [status, isLoggedIn, fetchFiles]);

  useEffect(() => {
    if (isLoggedIn && status === 'idle') {
        setupWorkspace();
    }
  }, [isLoggedIn, status, setupWorkspace]);

  useEffect(() => {
    if (!runId) return;

    const poll = async () => {
        try {
            const response = await fetch(`/api/sandbox2/status/${runId}`);
            if (response.ok) {
                const newStatus: SandboxRunStatus = await response.json();
                setRunStatus(newStatus);
                if (newStatus.status === 'complete' || newStatus.status === 'error') {
                    clearInterval(intervalId);
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
  }, [runId]);

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
    createBlueprintWithContent,
  };
} 