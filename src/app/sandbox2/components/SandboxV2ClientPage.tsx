'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useWorkspace } from '../hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { FileNavigator } from './FileNavigator';
import { EditorPanel } from './EditorPanel';
import { ProposeBlueprintModal } from './ProposeBlueprintModal';

export default function SandboxV2ClientPage() {
  const { user, isLoading: isAuthLoading, error: authError } = useAuth();
  const { 
    status: workspaceStatus, 
    error: workspaceError, 
    setupWorkspace,
    files,
    activeBlueprint,
    loadFile,
    saveBlueprint,
    createBlueprint,
    deleteBlueprint,
    createPullRequest,
    forkName,
  } = useWorkspace(!!user?.isLoggedIn, user?.username || null);

  const [isPrModalOpen, setIsPrModalOpen] = useState(false);

  useEffect(() => {
    // This effect is no longer needed as the new setup flow handles it.
    // if (user?.isLoggedIn && workspaceStatus === 'idle') {
    //   setupWorkspace();
    // }
  }, [user, workspaceStatus, setupWorkspace]);

  if (isAuthLoading) {
    return (
        <div className="flex h-screen items-center justify-center">
            <p>Loading Sandbox Studio...</p>
        </div>
    );
  }

  const error = authError || (workspaceError ? new Error(workspaceError) : null);
  if (error) {
    return (
        <div className="flex h-screen items-center justify-center text-red-500">
            <p>Error: {error.message}</p>
        </div>
    );
  }

  const handleLogin = () => {
    // Redirect to the GitHub auth request endpoint
    window.location.href = '/api/github/auth/request';
  };

  const handleCreatePr = async ({ title, body }: { title: string; body: string }) => {
    const prUrl = await createPullRequest({ title, body });
    if (prUrl) {
      setIsPrModalOpen(false);
      window.alert(`Successfully created Pull Request! You can view it here: ${prUrl}`);
    } else {
      // Error is handled in the hook, but you might want specific UI feedback here
      window.alert(`Failed to create Pull Request. Check console for errors.`);
    }
  };

  const renderLoggedInContent = () => {
    if (workspaceStatus === 'setting_up') {
        return <div className="p-4"><p>Setting up your workspace by forking the blueprints repository...</p></div>;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] h-full">
            <FileNavigator
                files={files}
                activeFilePath={activeBlueprint?.path || null}
                onSelectFile={(file) => loadFile(file)}
                onDeleteFile={(file) => deleteBlueprint(file)}
                onCreateNew={() => {
                    const filename = window.prompt("Enter the name for the new blueprint file (e.g., my-first-blueprint):");
                    if (filename) {
                        createBlueprint(filename);
                    }
                }}
                isLoading={workspaceStatus === 'loading' && files.length === 0}
                isCreating={workspaceStatus === 'saving'}
                isDeleting={workspaceStatus === 'deleting'}
            />
            <EditorPanel
                activeBlueprint={activeBlueprint}
                isLoading={workspaceStatus === 'loading' && !activeBlueprint}
                isSaving={workspaceStatus === 'saving'}
                onSave={saveBlueprint}
            />
        </div>
    );
  };

  return (
    <>
      <ProposeBlueprintModal
        isOpen={isPrModalOpen}
        onClose={() => setIsPrModalOpen(false)}
        onSubmit={handleCreatePr}
        isSubmitting={workspaceStatus === 'creating_pr'}
      />
      <div className="h-screen flex flex-col">
          <header className="border-b p-4 flex justify-between items-center shrink-0">
              <h1 className="text-xl font-bold">Sandbox Studio v2</h1>
              {user?.isLoggedIn ? (
                  <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => setIsPrModalOpen(true)}>
                      Create Pull Request
                    </Button>
                    <div className="text-sm text-right">
                        <span>Logged in as <strong>{user.username}</strong></span>
                        {forkName && (
                            <div className="text-xs text-muted-foreground">
                                Editing in: <a href={`https://github.com/${user.username}/${forkName}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{`${user.username}/${forkName}`}</a>
                            </div>
                        )}
                    </div>
                  </div>
              ) : (
                  <Button onClick={handleLogin}>Login with GitHub</Button>
              )}
          </header>

          <main className="flex-grow overflow-hidden">
              {user?.isLoggedIn ? renderLoggedInContent() : (
                  <div className="p-4">
                      <h2 className="text-lg">Anonymous User View</h2>
                      <p>Editor Coming Soon...</p>
                  </div>
              )}
          </main>
      </div>
    </>
  );
} 