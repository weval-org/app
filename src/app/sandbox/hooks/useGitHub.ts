'use client';

import { useState, useCallback } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { BlueprintFile, PRStatus, ActiveBlueprint } from './useWorkspace';

const GITHUB_FILES_CACHE_KEY = 'sandboxV2_github_files_cache';
const PR_STATUSES_CACHE_KEY = 'sandboxV2_pr_statuses_cache';
const EXPECTED_FORK_REPO_NAME = 'weval-configs';

/**
 * Workspace state detection for granular error messages
 */
type WorkspaceState =
  | { type: 'not_logged_in' }
  | { type: 'missing_username' }
  | { type: 'setup_not_started' }
  | { type: 'setup_in_progress' }
  | { type: 'stale_fork', staleForkName: string }
  | { type: 'ready', forkName: string };

function detectWorkspaceState(
  isLoggedIn: boolean,
  username: string | null,
  forkName: string | null,
  isSyncingWithGitHub: boolean
): WorkspaceState {
  if (!isLoggedIn) {
    return { type: 'not_logged_in' };
  }

  if (!username) {
    return { type: 'missing_username' };
  }

  if (!forkName) {
    return isSyncingWithGitHub
      ? { type: 'setup_in_progress' }
      : { type: 'setup_not_started' };
  }

  // Check for stale fork name (old 'configs' instead of new 'weval-configs')
  const repoName = forkName.split('/')[1];
  if (repoName && repoName !== EXPECTED_FORK_REPO_NAME) {
    return { type: 'stale_fork', staleForkName: forkName };
  }

  return { type: 'ready', forkName };
}

/**
 * Generate user-friendly error message based on workspace state
 */
