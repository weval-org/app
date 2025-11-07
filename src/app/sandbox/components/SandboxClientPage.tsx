'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import * as yaml from 'js-yaml';
import { useAuth } from '../hooks/useAuth';
import { useWorkspace, ActiveBlueprint, BlueprintFile } from '../hooks/useWorkspace';
import { useToast } from '@/components/ui/use-toast';
import { Toaster } from "@/components/ui/toaster";
import { ToastAction } from '@/components/ui/toast';
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
import { WorkspaceManagementModal } from './WorkspaceManagementModal';
import { RunsSidebar } from './RunsSidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TourModal } from './TourModal';
import { MobileFileNavigator } from './MobileFileNavigator';
import { useMobile } from '../hooks/useMobile';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmRunModal } from './ConfirmRunModal';
import Icon from '@/components/ui/icon';
import { useDebouncedCallback } from 'use-debounce';

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
        renameBlueprint,
        workspaceState,
        resetWorkspace,
    } = useWorkspace(
        user?.isLoggedIn ?? false,
        user?.username ?? null,
        isAuthLoading
    );

    const setupInitiatedRef = useRef(false);
    const searchParams = useSearchParams();

    const [isProposalWizardOpen, setIsProposalWizardOpen] = useState(false);
    const [isTourModalOpen, setIsTourModalOpen] = useState(false);
    const [showTourBlurb, setShowTourBlurb] = useState(false);
    const [isRunsSidebarOpen, setIsRunsSidebarOpen] = useState(false);
    const [isRunModalOpen, setIsRunModalOpen] = useState(false);
    const [isRunConfigModalOpen, setIsRunConfigModalOpen] = useState(false);
    const [isConfirmRunModalOpen, setIsConfirmRunModalOpen] = useState(false);
    const [modelsToConfirm, setModelsToConfirm] = useState<string[]>([]);
    const [isAnonymousRunModalOpen, setIsAnonymousRunModalOpen] = useState(false);
    const [isAutoCreateModalOpen, setIsAutoCreateModalOpen] = useState(false);
    const [isManageWorkspaceOpen, setIsManageWorkspaceOpen] = useState(false);
    const [isModalSubmitting, setIsModalSubmitting] = useState(false);
    // Import overlay state for ?config=...
    const [isImportingFromConfig, setIsImportingFromConfig] = useState(false);
    const [importMessage, setImportMessage] = useState<string>('Preparing import...');
    const [fileToDelete, setFileToDelete] = useState<BlueprintFile | null>(null);
    const [inputModalConfig, setInputModalConfig] = useState<{
        title: string;
        description: string;
        inputLabel: string;
        initialValue: string;
        submitButtonText: string;
        onSubmit: (value: string) => Promise<void>;
    } | null>(null);
    const [activeEditor, setActiveEditor] = useState<'form' | 'yaml'>('form');
    const [showYamlEditor, setShowYamlEditor] = useState(false);
    const [parsedBlueprint, setParsedBlueprint] = useImmer<ComparisonConfig | null>(null);
    const [yamlError, setYamlError] = useState<string | null>(null);
    const [isLoggingInWithGitHub, setIsLoggingInWithGitHub] = useState(false);
    const { toast } = useToast();
    const { isMobile, isLoaded } = useMobile();
    const isDev = process.env.NODE_ENV === 'development';

    // Mobile navigation state
    const [mobileActiveTab, setMobileActiveTab] = useState<'files' | 'edit' | 'run'>('edit');

    const isLocal = activeBlueprint?.isLocal ?? true;
    const isLoggedIn = user?.isLoggedIn ?? false;

    useEffect(() => {
        const hasSeen = localStorage.getItem('hasSeenTourBlurb');
        if (!hasSeen) {
            setShowTourBlurb(true);
        }
    }, []);

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
    }, [user?.isLoggedIn, clearAuth, setupWorkspace]);

    // Auto-open workspace management modal if workspace needs attention after login
    useEffect(() => {
        // Only auto-open if user just logged in and workspace needs setup/attention
        if (user?.isLoggedIn && setupInitiatedRef.current) {
            const needsAttention =
                workspaceState.type === 'setup_not_started' ||
                workspaceState.type === 'stale_fork';

            if (needsAttention && !isManageWorkspaceOpen && !forkCreationRequired) {
                console.log('[SandboxClientPage] Workspace needs attention, opening management modal');
                setIsManageWorkspaceOpen(true);
            }
        }
    }, [user?.isLoggedIn, workspaceState.type, isManageWorkspaceOpen, forkCreationRequired]);

    // Reset setup flag when user logs out
    useEffect(() => {
        if (!user?.isLoggedIn) {
            setupInitiatedRef.current = false;
        }
    }, [user?.isLoggedIn]);

    // Import via config query param (?config=configId/runLabel/timestamp)
    useEffect(() => {
        const configParam = searchParams?.get('config');
        if (!configParam || !createBlueprintWithContent) return;

        const importFromAnalysis = async () => {
            try {
                setIsImportingFromConfig(true);
                setImportMessage('Downloading run data...');
                const [cfg, rl, ts] = decodeURIComponent(configParam).split('/');
                if (!cfg || !rl || !ts) throw new Error('Invalid config parameter');

                // Fetch full raw data
                const resp = await fetch(`/api/comparison/${encodeURIComponent(cfg)}/${encodeURIComponent(rl)}/${encodeURIComponent(ts)}/raw`);
                if (!resp.ok) throw new Error('Failed to fetch raw comparison data');
                const fullData = await resp.json();

                // Reconstruct prompts with promptContexts and ideal
                setImportMessage('Reconstructing blueprint...');
                const reconstructed = {
                    ...fullData.config,
                    prompts: (fullData.config?.prompts || []).map((p: any) => {
                        const promptId = p.id;
                        const out = { ...p };
                        if (!out.messages && !out.promptText) {
                            const ctx = fullData.promptContexts?.[promptId];
                            if (typeof ctx === 'string') out.promptText = ctx; else if (Array.isArray(ctx)) out.messages = ctx;
                        }
                        if (!out.idealResponse) {
                            const ideal = fullData.allFinalAssistantResponses?.[promptId]?.ideal || fullData.allFinalAssistantResponses?.[promptId]?.ideal_model || fullData.allFinalAssistantResponses?.[promptId]?.ideal_response || fullData.allFinalAssistantResponses?.[promptId]?.idealModel || fullData.allFinalAssistantResponses?.[promptId]?.ideal_response_text || fullData.allFinalAssistantResponses?.[promptId]?.['ideal'];
                            const idealDirect = fullData.allFinalAssistantResponses?.[promptId]?.ideal || fullData.allFinalAssistantResponses?.[promptId]?.['ideal'];
                            out.idealResponse = idealDirect ?? out.idealResponse ?? null;
                            const idealById = fullData.allFinalAssistantResponses?.[promptId]?.ideal ?? fullData.allFinalAssistantResponses?.[promptId]?.['ideal'];
                            if (!out.idealResponse && fullData.allFinalAssistantResponses?.[promptId]) {
                                const idealModelKey = 'ideal';
                                const maybe = fullData.allFinalAssistantResponses[promptId][idealModelKey];
                                if (typeof maybe === 'string') out.idealResponse = maybe;
                            }
                        }
                        return out;
                    })
                } as any;

                const yamlText = generateMinimalBlueprintYaml(reconstructed);
                const filename = `Copy of ${fullData.configTitle || cfg}.yml`;
                setImportMessage('Creating local draft...');
                await createBlueprintWithContent(filename, yamlText, {
                    toastTitle: 'Blueprint Imported!',
                    toastDescription: `Loaded "${filename}" from ${cfg}.`,
                });

                // Clear the ?config param to prevent re-import on refresh
                try {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('config');
                    window.history.replaceState({}, document.title, url.toString());
                } catch {}
            } catch (err) {
                console.error('[Sandbox import via config] Failed:', err);
                toast({
                    variant: 'destructive',
                    title: 'Import Failed',
                    description: 'Could not import the blueprint from the analysis run.',
                    action: (
                        <ToastAction
                          altText="Retry import"
                          onClick={() => {
                            const again = async () => {
                              setIsImportingFromConfig(true);
                              setImportMessage('Retrying import...');
                              try { await importFromAnalysis(); } finally { setIsImportingFromConfig(false); }
                            };
                            again();
                          }}
                        >Retry</ToastAction>
                    ),
                });
            } finally {
                setIsImportingFromConfig(false);
                setImportMessage('');
            }
        };

        // Only run once on mount
        importFromAnalysis();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Import via story query param (?story=sessionId)
    useEffect(() => {
        const storyParam = searchParams?.get('story');
        if (!storyParam || !createBlueprintWithContent) return;

        const importFromStory = async () => {
            try {
                setIsImportingFromConfig(true);
                setImportMessage('Loading blueprint from Story...');

                const sessionId = decodeURIComponent(storyParam);

                // Fetch exported blueprint
                const resp = await fetch(`/api/story/export?id=${encodeURIComponent(sessionId)}`);
                if (!resp.ok) {
                    throw new Error(resp.status === 404 ? 'Story session not found' : 'Failed to load story blueprint');
                }

                const data = await resp.json();

                setImportMessage('Creating blueprint in Sandbox...');
                const filename = data.blueprint?.title
                    ? `${data.blueprint.title}.yml`
                    : `Story Blueprint ${new Date().toLocaleDateString()}.yml`;

                await createBlueprintWithContent(filename, data.yaml, {
                    toastTitle: 'Blueprint Imported from Story!',
                    toastDescription: `Loaded "${filename}". You can now refine and contribute it.`,
                });

                // Clear the ?story param to prevent re-import on refresh
                try {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('story');
                    window.history.replaceState({}, document.title, url.toString());
                } catch {}
            } catch (err) {
                console.error('[Sandbox import via story] Failed:', err);
                toast({
                    variant: 'destructive',
                    title: 'Import Failed',
                    description: err instanceof Error ? err.message : 'Could not import the blueprint from Story.',
                    action: (
                        <ToastAction
                          altText="Retry import"
                          onClick={() => {
                            const again = async () => {
                              setIsImportingFromConfig(true);
                              setImportMessage('Retrying import...');
                              try { await importFromStory(); } finally { setIsImportingFromConfig(false); }
                            };
                            again();
                          }}
                        >Retry</ToastAction>
                    ),
                });
            } finally {
                setIsImportingFromConfig(false);
                setImportMessage('');
            }
        };

        // Only run once on mount
        importFromStory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced YAML parsing - prevents lag during YAML typing
    const debouncedParseYaml = useDebouncedCallback((content: string | null) => {
        if (content) {
            try {
                const parsed = parseAndNormalizeBlueprint(content, 'yaml');
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
    }, 500); // Wait 500ms after user stops typing

    useEffect(() => {
        debouncedParseYaml(editorContent);
    }, [editorContent, debouncedParseYaml]);

    useEffect(() => {
        const inProgressStatuses = ['pending', 'generating_responses', 'evaluating', 'saving'];
        if (runId && inProgressStatuses.includes(runStatus.status)) {
            setIsRunModalOpen(true);
            // On mobile, switch to run tab when evaluation starts
            if (isMobile) {
                setMobileActiveTab('run');
            }
        }
    }, [runId, runStatus.status, isMobile]);



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

    // Debounced YAML generation - prevents lag during form typing
    const debouncedGenerateYaml = useDebouncedCallback((config: ComparisonConfig) => {
        try {
            const finalYaml = generateMinimalBlueprintYaml(config);
            setEditorContent(finalYaml);
        } catch (error) {
            console.error("Failed to generate YAML from updated config", error);
            toast({ variant: 'destructive', title: 'YAML Generation Error', description: 'Could not serialize form content to YAML.' });
        }
    }, 500); // Wait 500ms after user stops typing

    const handleFormUpdate = useCallback((newConfig: ComparisonConfig) => {
        // Update parsed blueprint immediately for responsive UI
        setParsedBlueprint(newConfig);
        // Debounce the expensive YAML generation
        debouncedGenerateYaml(newConfig);
    }, [setParsedBlueprint, debouncedGenerateYaml, toast]);

    const handleYamlUpdate = (newContent: string) => {
        setEditorContent(newContent);
    };

    const handleModalClose = useCallback(() => {
        setInputModalConfig(null);
    }, []);

    const handlePromotion = useCallback(async () => {
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
                if (!filename) {
                    handleModalClose();
                    return;
                }
                setIsModalSubmitting(true);

                const finalFilename = filename.endsWith('.yml') ? filename : `${filename}.yml`;

                console.log('[PROMOTE] Starting promotion for:', finalFilename);
                const newFile = await promoteBlueprint(finalFilename, editorContent);
                console.log('[PROMOTE] Promotion result:', newFile ? 'success' : 'failed');

                if (newFile) {
                    // Try to load the new file from GitHub
                    console.log('[PROMOTE] Attempting to load new file:', newFile.path);
                    const loadSuccess = await loadFile(newFile, { force: true });
                    console.log('[PROMOTE] Load result:', loadSuccess ? 'success' : 'failed');

                    if (loadSuccess) {
                        // Only delete local file if new file loaded successfully
                        console.log('[PROMOTE] Deleting original local file:', originalLocalBlueprint.path);
                        await deleteBlueprint(originalLocalBlueprint, { silent: true });
                        console.log('[PROMOTE] Promotion complete - local file deleted');

                        toast({
                            title: "Promoted to GitHub",
                            description: `Successfully saved ${finalFilename} and removed local draft.`,
                        });
                    } else {
                        // Keep local file since new file failed to load
                        console.warn('[PROMOTE] New file failed to load - keeping local draft');
                        toast({
                            variant: 'default',
                            title: "Partial Success",
                            description: `File saved to GitHub but failed to load. Your local draft is preserved.`,
                        });
                    }
                } else {
                    console.error('[PROMOTE] Promotion failed - local draft preserved');
                    toast({
                        variant: 'destructive',
                        title: 'Save Failed',
                        description: 'Could not save to GitHub. Your local draft is preserved.',
                    });
                }

                handleModalClose();
                setIsModalSubmitting(false);
            }
        });
    }, [editorContent, activeBlueprint, parsedBlueprint, promoteBlueprint, loadFile, deleteBlueprint, handleModalClose]);

    const handleCreateNew = useCallback(() => {
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
                handleModalClose();
                setIsModalSubmitting(false);
            }
        });
    }, [createBlueprintWithContent, files, toast, handleModalClose]);

    const handleRename = useCallback((file: BlueprintFile) => {
        if (!file) return;

        setInputModalConfig({
            title: "Rename Blueprint",
            description: "Enter a new filename for your blueprint.",
            inputLabel: "Filename",
            initialValue: file.name,
            submitButtonText: "Rename",
            onSubmit: async (newName) => {
                if (!newName || newName === file.name) {
                    handleModalClose();
                    return;
                }
                setIsModalSubmitting(true);
                
                const finalNewName = newName.trim().endsWith('.yml') ? newName.trim() : `${newName.trim()}.yml`;

                if (files.some(f => f.name === finalNewName && f.path !== file.path)) {
                    toast({
                        variant: "destructive",
                        title: "File already exists",
                        description: `A blueprint with the name '${finalNewName}' already exists. Please choose another name.`,
                    });
                    setIsModalSubmitting(false);
                    return;
                }

                await renameBlueprint(file, finalNewName);
                
                handleModalClose();
                setIsModalSubmitting(false);
            }
        });
    }, [files, renameBlueprint, toast, handleModalClose]);

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
        setActiveEditor('form');
    };

    const handleLogout = async () => {
        try {
            // Call the logout endpoint to clear the session cookie
            const response = await fetch('/api/github/auth/logout', { method: 'POST' });
            if (!response.ok) {
                throw new Error('Failed to logout');
            }

            // Clear local auth state
            clearAuth();

            toast({
                title: "Logged Out",
                description: "You have been successfully logged out.",
            });
        } catch (error) {
            console.error('[Logout] Failed to logout:', error);
            // Still clear local state even if the API call fails
            clearAuth();
            toast({
                variant: 'destructive',
                title: "Logout Error",
                description: "There was an issue logging out, but your local session has been cleared.",
            });
        }
    };

    const handleRunRequest = () => {
        if (isDev && parsedBlueprint?.models && parsedBlueprint.models.length > 0) {
            const modelIds = parsedBlueprint.models.map(m => (typeof m === 'string' ? m : m.id));
            if (modelIds.length > 0) {
                setModelsToConfirm(modelIds);
                setIsConfirmRunModalOpen(true);
                return;
            }
        }

        if (user?.isLoggedIn) {
            setIsRunConfigModalOpen(true);
        } else {
            setIsAnonymousRunModalOpen(true);
        }
    };

    const handleRunConfirm = (selectedModels: string[]) => {
        runEvaluation(selectedModels);
    };

    const handleDevRunConfirm = () => {
        runEvaluation(modelsToConfirm);
        setIsConfirmRunModalOpen(false);
    }

    const handleAnonymousRunConfirm = () => {
        runEvaluation();
        setIsAnonymousRunModalOpen(false);
    };

    const confirmDeletion = () => {
        if (fileToDelete) {
            deleteBlueprint(fileToDelete);
            setFileToDelete(null);
        }
    };

    const handleHeaderAction = (action: (file: BlueprintFile) => void) => {
        if (!activeBlueprint) return;
        action(activeBlueprint);
    };

    const renderMobileTabBar = () => (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border md:hidden z-10">
            <div className="flex">
                <button
                    className={`flex-1 flex flex-col items-center py-2 px-1 ${
                        mobileActiveTab === 'files' 
                            ? 'text-primary bg-primary/10' 
                            : 'text-muted-foreground'
                    }`}
                    onClick={() => setMobileActiveTab('files')}
                >
                    <Icon name="folder-open" className="w-5 h-5 mb-1" />
                    <span className="text-xs">Files</span>
                </button>
                <button
                    className={`flex-1 flex flex-col items-center py-2 px-1 ${
                        mobileActiveTab === 'edit' 
                            ? 'text-primary bg-primary/10' 
                            : 'text-muted-foreground'
                    }`}
                    onClick={() => setMobileActiveTab('edit')}
                >
                    <Icon name="edit-3" className="w-5 h-5 mb-1" />
                    <span className="text-xs">Edit</span>
                </button>
                <button
                    className={`flex-1 flex flex-col items-center py-2 px-1 ${
                        mobileActiveTab === 'run' 
                            ? 'text-primary bg-primary/10' 
                            : 'text-muted-foreground'
                    }`}
                    onClick={() => setMobileActiveTab('run')}
                >
                    <Icon name="bar-chart-3" className="w-5 h-5 mb-1" />
                    <span className="text-xs">Run</span>
                </button>
            </div>
        </div>
    );

    const renderHeader = () => {
        const isSaveDisabled = isSaving || isLoading || !activeBlueprint || !isDirty;
        const showPromoteButton = isLocal && isLoggedIn;
        const canTakeAction = activeBlueprint && !hasOpenPr;

        console.log({
            isLocal,
            isLoggedIn,
            hasOpenPr,
            activeBlueprint,
            forkName,
            canRename: canTakeAction,
        })

        return (
            <header className="flex-shrink-0 border-b h-14 flex items-center justify-between px-4">
                <div className="flex items-center gap-2 font-mono text-m font-bold text-muted-foreground truncate pr-4">
                    <span className="truncate">
                        {activeBlueprint ? `${activeBlueprint.name}${isDirty ? '*' : ''}` : 'No file selected'}
                    </span>
                    
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-foreground hover:bg-slate-200 data-[state=open]:bg-slate-200 dark:hover:bg-slate-700 dark:data-[state=open]:bg-slate-700"
                                disabled={!canTakeAction}
                            >
                                <Icon name="more-vertical" className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setTimeout(() => handleHeaderAction(handleRename), 0)}>
                                <Icon name="pencil" className="w-4 h-4 mr-2" />
                                Rename
                            </DropdownMenuItem>
                             <DropdownMenuItem onSelect={() => setTimeout(() => handleHeaderAction(duplicateBlueprint), 0)}>
                                <Icon name="copy" className="w-4 h-4 mr-2" />
                                Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                             <DropdownMenuItem onSelect={() => setTimeout(() => handleHeaderAction(setFileToDelete), 0)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                <Icon name="trash" className="w-4 h-4 mr-2" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {!isLocal && activeBlueprint && forkName && (
                        <a
                            href={`https://github.com/${forkName}/blob/${activeBlueprint.branchName || 'main'}/${activeBlueprint.path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="View on GitHub"
                        >
                            <Icon name="external-link" className="w-4 h-4" />
                        </a>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <Button 
                        onClick={handleSave} 
                        disabled={isSaveDisabled}
                        size="sm"
                    >
                        {isSaving ? <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" /> : <Icon name="save" className="w-4 h-4 mr-2" />}
                        Save Changes
                    </Button>

                    {showPromoteButton && (
                         <Button 
                            onClick={handlePromotion} 
                            disabled={isSaving || isLoading || !activeBlueprint}
                            size="sm"
                            variant="outline"
                        >
                            <Icon name="github" className="w-4 h-4 mr-2" />
                            Save to GitHub...
                        </Button>
                    )}

                    <Button 
                        onClick={handleRunRequest} 
                        disabled={isRunning || !activeBlueprint || isLoading || isDirty} 
                        size="sm"
                        className="bg-exciting text-exciting-foreground border-exciting hover:bg-exciting/90 hover:text-exciting-foreground"
                    >
                         {isRunning ? (
                            <><Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" /> Running...</>
                        ) : (
                            <><Icon name="flask-conical" className="w-4 h-4 mr-2" />Run Evaluation</>
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

                    {!isLocal && !activeBlueprint?.prStatus && activeBlueprint?.branchName?.startsWith('proposal/') && (
                        <Button onClick={() => setIsProposalWizardOpen(true)} disabled={isCreatingPr || !activeBlueprint || isLoading || isDirty} size="sm" variant="outline">
                            <Icon name="git-pull-request" className="w-4 h-4 mr-2" />
                            {isCreatingPr ? 'Proposing...' : 'Propose'}
                        </Button>
                    )}
                    
                    {activeBlueprint?.prStatus && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" disabled={isClosingPr || isLoading}>
                                    {isClosingPr 
                                        ? <><Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" /> Closing...</>
                                        : <><Icon name="git-pull-request" className="w-4 h-4 mr-2" /> PR #{activeBlueprint.prStatus.number}: {activeBlueprint.prStatus.state}</>
                                    }
                                    <Icon name="more-vertical" className="w-4 h-4 ml-2" />
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

                    <Button 
                        onClick={() => setShowYamlEditor(!showYamlEditor)} 
                        size="sm" 
                        variant={showYamlEditor ? "default" : "outline"}
                        disabled={isLoading}
                        title={showYamlEditor ? "Hide YAML Editor" : "Show YAML Editor"}
                    >
                        <Icon name="file-code-2" className="w-4 h-4 mr-2" />
                        {showYamlEditor ? 'Hide YAML' : 'Edit YAML'}
                    </Button>

                    <Separator orientation="vertical" className="h-6" />

                    <Button onClick={() => setIsRunsSidebarOpen(true)} size="icon" variant="ghost" className="relative" disabled={isLoading} data-tour="runs-history-button">
                        <Icon name="history" className="w-5 h-5" />
                        {isRunning && (
                             <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-sky-500 ring-2 ring-background" />
                        )}
                    </Button>
                    <Button onClick={() => setIsTourModalOpen(true)} size="icon" variant="ghost" className="relative" title="Show Tour">
                        <Icon name="help-circle" className="w-5 h-5" />
                    </Button>
                </div>
            </header>
        );
    };

    const renderMobileFilesTab = () => (
        <div className="h-full overflow-y-auto pb-16 bg-background">
            <div className="p-4">
                <MobileFileNavigator
                    files={files}
                    activeFilePath={activeBlueprint?.path || null}
                    onSelectFile={(file) => {
                        loadFile(file);
                        setMobileActiveTab('edit');
                    }}
                    onCreateNew={handleCreateNew}
                    onAutoCreate={() => setIsAutoCreateModalOpen(true)}
                    onRenameFile={handleRename}
                    onDuplicateFile={duplicateBlueprint}
                    onDeleteFile={setFileToDelete}
                    isLoading={status === 'setting_up' || isFetchingFiles}
                    isSyncingWithGitHub={isSyncingWithGitHub}
                    isCreating={isCreating}
                    user={user}
                    forkName={forkName}
                    onLogin={handleLogin}
                    isLoggingInWithGitHub={isLoggingInWithGitHub}
                    onLogout={handleLogout}
                    onRefresh={() => fetchFiles(true)}
                />
            </div>
        </div>
    );

    const renderMobileEditTab = () => (
        <div className="h-full overflow-y-auto pb-16 bg-background">
            {isFetchingFileContent && (
                <div className="absolute inset-0 bg-background flex flex-col items-center justify-center z-10">
                    <Icon name="loader-2" className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            )}
            
            {/* Mobile header with current file and actions */}
            <div className="sticky top-0 bg-background border-b border-border p-4 z-10">
                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-semibold truncate">
                            {activeBlueprint ? `${activeBlueprint.name}${isDirty ? '*' : ''}` : 'No file selected'}
                        </h2>
                        {!isLocal && activeBlueprint && (
                            <p className="text-sm text-muted-foreground truncate">GitHub • {forkName}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                        <Button 
                            onClick={handleSave} 
                            disabled={isSaving || isLoading || !activeBlueprint || !isDirty}
                            size="sm"
                        >
                            {isSaving ? <Icon name="loader-2" className="w-4 h-4 animate-spin" /> : <Icon name="save" className="w-4 h-4" />}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground"
                                    disabled={!activeBlueprint || hasOpenPr}
                                >
                                    <Icon name="more-vertical" className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setTimeout(() => handleHeaderAction(handleRename), 0)}>
                                    <Icon name="pencil" className="w-4 h-4 mr-2" />
                                    Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setTimeout(() => handleHeaderAction(duplicateBlueprint), 0)}>
                                    <Icon name="copy" className="w-4 h-4 mr-2" />
                                    Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => setTimeout(() => handleHeaderAction(setFileToDelete), 0)} className="text-destructive">
                                    <Icon name="trash" className="w-4 h-4 mr-2" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            {hasOpenPr && (
                <div className="bg-primary/10 p-4 border-b">
                    <div className="flex items-center gap-3">
                        <Icon name="git-pull-request" className="h-5 w-5 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm">Under Review</h3>
                            <p className="text-sm text-muted-foreground">Editing locked while PR is open</p>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => activeBlueprint && duplicateBlueprint(activeBlueprint)}
                        >
                            Duplicate
                        </Button>
                    </div>
                </div>
            )}

            <div className="p-4">
                <FormPanel
                    parsedBlueprint={parsedBlueprint}
                    onUpdate={handleFormUpdate}
                    isLoading={isLoading}
                    isSaving={isSaving}
                    isEditable={isEditable}
                    onShowTour={() => setIsTourModalOpen(true)}
                />
            </div>
        </div>
    );

    const renderMobileRunTab = () => (
        <div className="h-full overflow-y-auto pb-16 bg-background">
            <div className="p-4">
                <h2 className="text-lg font-semibold mb-4">Run Evaluation</h2>
                
                {/* Run button */}
                <div className="mb-6">
                    <Button 
                        onClick={handleRunRequest} 
                        disabled={isRunning || !activeBlueprint || isLoading || isDirty} 
                        size="lg"
                        className="w-full bg-exciting text-exciting-foreground border-exciting hover:bg-exciting/90"
                    >
                        {isRunning ? (
                            <><Icon name="loader-2" className="w-5 h-5 mr-2 animate-spin" /> Running...</>
                        ) : (
                            <><Icon name="flask-conical" className="w-5 h-5 mr-2" />Run Evaluation</>
                        )}
                    </Button>
                    
                    {isDirty && (
                        <p className="text-sm text-muted-foreground mt-2 text-center">
                            Save your changes before running
                        </p>
                    )}
                </div>

                {/* Run history */}
                <div className="space-y-4">
                    <h3 className="font-medium">Recent Runs</h3>
                    {runHistory.length > 0 ? (
                        <div className="space-y-2">
                            {runHistory.slice(0, 5).map((run) => (
                                <div key={run.runId} className="border border-border rounded-lg p-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{run.blueprintName}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {new Date(run.completedAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <Button variant="outline" size="sm" asChild>
                                            <a href={run.resultUrl} target="_blank">
                                                View
                                            </a>
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-center py-8">
                            No runs yet. Run an evaluation to see results here.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );

    const renderMainContent = () => (
        <>
            {/* Mobile Layout - Tab-based */}
            <div className="md:hidden h-screen bg-background">
                {mobileActiveTab === 'files' && renderMobileFilesTab()}
                {mobileActiveTab === 'edit' && renderMobileEditTab()}
                {mobileActiveTab === 'run' && renderMobileRunTab()}
                {renderMobileTabBar()}
            </div>

            {/* Desktop Layout - Sidebar + Split View */}
            <div className="hidden md:flex h-screen bg-background">
                <div className="flex-shrink-0 border-r bg-muted w-72 flex flex-col" data-tour="file-navigator">
                    <FileNavigator
                        files={files}
                        activeFilePath={activeBlueprint?.path || null}
                        onSelectFile={loadFile}
                        onDeleteFile={setFileToDelete}
                        onRenameFile={handleRename}
                        onDuplicateFile={duplicateBlueprint}
                        onCreateNew={handleCreateNew}
                        onAutoCreate={() => setIsAutoCreateModalOpen(true)}
                        isLoading={status === 'setting_up' || isFetchingFiles}
                        isSyncingWithGitHub={isSyncingWithGitHub}
                        isCreating={isCreating}
                        isDeleting={!!deletingFilePath || status === 'deleting'}
                        deletingFilePath={deletingFilePath}
                        user={user}
                        forkName={forkName}
                        workspaceState={workspaceState}
                        onManageWorkspace={() => setIsManageWorkspaceOpen(true)}
                        onLogin={handleLogin}
                        isLoggingInWithGitHub={isLoggingInWithGitHub}
                        onLogout={handleLogout}
                        onRefresh={() => fetchFiles(true)}
                        showTourBlurb={showTourBlurb}
                        onTourBlurbClick={() => {
                            setIsTourModalOpen(true);
                            setShowTourBlurb(false);
                            localStorage.setItem('hasSeenTourBlurb', 'true');
                        }}
                    />
                </div>
                <main className="flex-1 flex flex-col overflow-hidden">
                    {renderHeader()}
                    {hasOpenPr && (
                        <div className="flex-shrink-0 border-b bg-primary/10 p-3 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <Icon name="git-pull-request" className="h-5 w-5 text-primary flex-shrink-0" />
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
                                <Icon name="loader-2" className="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                        )}
                        <div
                            className={`${showYamlEditor ? 'flex-1' : 'w-full'} relative overflow-y-auto transition-all duration-200 ease-in-out ${(!showYamlEditor || activeEditor === 'form') ? 'border-t-2 border-primary' : 'border-t-2 border-transparent'}`}
                            onClick={handleActivateFormEditor}
                            data-tour="form-panel"
                        >
                            <FormPanel
                                parsedBlueprint={parsedBlueprint}
                                onUpdate={handleFormUpdate}
                                isLoading={isLoading}
                                isSaving={isSaving}
                                isEditable={isEditable && (!showYamlEditor || activeEditor === 'form')}
                                onShowTour={() => setIsTourModalOpen(true)}
                            />
                        </div>
                        {showYamlEditor && (
                            <div
                                className={`flex-1 relative overflow-y-auto transition-all duration-200 ease-in-out ${activeEditor === 'yaml' ? 'border-t-2 border-primary' : 'border-t-2 border-transparent'}`}
                                onClick={() => {
                                    if (!showYamlEditor) setShowYamlEditor(true);
                                    setActiveEditor('yaml');
                                }}
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
                        )}
                    </div>
                </main>
            </div>
        </>
    );

    if (!isLoaded || isAuthLoading || (user?.isLoggedIn && (status === 'idle' || status === 'setting_up' || status === 'loading'))) {
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
                <Icon name="loader-2" className="w-8 h-8 animate-spin text-muted-foreground" />
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
            {isImportingFromConfig && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-card text-card-foreground px-8 py-6 rounded-lg shadow-2xl flex items-center gap-4 max-w-md mx-4 border border-border">
                        <Icon name="loader-2" className="w-8 h-8 animate-spin text-primary" />
                        <div>
                            <h3 className="font-bold text-lg">Importing from Analysis</h3>
                            <p className="text-sm opacity-90">{importMessage}</p>
                        </div>
                    </div>
                </div>
            )}
            {isLoggingInWithGitHub && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-exciting text-exciting-foreground px-8 py-6 rounded-lg shadow-2xl flex items-center gap-4 max-w-md mx-4">
                        <Icon name="loader-2" className="w-8 h-8 animate-spin" />
                        <div>
                            <h3 className="font-bold text-lg">Connecting to GitHub</h3>
                            <p className="text-sm opacity-90">Redirecting to GitHub authentication...</p>
                        </div>
                    </div>
                </div>
            )}
            <TourModal
                isOpen={isTourModalOpen}
                onClose={() => setIsTourModalOpen(false)}
                isLoggedIn={isLoggedIn}
                ChevronLeftIcon={() => <Icon name="chevron-left" />}
                ChevronRightIcon={() => <Icon name="chevron-right" />}
            />
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
                    onClose={handleModalClose}
                    isSubmitting={isModalSubmitting}
                    {...inputModalConfig}
                />
            )}
            <ConfirmRunModal
                isOpen={isConfirmRunModalOpen}
                onClose={() => setIsConfirmRunModalOpen(false)}
                onConfirm={handleDevRunConfirm}
                models={modelsToConfirm}
                isSubmitting={isRunning}
            />
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
            <WorkspaceManagementModal
                isOpen={isManageWorkspaceOpen || forkCreationRequired}
                onClose={() => {
                    setIsManageWorkspaceOpen(false);
                    setForkCreationRequired(false);
                }}
                workspaceState={workspaceState}
                forkName={forkName}
                onSetupWorkspace={async () => {
                    console.log('[SandboxClientPage] onSetupWorkspace called - calling setupWorkspace(true)');
                    const result = await setupWorkspace(true);
                    console.log('[SandboxClientPage] setupWorkspace result:', result);
                    if (result?.authFailure) {
                        clearAuth();
                    }
                    if (result?.success) {
                        setIsManageWorkspaceOpen(false);
                        setForkCreationRequired(false);
                    }
                }}
                onResetWorkspace={resetWorkspace}
                isSettingUp={status === 'setting_up'}
            />
            <Dialog open={!!fileToDelete} onOpenChange={(isOpen) => !isOpen && setFileToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Are you absolutely sure?</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. This will permanently delete the blueprint
                            <span className="font-semibold mx-1">{fileToDelete?.name}</span>.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setFileToDelete(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={confirmDeletion}>
                            {isDeleting ? <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function SandboxClientPage() {
    return (
        <SandboxClientPageInternal />
    );
}