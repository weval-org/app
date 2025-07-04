'use client';

import { useState, useCallback, useEffect } from 'react';

export interface BlueprintFile {
    name: string;
    path: string;
    sha: string;
}

export interface ActiveBlueprint extends BlueprintFile {
    content: string;
}

export type WorkspaceStatus = 'idle' | 'setting_up' | 'loading' | 'ready' | 'saving' | 'deleting' | 'creating_pr' | 'error';

export function useWorkspace(isLoggedIn: boolean, username: string | null) {
  const [status, setStatus] = useState<WorkspaceStatus>('idle');
  const [files, setFiles] = useState<BlueprintFile[]>([]);
  const [activeBlueprint, setActiveBlueprint] = useState<ActiveBlueprint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forkName, setForkName] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    if (!forkName) return;
    setStatus('loading');
    try {
      const response = await fetch(`/api/github/workspace/files?forkName=${forkName}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to list files');
      };
      const fileList = await response.json();
      setFiles(fileList);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStatus('ready');
    }
  }, [forkName]);

  const setupWorkspace = useCallback(async () => {
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
      setError(e.message);
      setStatus('error');
    }
  }, []);

  const loadFile = useCallback(async (file: BlueprintFile) => {
    if (!forkName) return;
    setStatus('loading');
    setActiveBlueprint(null);
    try {
        const response = await fetch(`/api/github/workspace/file?path=${encodeURIComponent(file.path)}&forkName=${forkName}`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || `Failed to load file: ${file.name}`);
        }
        const { content, sha } = await response.json();
        setActiveBlueprint({ ...file, content, sha });
        setStatus('ready');
    } catch (e: any) {
        setError(e.message);
        setStatus('error');
    }
  }, [forkName]);

  const saveBlueprint = useCallback(async (content: string) => {
    if (!activeBlueprint || !forkName) {
        setError("No active blueprint or fork name to save.");
        return;
    }

    setStatus('saving');
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
        setStatus('ready');

    } catch (err: any) {
        setError(err.message);
        setStatus('error');
    }
  }, [activeBlueprint, forkName]);

  const createBlueprint = useCallback(async (filename: string) => {
    const finalFilename = filename.endsWith('.yml') ? filename : `${filename}.yml`;

    if (!username || !forkName) {
        setError("Cannot create file: user or fork name is missing.");
        setStatus('error');
        return;
    }

    setStatus('saving');
    try {
        const newPath = `blueprints/users/${username}/${finalFilename}`;
        const defaultContent = `title: "New Blueprint: ${filename}"\ndescription: "A brand new blueprint."\nmodels: ["openai:gpt-4o-mini"]\n---\n- prompt: "Your first prompt here."\n  should:\n    - "An expectation for the response."`;

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
        setError(err.message);
        setStatus('error');
    } finally {
        if (status === 'saving') {
            setStatus('ready');
        }
    }
  }, [username, forkName, fetchFiles, status]);

  const deleteBlueprint = useCallback(async (file: BlueprintFile) => {
    if (!forkName) {
        setError("Cannot delete file: fork name is missing.");
        setStatus('error');
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
        
        setStatus('ready');

    } catch (err: any) {
        setError(err.message);
        setStatus('error');
    }
  }, [forkName, activeBlueprint]);

  const createPullRequest = useCallback(async ({ title, body }: { title: string; body: string }) => {
    if (!forkName) {
      setError("Cannot create PR: fork name is missing.");
      setStatus('error');
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
      setStatus('ready');
      return prData.html_url;

    } catch (err: any) {
      setError(err.message);
      setStatus('error');
      return null;
    }
  }, [forkName]);

  useEffect(() => {
    if (isLoggedIn && forkName) {
        fetchFiles();
    }
  }, [isLoggedIn, forkName, fetchFiles]);

  useEffect(() => {
    if (isLoggedIn && status === 'idle') {
        setupWorkspace();
    }
  }, [isLoggedIn, status, setupWorkspace]);

  return {
    status,
    error,
    setupWorkspace,
    files,
    activeBlueprint,
    loadFile,
    saveBlueprint,
    createBlueprint,
    deleteBlueprint,
    createPullRequest,
    forkName,
  };
} 