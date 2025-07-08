'use client';

import { useState, useCallback } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { BlueprintFile, PRStatus, ActiveBlueprint } from './useWorkspace';

const GITHUB_FILES_CACHE_KEY = 'sandboxV2_github_files_cache';
const PR_STATUSES_CACHE_KEY = 'sandboxV2_pr_statuses_cache';

export function useGitHub(isLoggedIn: boolean, username: string | null) {
  const { toast } = useToast();

  const [forkName, setForkName] = useState<string | null>(null);
  const [prStatuses, setPrStatuses] = useState<Record<string, PRStatus>>({});
  const [forkCreationRequired, setForkCreationRequired] = useState(false);
  const [isSyncingWithGitHub, setIsSyncingWithGitHub] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string>('');

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

  const fetchPrStatuses = useCallback(async (): Promise<Record<string, PRStatus>> => {
      if (!isLoggedIn) return {};
      try {
          const response = await fetch('/api/github/workspace/prs-status');
          if (response.ok) {
              return await response.json();
          }
      } catch (e) {
          console.warn("Failed to fetch PR statuses", e);
      }
      return {};
  }, [isLoggedIn]);

  const setupWorkspace = useCallback(async (createFork = false) => {
    console.log(`[setupWorkspace] Starting. createFork: ${createFork}, current forkName: ${forkName}`);
    setSetupMessage('Checking your GitHub account...');
    
    try {
        setSetupMessage('Connecting to GitHub...');
        
        if (createFork) {
            setSetupMessage('Creating your personal fork of the blueprint repository...');
        } else {
            setSetupMessage('Looking for your existing fork...');
        }
        
        const response = await fetch('/api/github/workspace/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ createFork }),
        });

        if (!response.ok) {
            const err = await response.json();
            if (response.status === 401) {
                return { authFailure: true };
            }
            
            if (err.forkCreationRequired) {
                setForkCreationRequired(true);
                setSetupMessage('');
                return { forkCreationRequired: true };
            }
            
            throw new Error(err.error || 'Failed to set up workspace');
        }

        const result = await response.json();
        console.log('[setupWorkspace] Setup response:', result);
        
        if (result.forkCreated) {
            setSetupMessage('Fork created successfully! Setting up your blueprint directory...');
        } else {
            setSetupMessage('Found existing fork. Setting up your blueprint directory...');
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log(`[setupWorkspace] Setting forkName to: ${result.forkName}`);
        setForkName(result.forkName);
        setForkCreationRequired(false);
        
        setSetupMessage('Loading your blueprints...');
        
        return { success: true, forkName: result.forkName };
    } catch (error: any) {
        console.error('[setupWorkspace] Error:', error);
        toast({
            variant: 'destructive',
            title: 'Setup Failed',
            description: error.message,
        });
        setSetupMessage('');
        return { error: error.message };
    }
  }, [toast, forkName]);

  const updateFileOnGitHub = useCallback(async (path: string, content: string, sha: string, branchName: string): Promise<BlueprintFile | null> => {
    if (!isLoggedIn || !forkName) {
      throw new Error('User not logged in or fork not available.');
    }
    if (!branchName) {
      throw new Error('A branch name is required to update a file on GitHub.');
    }

    try {
      const response = await fetch('/api/github/workspace/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          content,
          sha,
          forkName,
          isNew: false,
          branchName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update blueprint on GitHub.');
      }

      const updatedFile = await response.json();
      toast({ title: "Saved to GitHub", description: `Successfully updated ${updatedFile.name}.` });
      return updatedFile;
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error Updating on GitHub",
        description: e.message,
      });
      return null;
    }
  }, [isLoggedIn, forkName, toast]);

  const promoteBlueprintToBranch = useCallback(async (filename: string, content: string): Promise<BlueprintFile | null> => {
    if (!isLoggedIn || !forkName || !username) {
      throw new Error('User not logged in or fork not available.');
    }

    try {
      const cleanFilename = filename.replace(/\.yml$/, '').replace(/[^a-zA-Z0-9-]/g, '-');
      const branchName = `proposal/${cleanFilename}-${Date.now()}`;

      const response = await fetch('/api/github/workspace/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `blueprints/users/${username}/${filename}`,
          content: content,
          sha: null,
          forkName: forkName,
          isNew: true,
          branchName: branchName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save blueprint to GitHub.');
      }

      const newFile = await response.json();
      
      const fileWithBranch = { ...newFile, branchName };

      toast({ title: "Saved to GitHub", description: `Successfully saved ${filename} to a new branch.` });
      return fileWithBranch;
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error Saving to GitHub",
        description: e.message,
      });
      return null;
    }
  }, [isLoggedIn, forkName, username, toast]);

  const createPullRequest = useCallback(async (data: { title: string; body: string }, activeBlueprint: ActiveBlueprint) => {
    if (!activeBlueprint || !forkName || !activeBlueprint.branchName) {
        throw new Error('No active blueprint, fork, or branch available to create a PR.');
    }

    try {
        const response = await fetch('/api/github/pr/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: data.title,
                body: data.body,
                forkName: forkName,
                headBranch: activeBlueprint.branchName,
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to create pull request.');
        }

        const prData = await response.json();
        
        const newPrStatus: PRStatus = {
            number: prData.number,
            state: 'open',
            merged: false,
            url: prData.url,
            title: data.title,
        };

        setPrStatuses(prev => ({ ...prev, [activeBlueprint.path]: newPrStatus }));
        
        toast({
            title: "Pull Request Created",
            description: `Successfully created PR #${prData.number}: ${data.title}`,
        });

        return {prData, newPrStatus};
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Failed to Create PR',
            description: error.message,
        });
        throw error;
    }
  }, [forkName, toast]);

  const closeProposal = useCallback(async (prNumber: number) => {
      if (!isLoggedIn) return { updatedPrStatuses: prStatuses, closedPath: null };
      
      try {
          const response = await fetch('/api/github/pr/close', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prNumber }),
          });

          if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error || 'Failed to close PR.');
          }
          
          const { closedPath } = await response.json();

          const newStatuses = { ...prStatuses };
          if (closedPath && newStatuses[closedPath]) {
              newStatuses[closedPath].state = 'closed';
          }
          
          setPrStatuses(newStatuses);
          saveCache([], newStatuses);

          toast({ title: "Proposal Closed", description: `Successfully closed PR #${prNumber}` });
          return { updatedPrStatuses: newStatuses, closedPath };
      } catch (error: any) {
          toast({
              variant: 'destructive',
              title: 'Failed to Close PR',
              description: error.message,
          });
          return { updatedPrStatuses: prStatuses, closedPath: null };
      }
  }, [isLoggedIn, prStatuses, saveCache, toast]);

  const deleteFileFromGitHub = useCallback(async (path: string, sha: string, branchName: string) => {
    if (!forkName) {
        throw new Error("Fork name not available");
    }
    if (!branchName) {
        console.warn(`Deleting file ${path} from default branch.`);
    }
    await fetch('/api/github/workspace/file', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, sha, forkName, branchName }),
    });
  }, [forkName]);
  
  const loadFileContentFromGitHub = useCallback(async (path: string, branchName?: string) => {
    if (!forkName) {
      throw new Error("Fork name not available");
    }
    const url = `/api/github/workspace/file?path=${encodeURIComponent(path)}&forkName=${encodeURIComponent(forkName)}${branchName ? `&branchName=${encodeURIComponent(branchName)}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to load file content.');
    }
    return response.json();
  }, [forkName]);

  const renameFile = useCallback(async (oldPath: string, newName: string, branchName: string): Promise<BlueprintFile | null> => {
    if (!forkName) {
      toast({ variant: 'destructive', title: 'Error', description: 'Fork name not available.' });
      return null;
    }
    if (!branchName) {
        toast({ variant: 'destructive', title: 'Error', description: 'Branch name is required for renaming.' });
        return null;
    }

    try {
      const response = await fetch('/api/github/workspace/file', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newName, forkName, branchName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to rename blueprint on GitHub.');
      }

      const renamedFile = await response.json();
      toast({ title: "Renamed on GitHub", description: `Successfully renamed to ${newName}.` });
      return { ...renamedFile, branchName };
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error Renaming on GitHub",
        description: e.message,
      });
      return null;
    }
  }, [forkName, toast]);

  return {
    forkName,
    prStatuses,
    forkCreationRequired,
    isSyncingWithGitHub,
    setupMessage,
    setForkName,
    setForkCreationRequired,
    setIsSyncingWithGitHub,
    setSetupMessage,
    loadCache,
    saveCache,
    fetchPrStatuses,
    setupWorkspace,
    updateFileOnGitHub,
    promoteBlueprintToBranch,
    createPullRequest,
    closeProposal,
    deleteFileFromGitHub,
    loadFileContentFromGitHub,
    renameFile,
  };
} 