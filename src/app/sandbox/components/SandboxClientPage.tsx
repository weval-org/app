'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import * as yaml from 'js-yaml';
import { useAuth } from '../hooks/useAuth';
import { useWorkspace, ActiveBlueprint } from '../hooks/useWorkspace';
import { useToast } from '@/components/ui/use-toast';
import { Toaster } from "@/components/ui/toaster";
import { ProposalWizard } from './ProposalWizard';
import { EditorPanel } from './EditorPanel';
import { FormPanel } from './FormPanel';
import { RunStatusModal } from './RunStatusModal';
import { RunEvaluationModal } from './RunEvaluationModal';
import { AnonymousRunModal } from './AnonymousRunModal';
import { Button } from '@/components/ui/button';
import { FileNavigator } from './FileNavigator';
import { Separator } from '@/components/ui/separator';
import { ComparisonConfig } from '@/cli/types/cli_types';
import { AutoCreateModal } from './AutoCreateModal';
import { DEFAULT_BLUEPRINT_CONTENT } from '../hooks/useWorkspace';
import { generateMinimalBlueprintYaml } from '../utils/yaml-generator';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';
import { useImmer } from 'use-immer';
import { InputModal } from './InputModal';
import { WorkspaceSetupModal } from './WorkspaceSetupModal';
import { RunsSidebar } from './RunsSidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TourProvider, useTour, StepType } from '@reactour/tour';

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2), { ssr: false });
const Save = dynamic(() => import('lucide-react').then(mod => mod.Save), { ssr: false });
const GitPullRequest = dynamic(() => import('lucide-react').then(mod => mod.GitPullRequest), { ssr: false });
const Github = dynamic(() => import('lucide-react').then(mod => mod.Github), { ssr: false });
const FlaskConical = dynamic(() => import('lucide-react').then(mod => mod.FlaskConical), { ssr: false });
const MoreVertical = dynamic(() => import('lucide-react').then(mod => mod.MoreVertical), { ssr: false });
const History = dynamic(() => import('lucide-react').then(mod => mod.History), { ssr: false });
const ExternalLink = dynamic(() => import('lucide-react').then(mod => mod.ExternalLink), { ssr: false });
const HelpCircle = dynamic(() => import('lucide-react').then(mod => mod.HelpCircle), { ssr: false });

const getTourSteps = (isLoggedIn: boolean, activeBlueprint: ActiveBlueprint | null): StepType[] => {
    const steps: StepType[] = [
        {
          selector: '[data-tour="file-navigator"]',
          content: 'This is the File Navigator. You can manage your local and GitHub-synced blueprints here. Create new files, or generate one with AI.',
        },
    ];

    if (!isLoggedIn) {
        steps.push({
            selector: '[data-tour="login-button"]',
            content: 'Connect your GitHub account to save your work, create proposals, and sync blueprints to your own repository.',
        });
    }

    steps.push(
        {
          selector: '[data-tour="form-panel"]',
          content: 'This is the Form Panel. It provides a structured, user-friendly way to build your blueprint without writing YAML by hand.',
        },
        {
            selector: '[data-tour="yaml-panel"]',
            content: 'This is the YAML editor. For advanced use, you can directly edit the raw blueprint source code here. The form and YAML are kept in sync.',
        },
        {
          selector: '[data-tour="run-evaluation-button"]',
          content: 'When your blueprint is ready, run it against a suite of models to see how they perform.',
        },
        {
            selector: '[data-tour="runs-history-button"]',
            content: "View the history of your past runs for this blueprint in the Runs Sidebar.",
        }
    );

    if (isLoggedIn && activeBlueprint && !activeBlueprint.isLocal && !activeBlueprint.prStatus) {
        steps.push({
            selector: '[data-tour="proposal-button"]',
            content: 'Since you are signed in with GitHub and this blueprint is in your repository, you can propose to add it to the public library.',
        });
    }

    return steps;
};