function getWorkspaceErrorMessage(state: WorkspaceState): {
  title: string;
  description: string;
  action?: { label: string; handler: () => void };
} {
  switch (state.type) {
    case 'not_logged_in':
      return {
        title: 'GitHub Login Required',
        description: 'Please log in with your GitHub account to save blueprints.',
      };

    case 'missing_username':
      return {
        title: 'GitHub Profile Error',
        description: 'Unable to retrieve your GitHub username. Please try logging out and logging back in.',
      };

    case 'setup_not_started':
      return {
        title: 'Workspace Not Set Up',
        description: 'Your workspace needs to be initialized before you can save files. Please complete the workspace setup first.',
      };

    case 'setup_in_progress':
      return {
        title: 'Setup In Progress',
        description: 'Your workspace is being set up. Please wait a moment and try again.',
      };

    case 'stale_fork':
      return {
        title: 'Workspace Needs Update',
        description: `Your workspace is using an outdated fork (${state.staleForkName}). Please reset your workspace to use the new format.`,
      };

    default:
      return {
        title: 'Unknown Error',
        description: 'An unexpected error occurred. Please refresh the page.',
      };
  }
}

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

        // Check if API is telling us fork creation is required
        if (result.forkCreationRequired) {
            console.log('[setupWorkspace] API returned forkCreationRequired=true');
            setForkCreationRequired(true);
            setSetupMessage('');
            return { forkCreationRequired: true };
        }

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
    // Check workspace state with granular error detection
    const state = detectWorkspaceState(isLoggedIn, username, forkName, isSyncingWithGitHub);
    if (state.type !== 'ready') {
      const errorInfo = getWorkspaceErrorMessage(state);
      toast({
        variant: "destructive",
        title: errorInfo.title,
        description: errorInfo.description,
      });
      return null;
    }

    if (!branchName) {
      toast({
        variant: "destructive",
        title: "Branch Required",
        description: "A branch name is required to update a file on GitHub. This is a technical error - please refresh the page.",
      });
      return null;
    }

    try {
      const response = await fetch('/api/github/workspace/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          content,
          sha,
          forkName: state.forkName,
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
      console.error('[useGitHub] Update file failed:', e);
      toast({
        variant: "destructive",
        title: "Failed to Update File",
        description: e.message || 'Could not save changes to GitHub. Your changes are preserved locally.',
      });
      return null;
    }
  }, [isLoggedIn, username, forkName, isSyncingWithGitHub, toast]);

  const promoteBlueprintToBranch = useCallback(async (
    filename: string,
    content: string,
    existingProposal?: BlueprintFile
  ): Promise<BlueprintFile | null> => {
    // Check workspace state with granular error detection
    const state = detectWorkspaceState(isLoggedIn, username, forkName, isSyncingWithGitHub);
    if (state.type !== 'ready') {
      const errorInfo = getWorkspaceErrorMessage(state);
      toast({
        variant: "destructive",
        title: errorInfo.title,
        description: errorInfo.description,
      });
      return null;
    }

    try {
      let branchName: string;
      let isNew: boolean;
      let sha: string | null = null;

      if (existingProposal && existingProposal.branchName) {
        // Reuse existing proposal branch
        branchName = existingProposal.branchName;
        isNew = false;
        sha = existingProposal.sha; // Need SHA for update
        console.log('[promoteBlueprintToBranch] Reusing existing branch:', branchName);
      } else {
        // Create new proposal branch
        const cleanFilename = filename.replace(/\.yml$/, '').replace(/[^a-zA-Z0-9-]/g, '-');
        branchName = `proposal/${cleanFilename}-${Date.now()}`;
        isNew = true;
        console.log('[promoteBlueprintToBranch] Creating new branch:', branchName);
      }

      const response = await fetch('/api/github/workspace/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `blueprints/users/${username}/${filename}`,
          content: content,
          sha: sha,
          forkName: state.forkName,
          isNew: isNew,
          branchName: branchName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save blueprint to GitHub.');
      }

      const newFile = await response.json();

      const fileWithBranch = { ...newFile, branchName };

      const actionVerb = isNew ? 'created' : 'updated';
      toast({
        title: "Saved to GitHub",
        description: `Successfully saved ${filename} to ${isNew ? 'a new' : 'existing'} branch.`
      });
      return fileWithBranch;
    } catch (e: any) {
      console.error('[useGitHub] Promote blueprint failed:', {
        filename,
        existingProposal: existingProposal?.branchName,
        error: e.message,
      });

      let errorMessage = e.message;
      if (e.message?.includes('Reference already exists')) {
        errorMessage = 'A branch with this name already exists. Try refreshing the page.';
      } else if (e.message?.includes('authentication') || e.message?.includes('401')) {
        errorMessage = 'GitHub authentication failed. Please log out and log back in.';
      }

      toast({
        variant: "destructive",
        title: "Failed to Save to GitHub",
        description: errorMessage || 'Could not create file on GitHub. Your local draft is preserved.',
      });
      return null;
    }
  }, [isLoggedIn, forkName, username, isSyncingWithGitHub, toast]);

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

        console.log('[useGitHub] PR created:', {
            number: prData.number,
            url: prData.url, // API endpoint
            html_url: prData.html_url, // Browser URL
        });

        const newPrStatus: PRStatus = {
            number: prData.number,
            state: 'open',
            merged: false,
            url: prData.html_url, // Use html_url for browser viewing
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
      throw new Error("Fork not available. Please refresh the page or log in again.");
    }

    console.log('[useGitHub] Loading file from GitHub:', { path, branchName });

    const url = `/api/github/workspace/file?path=${encodeURIComponent(path)}&forkName=${encodeURIComponent(forkName)}${branchName ? `&branchName=${encodeURIComponent(branchName)}` : ''}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const err = await response.json();
        const errorMessage = err.error || 'Failed to load file content from GitHub';

        console.error('[useGitHub] Load file content failed:', {
          path,
          branchName,
          status: response.status,
          error: errorMessage,
        });

        // Provide more specific error messages
        if (response.status === 404) {
          throw new Error(`File not found: ${path}. It may have been deleted or moved.`);
        } else if (response.status === 403) {
          throw new Error('Access denied. You may not have permission to read this file.');
        } else if (response.status === 401) {
          throw new Error('Authentication failed. Please log out and log back in.');
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('[useGitHub] Successfully loaded file from GitHub');
      return data;
    } catch (e: any) {
      console.error('[useGitHub] Unexpected error loading file:', e);
      throw e;
    }
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

  /**
   * Reset workspace state - clears local cache and fork configuration
   * Use this when user needs to start fresh (e.g., stale fork, corrupted state)
   */
  const resetWorkspace = useCallback(() => {
    console.log('[resetWorkspace] Clearing workspace state and cache');

    // Clear React state
    setForkName(null);
    setPrStatuses({});
    setForkCreationRequired(false);
    setIsSyncingWithGitHub(false);
    setSetupMessage('');

    // Clear localStorage cache
    try {
      window.localStorage.removeItem(GITHUB_FILES_CACHE_KEY);
      window.localStorage.removeItem(PR_STATUSES_CACHE_KEY);
      console.log('[resetWorkspace] Cleared localStorage cache');
    } catch (e) {
      console.warn('[resetWorkspace] Failed to clear localStorage:', e);
    }

    toast({
      title: 'Workspace Reset',
      description: 'Your workspace has been reset. Please set up your workspace again to continue.',
    });
  }, [toast]);

  /**
   * Detect current workspace state for error handling
   */
  const workspaceState = detectWorkspaceState(
    isLoggedIn,
    username,
    forkName,
    isSyncingWithGitHub
  );

  return {
    forkName,
    prStatuses,
    forkCreationRequired,
    isSyncingWithGitHub,
    setupMessage,
    workspaceState,
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
    resetWorkspace,
  };
} 