const TourButton = () => {
    const { setIsOpen } = useTour();
    return (
        <Button onClick={() => setIsOpen(true)} size="icon" variant="ghost" className="relative" title="Show Tour">
            <HelpCircle className="w-5 h-5" />
        </Button>
    );
};

function SandboxClientPageInternal() {
    const { user, isLoading: isAuthLoading, clearAuth } = useAuth();
    const {
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
        setupWorkspace,
        loadFile,
        setEditorContent,
        handleSave,
        createBlueprint,
        createBlueprintWithContent,
        deleteBlueprint,
        createPullRequest,
        runEvaluation,
        runHistory,
        forkName,
        setRunStatus,
        setRunId,
        closeProposal,
        isSyncingWithGitHub,
        duplicateBlueprint,
        forkCreationRequired,
        setForkCreationRequired,
        promoteBlueprint,
        deletingFilePath,
        fetchFiles,
    } = useWorkspace(
        user?.isLoggedIn ?? false, 
        user?.username ?? null,
        isAuthLoading
    );

    const { setIsOpen, setSteps } = useTour();
    const setupInitiatedRef = useRef(false);

    const [isProposalWizardOpen, setIsProposalWizardOpen] = useState(false);
    const [isRunsSidebarOpen, setIsRunsSidebarOpen] = useState(false);
    const [isRunModalOpen, setIsRunModalOpen] = useState(false);
    const [isRunConfigModalOpen, setIsRunConfigModalOpen] = useState(false);
    const [isAnonymousRunModalOpen, setIsAnonymousRunModalOpen] = useState(false);
    const [isAutoCreateModalOpen, setIsAutoCreateModalOpen] = useState(false);
    const [isModalSubmitting, setIsModalSubmitting] = useState(false);
    const [inputModalConfig, setInputModalConfig] = useState<{
        title: string;
        description: string;
        inputLabel: string;
        initialValue: string;
        submitButtonText: string;
        onSubmit: (value: string) => void;
    } | null>(null);
    const [activeEditor, setActiveEditor] = useState<'form' | 'yaml'>('form');
    const [hasShownFormWarning, setHasShownFormWarning] = useState(false);
    const [parsedBlueprint, setParsedBlueprint] = useImmer<ComparisonConfig | null>(null);
    const [yamlError, setYamlError] = useState<string | null>(null);
    const [isLoggingInWithGitHub, setIsLoggingInWithGitHub] = useState(false);
    const { toast } = useToast();

    const isLocal = activeBlueprint?.isLocal ?? true;
    const isLoggedIn = user?.isLoggedIn ?? false;

    useEffect(() => {
        const newSteps = getTourSteps(isLoggedIn, activeBlueprint);
        if (setSteps) {
            setSteps(newSteps);
        }
    }, [isLoggedIn, activeBlueprint, setSteps]);

    useEffect(() => {
        const hasSeenTour = localStorage.getItem('hasSeenSandboxTour');
        if (!hasSeenTour && !isAuthLoading && status !== 'idle' && status !== 'setting_up') {
            const timer = setTimeout(() => {
                setIsOpen(true);
                localStorage.setItem('hasSeenSandboxTour', 'true');
            }, 1000); // Small delay to allow UI to settle
            return () => clearTimeout(timer);
        }
    }, [isAuthLoading, status, setIsOpen]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
          if (isDirty) {
            event.preventDefault();
            event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
          }
        };
    
        window.addEventListener('beforeunload', handleBeforeUnload);
    
        return () => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
        };
      }, [isDirty]);

    useEffect(() => {
        const handleWorkspaceSetup = async () => {
            if (setupInitiatedRef.current) {
                console.log('[SandboxClientPage] setupWorkspace already initiated, skipping');
                return; // Prevent multiple calls
            }
            console.log('[SandboxClientPage] Initiating workspace setup');
            setupInitiatedRef.current = true;
            
            const result = await setupWorkspace();
            console.log('[SandboxClientPage] setupWorkspace result:', result);
            if (result?.authFailure) {
                // Backend says user is not authenticated, but frontend thinks they are
                // Sync the auth state by clearing it
                clearAuth();
            }
        };

        console.log(`[SandboxClientPage useEffect] isLoggedIn: ${user?.isLoggedIn}, setupInitiated: ${setupInitiatedRef.current}`);
        if (user?.isLoggedIn && !setupInitiatedRef.current) {
            handleWorkspaceSetup();
        }
    }, [user?.isLoggedIn, clearAuth]);

    // Reset setup flag when user logs out
    useEffect(() => {
        if (!user?.isLoggedIn) {
            setupInitiatedRef.current = false;
        }
    }, [user?.isLoggedIn]);

    useEffect(() => {
        if (editorContent) {
            try {
                const parsed = parseAndNormalizeBlueprint(editorContent, 'yaml');
                setParsedBlueprint(parsed);
                setYamlError(null);
            } catch (error: any) {
                setYamlError(error.message);
                setParsedBlueprint(null);
            }
        } else {
            setYamlError(null);
            setParsedBlueprint(null);
        }
    }, [editorContent, setParsedBlueprint]);

    useEffect(() => {
        const inProgressStatuses = ['pending', 'generating_responses', 'evaluating', 'saving'];
        if (runId && inProgressStatuses.includes(runStatus.status)) {
            setIsRunModalOpen(true);
        }
    }, [runId, runStatus.status]);

    useEffect(() => {
        if (runStatus.status === 'complete' || runStatus.status === 'error') {
            setIsRunConfigModalOpen(false);
        }
    }, [runStatus.status]);

    const handleProposeSubmit = async (data: { title: string; body: string }) => {
        return await createPullRequest(data);
    };
    
    const handleAutoGenerated = async (yamlContent: string) => {
        try {
            // Try to parse for title extraction, but don't fail if it's invalid
            let title: string | undefined;
            try {
                const blueprint = yaml.load(yamlContent) as { title?: string };
                title = blueprint?.title;
            } catch (yamlError) {
                console.warn("Auto-generated YAML is invalid, but will still be loaded into editor for manual fixing.");
                // Don't extract title from invalid YAML, use default
            }

            if (!title) {
                console.warn("Auto-generated blueprint is missing a title or YAML is invalid. Using a default name.");
            }
            
            const baseFilename = normalizeFilename(title || 'auto-generated-blueprint').replace(/\.yml$/, '');
            let finalFilename = `${baseFilename}.yml`;
            let counter = 1;

            // Ensure unique filename by checking against existing file names
            while (files.some(f => f.name === finalFilename)) {
                finalFilename = `${baseFilename}-${counter}.yml`;
                counter++;
            }

            if (createBlueprintWithContent) {
                await createBlueprintWithContent(finalFilename, yamlContent);
                toast({
                    title: 'Blueprint Created!',
                    description: `Successfully created and saved as ${finalFilename}.`,
                });
            }
        } catch (error: any) {
            console.error("Failed to handle auto-generated blueprint:", error);
            toast({
                variant: 'destructive',
                title: 'Error Processing Blueprint',
                description: 'Could not save the auto-generated blueprint.',
            });
        }
    };

    const handleFormUpdate = useCallback((newConfig: ComparisonConfig) => {
        setParsedBlueprint(newConfig);
        try {
            const finalYaml = generateMinimalBlueprintYaml(newConfig);
            setEditorContent(finalYaml);
        } catch (error) {
            console.error("Failed to generate YAML from updated config", error);
            toast({ variant: 'destructive', title: 'YAML Generation Error', description: 'Could not serialize form content to YAML.' });
        }
    }, [toast, setParsedBlueprint, setEditorContent]);

    const handleYamlUpdate = (newContent: string) => {
        setEditorContent(newContent);
    };

    const handlePromotion = async () => {
        if (!editorContent || !activeBlueprint) return;

        const title = parsedBlueprint?.title || 'new-blueprint';
        const originalLocalBlueprint = activeBlueprint;

        setInputModalConfig({
            title: "Save to GitHub",
            description: "Enter a filename for your new blueprint. It will be saved to your forked repository in the 'blueprints/users/your-username/' directory.",
            inputLabel: "Filename (.yml)",
            initialValue: normalizeFilename(title),
            submitButtonText: "Save to GitHub",
            onSubmit: async (filename) => {
                if (!filename) return;
                setIsModalSubmitting(true);
                
                const finalFilename = filename.endsWith('.yml') ? filename : `${filename}.yml`;

                const newFile = await promoteBlueprint(finalFilename, editorContent);
                
                if (newFile) {
                    // Force load the new file, which will bypass the 'isDirty' check
                    // and correctly set the new active blueprint, clearing the dirty state.
                    await loadFile(newFile, { force: true });
                    // Now that the state is clean, we can safely delete the old local blueprint.
                    await deleteBlueprint(originalLocalBlueprint, { silent: true });
                }
                
                setInputModalConfig(null);
                setIsModalSubmitting(false);
            }
        });
    };

    const handleCreateNew = () => {
        setInputModalConfig({
            title: "Create New Blueprint",
            description: "Enter a filename for your new blueprint.",
            inputLabel: "Filename",
            initialValue: "my-new-blueprint.yml",
            submitButtonText: "Create",
            onSubmit: async (filename) => {
                setIsModalSubmitting(true);

                if (!filename.trim()) {
                    toast({
                        variant: "destructive",
                        title: "Invalid Filename",
                        description: "Filename cannot be empty.",
                    });
                    setIsModalSubmitting(false);
                    return;
                }

                const finalFilename = filename.trim().endsWith('.yml') ? filename.trim() : `${filename.trim()}.yml`;

                if (files.some(f => f.name === finalFilename)) {
                    toast({
                        variant: "destructive",
                        title: "File already exists",
                        description: `A blueprint with the name '${finalFilename}' already exists. Please choose another name.`,
                    });
                    setIsModalSubmitting(false);
                    return; // Keep the modal open
                }

                if (createBlueprintWithContent) {
                    await createBlueprintWithContent(finalFilename, DEFAULT_BLUEPRINT_CONTENT);
                }
                setInputModalConfig(null);
                setIsModalSubmitting(false);
            }
        });
    };

    const handleLogin = () => { 
        setIsLoggingInWithGitHub(true);
        // Give immediate visual feedback before redirect
        setTimeout(() => {
            window.location.href = '/api/github/auth/request';
        }, 100);
    };
    
    const isLoading = status === 'setting_up' || isFetchingFileContent;
    const isSaving = status === 'saving';
    const isRunning = ['pending', 'generating_responses', 'evaluating', 'saving'].includes(runStatus.status);
    const isCreating = status === 'saving'; // Re-use saving state for creation
    const isDeleting = status === 'deleting';
    const isCreatingPr = status === 'creating_pr';
    const isClosingPr = status === 'closing_pr';
    const hasOpenPr = activeBlueprint?.prStatus?.state === 'open';
    const isEditable = !isLoading && !isSaving && !!activeBlueprint && !hasOpenPr;

    const handleActivateFormEditor = () => {
        if (hasOpenPr) return;
        if (!hasShownFormWarning) {
            toast({
                title: "Heads Up: Formatting",
                description: "Editing via the form may reformat the YAML source. Your comments and custom formatting will be preserved if you edit the YAML directly.",
                duration: 8000,
            });
            setHasShownFormWarning(true);
        }
        setActiveEditor('form');
    };

    const handleLogout = () => {
        clearAuth();
        toast({
            title: "Logged Out",
            description: "You have been successfully logged out.",
        });
    };

    const handleRunRequest = () => {
        if (user?.isLoggedIn) {
            setIsRunConfigModalOpen(true);
        } else {
            setIsAnonymousRunModalOpen(true);
        }
    };

    const handleRunConfirm = (selectedModels: string[]) => {
        runEvaluation(selectedModels);
    };

    const handleAnonymousRunConfirm = () => {
        runEvaluation();
        setIsAnonymousRunModalOpen(false);
    };

    const renderHeader = () => {
        const isSaveDisabled = isSaving || isLoading || !activeBlueprint || !isDirty;
        const showPromoteButton = isLocal && isLoggedIn;

        return (
            <header className="flex-shrink-0 border-b h-14 flex items-center justify-between px-4">
                <div className="flex items-center gap-2 font-mono text-m font-bold text-muted-foreground truncate pr-4">
                    <span className="truncate">
                        {activeBlueprint ? `${activeBlueprint.name}${isDirty ? '*' : ''}` : 'No file selected'}
                    </span>
                    {!isLocal && activeBlueprint && forkName && (
                        <a
                            href={`https://github.com/${forkName}/blob/main/${activeBlueprint.path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="View on GitHub"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <Button 
                        onClick={handleSave} 
                        disabled={isSaveDisabled}
                        size="sm"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Save Changes
                    </Button>

                    {showPromoteButton && (
                         <Button 
                            onClick={handlePromotion} 
                            disabled={isSaving || isLoading || !activeBlueprint}
                            size="sm"
                            variant="outline"
                        >
                            <Github className="w-4 h-4 mr-2" />
                            Save to GitHub...
                        </Button>
                    )}

                    <Button 
                        onClick={handleRunRequest} 
                        disabled={isRunning || !activeBlueprint || isLoading || isDirty} 
                        size="sm"
                        className="bg-exciting text-exciting-foreground border-exciting hover:bg-exciting/90 hover:text-exciting-foreground"
                        data-tour="run-evaluation-button"
                    >
                         {isRunning ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
                        ) : (
                            <><FlaskConical className="w-4 h-4 mr-2" />Run Evaluation</>
                        )}
                    </Button>
                    
                    {
                        (
                            (!isLocal && !activeBlueprint?.prStatus) ||
                            (isLocal && activeBlueprint?.prStatus)
                        ) && (
                            <Separator orientation="vertical" className="h-6" />
                        )
                    }

                    {!isLocal && !activeBlueprint?.prStatus && (
                        <Button onClick={() => setIsProposalWizardOpen(true)} disabled={isCreatingPr || !activeBlueprint || isLoading || isDirty} size="sm" variant="outline" data-tour="proposal-button">
                            <GitPullRequest className="w-4 h-4 mr-2" />
                            {isCreatingPr ? 'Proposing...' : 'Propose'}
                        </Button>
                    )}
                    
                    {activeBlueprint?.prStatus && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" disabled={isClosingPr || isLoading}>
                                    {isClosingPr 
                                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Closing...</>
                                        : <><GitPullRequest className="w-4 h-4 mr-2" /> PR #{activeBlueprint.prStatus.number}: {activeBlueprint.prStatus.state}</>
                                    }
                                    <MoreVertical className="w-4 h-4 ml-2" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                    <a href={activeBlueprint.prStatus.url} target="_blank" rel="noopener noreferrer">
                                        View on GitHub
                                    </a>
                                </DropdownMenuItem>
                                {activeBlueprint.prStatus.state === 'open' && (
                                    <>
                                        <DropdownMenuItem 
                                            onClick={() => activeBlueprint && duplicateBlueprint(activeBlueprint)}
                                        >
                                            Duplicate and Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem 
                                            onClick={() => activeBlueprint.prStatus && closeProposal(activeBlueprint.prStatus.number)} 
                                            disabled={isClosingPr}
                                        >
                                            Close Proposal
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    <Separator orientation="vertical" className="h-6" />

                    <Button onClick={() => setIsRunsSidebarOpen(true)} size="icon" variant="ghost" className="relative" disabled={isLoading} data-tour="runs-history-button">
                        <History className="w-5 h-5" />
                        {isRunning && (
                             <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-sky-500 ring-2 ring-background" />
                        )}
                    </Button>
                    <TourButton />
                </div>
            </header>
        );
    };

    const renderMainContent = () => (
        <div className="flex h-screen bg-background">
             <div className="flex-shrink-0 border-r bg-muted w-72 flex flex-col" data-tour="file-navigator">
                <FileNavigator
                    files={files}
                    activeFilePath={activeBlueprint?.path || null}
                    onSelectFile={loadFile}
                    onDeleteFile={deleteBlueprint}
                    onCreateNew={handleCreateNew}
                    onAutoCreate={() => setIsAutoCreateModalOpen(true)}
                    isLoading={status === 'setting_up' || isFetchingFiles}
                    isSyncingWithGitHub={isSyncingWithGitHub}
                    isCreating={isCreating}
                    isDeleting={!!deletingFilePath || status === 'deleting'}
                    deletingFilePath={deletingFilePath}
                    user={user}
                    forkName={forkName}
                    onLogin={handleLogin}
                    isLoggingInWithGitHub={isLoggingInWithGitHub}
                    onLogout={handleLogout}
                    onRefresh={() => fetchFiles(true)}
                />
            </div>
            <main className="flex-1 flex flex-col overflow-hidden">
                {renderHeader()}
                {hasOpenPr && (
                    <div className="flex-shrink-0 border-b bg-primary/10 p-3 text-sm">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <GitPullRequest className="h-5 w-5 text-primary flex-shrink-0" />
                                <div>
                                    <h3 className="font-semibold">This blueprint is under review.</h3>
                                    <p className="text-muted-foreground">Editing is locked while a pull request is open.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                                {activeBlueprint?.prStatus?.url && (
                                    <Button variant="outline" size="sm" asChild>
                                        <a href={activeBlueprint.prStatus.url} target="_blank" rel="noopener noreferrer">
                                            View PR
                                        </a>
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => activeBlueprint && duplicateBlueprint(activeBlueprint)}
                                >
                                    Duplicate and Edit
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
                <div className="flex-grow flex flex-row gap-px bg-border relative min-h-0" data-tour="editor-panels">
                    {isFetchingFileContent && (
                        <div className="absolute inset-0 bg-background flex flex-col items-center justify-center z-10">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    )}
                    <div
                        className={`flex-1 relative overflow-y-auto transition-all duration-200 ease-in-out ${activeEditor === 'form' ? 'border-t-2 border-primary' : 'border-t-2 border-transparent'}`}
                        onClick={handleActivateFormEditor}
                        data-tour="form-panel"
                    >
                        <FormPanel
                            parsedBlueprint={parsedBlueprint}
                            onUpdate={handleFormUpdate}
                            isLoading={isLoading}
                            isSaving={isSaving}
                            isEditable={isEditable && activeEditor === 'form'}
                        />
                    </div>
                    <div
                        className={`flex-1 relative overflow-y-auto transition-all duration-200 ease-in-out ${activeEditor === 'yaml' ? 'border-t-2 border-primary' : 'border-t-2 border-transparent'}`}
                        onClick={() => setActiveEditor('yaml')}
                        data-tour="yaml-panel"
                    >
                       <EditorPanel
                            rawContent={editorContent}
                            onChange={handleYamlUpdate}
                            isLoading={isLoading}
                            isSaving={isSaving}
                            readOnly={!isEditable || activeEditor !== 'yaml'}
                            yamlError={yamlError}
                        />
                    </div>
                </div>
            </main>
        </div>
    );

    if (isAuthLoading || (user?.isLoggedIn && (status === 'idle' || status === 'setting_up' || status === 'loading'))) {
        let loadingMessage = 'Authenticating...';
        if (!isAuthLoading) {
            switch (status) {
                case 'setting_up':
                    loadingMessage = setupMessage || 'Setting up your workspace...';
                    break;
                case 'loading':
                    loadingMessage = 'Loading your blueprints...';
                    break;
                case 'idle':
                    loadingMessage = 'Initializing...';
                    break;
                default:
                    loadingMessage = 'Please wait...';
                    break;
            }
        }
         return (
            <div className="h-screen w-full flex flex-col items-center justify-center gap-4">
                <h1 className="text-2xl font-bold">Initializing Sandbox Studio</h1>
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">{loadingMessage}</p>
            </div>
        );
    }

    const normalizeFilename = (title: string): string => {
        const sanitized = title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '') // remove non-alphanumeric chars except spaces and hyphens
          .trim()
          .replace(/\s+/g, '-'); // replace spaces with hyphens
        return `${sanitized || 'new-blueprint'}.yml`;
    };

    return (
        <>
            {renderMainContent()}
            <Toaster />
            {isLoggingInWithGitHub && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-exciting text-exciting-foreground px-8 py-6 rounded-lg shadow-2xl flex items-center gap-4 max-w-md mx-4">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <div>
                            <h3 className="font-bold text-lg">Connecting to GitHub</h3>
                            <p className="text-sm opacity-90">Redirecting to GitHub authentication...</p>
                        </div>
                    </div>
                </div>
            )}
            <RunsSidebar
                isOpen={isRunsSidebarOpen}
                onClose={() => setIsRunsSidebarOpen(false)}
                runStatus={runStatus}
                runHistory={runHistory}
                activeBlueprintName={activeBlueprint?.name ?? null}
            />
            {activeBlueprint && (
                <ProposalWizard
                    isOpen={isProposalWizardOpen}
                    onClose={() => setIsProposalWizardOpen(false)}
                    onSubmit={handleProposeSubmit}
                    blueprintName={activeBlueprint.name}
                    isSubmitting={isCreatingPr}
                />
            )}
            <AutoCreateModal 
                onGenerated={handleAutoGenerated}
                isOpen={isAutoCreateModalOpen}
                onOpenChange={setIsAutoCreateModalOpen}
            />
            {inputModalConfig && (
                <InputModal
                    isOpen={!!inputModalConfig}
                    onClose={() => setInputModalConfig(null)}
                    isSubmitting={isModalSubmitting}
                    {...inputModalConfig}
                />
            )}
            <RunEvaluationModal
                isOpen={isRunConfigModalOpen}
                onClose={() => setIsRunConfigModalOpen(false)}
                onRun={handleRunConfirm}
                isSubmitting={isRunning}
            />
            <AnonymousRunModal
                isOpen={isAnonymousRunModalOpen}
                onClose={() => setIsAnonymousRunModalOpen(false)}
                onRun={handleAnonymousRunConfirm}
                onLogin={handleLogin}
                isSubmitting={isRunning}
                isLoggingInWithGitHub={isLoggingInWithGitHub}
            />
            <RunStatusModal 
                isOpen={isRunModalOpen} 
                onClose={() => {
                    setIsRunModalOpen(false);
                    if (runStatus.status === 'complete' || runStatus.status === 'error') {
                        setRunStatus({ status: 'idle' });
                        if (setRunId) setRunId(null);
                    }
                }}
                status={runStatus}
            />
            <WorkspaceSetupModal
                isOpen={forkCreationRequired}
                onClose={() => setForkCreationRequired(false)}
                onConfirm={async () => {
                    const result = await setupWorkspace(true);
                    if (result?.authFailure) {
                        clearAuth();
                    }
                }}
                isConfirming={status === 'setting_up'}
            />
        </>
    );
}

export default function SandboxClientPage() {
    return (
        <TourProvider steps={[]}>
            <SandboxClientPageInternal />
        </TourProvider>
    );
}