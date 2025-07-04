'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import * as yaml from 'js-yaml';
import { useAuth } from '../hooks/useAuth';
import { useWorkspace } from '../hooks/useWorkspace';
import { useToast } from '@/components/ui/use-toast';
import { Toaster } from "@/components/ui/toaster";
import { ProposeBlueprintModal } from './ProposeBlueprintModal';
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
import { AutoWikiModal } from './AutoWikiModal';
import { DEFAULT_BLUEPRINT_CONTENT } from '../hooks/useWorkspace';
import { generateMinimalBlueprintYaml } from '../utils/yaml-generator';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';
import { useImmer } from 'use-immer';
import { InputModal } from './InputModal';

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2), { ssr: false });
const Save = dynamic(() => import('lucide-react').then(mod => mod.Save), { ssr: false });
const GitPullRequest = dynamic(() => import('lucide-react').then(mod => mod.GitPullRequest), { ssr: false });
const Github = dynamic(() => import('lucide-react').then(mod => mod.Github), { ssr: false });
const FlaskConical = dynamic(() => import('lucide-react').then(mod => mod.FlaskConical), { ssr: false });

export default function SandboxV2ClientPage() {
    const { user, isLoading: isAuthLoading } = useAuth();
    const {
        status,
        files,
        activeBlueprint,
        isFetchingFiles,
        isFetchingFileContent,
        runId,
        runStatus,
        setupWorkspace,
        loadFile,
        saveBlueprint,
        createBlueprint,
        createBlueprintWithContent,
        deleteBlueprint,
        createPullRequest,
        runEvaluation,
        forkName,
        setRunStatus,
        setRunId,
    } = useWorkspace(user?.isLoggedIn ?? false, user?.username ?? null);

    const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
    const [isRunModalOpen, setIsRunModalOpen] = useState(false);
    const [isRunConfigModalOpen, setIsRunConfigModalOpen] = useState(false);
    const [isAnonymousRunModalOpen, setIsAnonymousRunModalOpen] = useState(false);
    const [isAutoCreateModalOpen, setIsAutoCreateModalOpen] = useState(false);
    const [isAutoWikiModalOpen, setIsAutoWikiModalOpen] = useState(false);
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
    const [localBlueprintContent, setLocalBlueprintContent] = useState<string | null>(null);
    const [parsedBlueprint, setParsedBlueprint] = useImmer<ComparisonConfig | null>(null);
    const [yamlError, setYamlError] = useState<string | null>(null);
    const { toast } = useToast();

    const isLocal = activeBlueprint?.isLocal ?? true;

    useEffect(() => {
        setupWorkspace();
    }, [setupWorkspace]);

    useEffect(() => {
        if (activeBlueprint) {
            setLocalBlueprintContent(activeBlueprint.content);
            setYamlError(null);
        } else {
            setLocalBlueprintContent(null);
            setYamlError(null);
        }
    }, [activeBlueprint]);

    useEffect(() => {
        if (localBlueprintContent) {
            try {
                const parsed = parseAndNormalizeBlueprint(localBlueprintContent, 'yaml');
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
    }, [localBlueprintContent, setParsedBlueprint]);

    useEffect(() => {
        const inProgressStatuses = ['pending', 'generating_responses', 'evaluating', 'saving'];
        if (runId && inProgressStatuses.includes(runStatus.status)) {
            setIsRunModalOpen(true);
        }
    }, [runId, runStatus.status]);

    useEffect(() => {
        const inProgressStatuses = ['pending', 'generating_responses', 'evaluating', 'saving'];
        if (!runId || !inProgressStatuses.includes(runStatus.status)) return;

        const poll = async () => {
            try {
                const response = await fetch(`/api/sandbox2/status/${runId}`);
                if (response.ok) {
                    const newStatus = await response.json();
                    setRunStatus(newStatus);
                } else if (response.status !== 404 && response.status !== 202) {
                     setRunStatus({ status: 'error', message: `Failed to get status (HTTP ${response.status}).` });
                }
            } catch (error: any) {
                 setRunStatus({ status: 'error', message: 'Polling failed.' });
            }
        };

        const intervalId = setInterval(poll, 3000);
        poll(); // Initial poll
        return () => clearInterval(intervalId);
    }, [runId, runStatus.status, setRunStatus]);

    useEffect(() => {
        if (runStatus.status === 'complete' || runStatus.status === 'error') {
            setIsRunConfigModalOpen(false);
        }
    }, [runStatus.status]);

    const handleProposeSubmit = async (data: { title: string; body: string }) => {
        const prUrl = await createPullRequest(data);
        if (prUrl) {
            toast({
                title: 'Pull Request Created!',
                description: <a href={prUrl} target="_blank" rel="noopener noreferrer" className="underline">Click here to view it on GitHub.</a>,
                duration: 10000,
            });
            setIsProposalModalOpen(false);
        }
    };
    
    const handleAutoGenerated = async (yamlContent: string) => {
        try {
            const blueprint = yaml.load(yamlContent) as { title?: string };
            const title = blueprint?.title;

            if (!title) {
                console.warn("Auto-generated blueprint is missing a title. Using a default name.");
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
            let errorMessage = 'Could not parse or save the auto-generated blueprint.';
            if (error instanceof yaml.YAMLException) {
                errorMessage = `Could not parse the generated YAML: ${error.message}`;
            }
            toast({
                variant: 'destructive',
                title: 'Error Processing Blueprint',
                description: errorMessage,
            });
        }
    };

    const handleFormUpdate = useCallback((newConfig: ComparisonConfig) => {
        setParsedBlueprint(newConfig);
        try {
            const finalYaml = generateMinimalBlueprintYaml(newConfig);
            setLocalBlueprintContent(finalYaml);
        } catch (error) {
            console.error("Failed to generate YAML from updated config", error);
            toast({ variant: 'destructive', title: 'YAML Generation Error', description: 'Could not serialize form content to YAML.' });
        }
    }, [toast, setParsedBlueprint]);

    const handleYamlUpdate = (newContent: string) => {
        setLocalBlueprintContent(newContent);
    };

    const handleSave = async () => {
        if (localBlueprintContent === null || !activeBlueprint) return;

        const isPromotionFlow = activeBlueprint.isLocal && user?.isLoggedIn;

        if (isPromotionFlow) {
            const title = parsedBlueprint?.title || 'new-blueprint';
            const originalLocalBlueprint = activeBlueprint;
            setInputModalConfig({
                title: "Save to GitHub",
                description: "Enter a filename for your blueprint. It will be saved to your forked repository.",
                inputLabel: "Filename",
                initialValue: normalizeFilename(title),
                submitButtonText: "Save",
                onSubmit: async (filename) => {
                    setIsModalSubmitting(true);
                    const finalFilename = filename.endsWith('.yml') ? filename : `${filename}.yml`;
                    const newFile = await createBlueprintWithContent(finalFilename, localBlueprintContent);
                    if (newFile && originalLocalBlueprint) {
                        await deleteBlueprint(originalLocalBlueprint);
                    }
                    setInputModalConfig(null);
                    setIsModalSubmitting(false);
                }
            });
        } else {
            saveBlueprint(localBlueprintContent);
        }
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
                if (filename && createBlueprintWithContent) {
                    const finalFilename = filename.endsWith('.yml') ? filename : `${filename}.yml`;
                    await createBlueprintWithContent(finalFilename, DEFAULT_BLUEPRINT_CONTENT);
                }
                setInputModalConfig(null);
                setIsModalSubmitting(false);
            }
        });
    };

    const handleLogin = () => { window.location.href = '/api/github/auth/request'; };
    
    const isLoading = status === 'setting_up' || isFetchingFileContent;
    const isSaving = status === 'saving';
    const isRunning = ['pending', 'generating_responses', 'evaluating', 'saving'].includes(runStatus.status);
    const isCreating = status === 'saving'; // Re-use saving state for creation
    const isDeleting = status === 'deleting';
    const isCreatingPr = status === 'creating_pr';
    const isEditable = !isLoading && !isSaving && !!activeBlueprint;

    const handleActivateFormEditor = () => {
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
        const isPromotionFlow = activeBlueprint?.isLocal && user?.isLoggedIn;
        const isContentUnchanged = localBlueprintContent === activeBlueprint?.content;
        const isSaveDisabled = isSaving || isLoading || !activeBlueprint || (isContentUnchanged && !isPromotionFlow);

        return (
            <header className="flex-shrink-0 border-b h-14 flex items-center justify-between px-4">
                <div className="text-sm font-medium text-muted-foreground truncate pr-4">
                    {activeBlueprint ? activeBlueprint.name : 'No file selected'}
                </div>
                <div className="flex items-center gap-3">
                    <Button 
                        onClick={handleSave} 
                        disabled={isSaveDisabled}
                        size="sm"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {isPromotionFlow ? 'Save to GitHub' : 'Save'}
                    </Button>
                    <Button onClick={handleRunRequest} disabled={isRunning || !activeBlueprint} size="sm">
                         {isRunning ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
                        ) : (
                            <><FlaskConical className="w-4 h-4 mr-2" />Run Evaluation</>
                        )}
                    </Button>
                    
                    <Separator orientation="vertical" className="h-6" />

                    {user?.isLoggedIn ? (
                        <>
                            {!isLocal && (
                                <Button onClick={() => setIsProposalModalOpen(true)} disabled={isCreatingPr || !activeBlueprint} size="sm" variant="outline">
                                    <Github className="w-4 h-4 mr-2" />
                                    {isCreatingPr ? 'Proposing...' : 'Propose'}
                                </Button>
                            )}
                            <div className="text-sm text-right">
                                <span className="font-semibold">{user.username}</span>
                                {forkName && (
                                    <div className="text-xs text-muted-foreground">
                                        <a href={`https://github.com/${user.username}/${forkName}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                            {forkName}
                                        </a>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <Button onClick={handleLogin} variant="outline" size="sm">
                            <Github className="w-4 h-4 mr-2" />
                            Login with GitHub
                        </Button>
                    )}
                </div>
            </header>
        );
    };

    const renderMainContent = () => (
        <div className="flex h-screen bg-background">
             <div className="flex-shrink-0 border-r bg-muted w-72 flex flex-col">
                <FileNavigator
                    files={files}
                    activeFilePath={activeBlueprint?.path || null}
                    onSelectFile={loadFile}
                    onDeleteFile={deleteBlueprint}
                    onCreateNew={handleCreateNew}
                    onAutoCreate={() => setIsAutoCreateModalOpen(true)}
                    onAutoWiki={() => setIsAutoWikiModalOpen(true)}
                    isLoading={status === 'setting_up' || isFetchingFiles}
                    isCreating={isCreating}
                    isDeleting={isDeleting}
                />
            </div>
            <main className="flex-1 flex flex-col overflow-hidden">
                {renderHeader()}
                <div className="flex-grow flex flex-row gap-px bg-border relative min-h-0">
                    {isFetchingFileContent && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    )}
                    <div
                        className={`flex-1 relative overflow-y-auto transition-all duration-200 ease-in-out ${activeEditor === 'form' ? 'border-t-2 border-primary' : 'border-t-2 border-transparent'}`}
                        onClick={handleActivateFormEditor}
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
                    >
                       <EditorPanel
                            rawContent={localBlueprintContent}
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
                    loadingMessage = 'Setting up your workspace (checking or creating fork)...';
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
            <ProposeBlueprintModal 
                isOpen={isProposalModalOpen} 
                onClose={() => setIsProposalModalOpen(false)} 
                onSubmit={handleProposeSubmit} 
                isSubmitting={isCreatingPr}
            />
            <AutoCreateModal 
                onGenerated={handleAutoGenerated}
                isOpen={isAutoCreateModalOpen}
                onOpenChange={setIsAutoCreateModalOpen}
            />
            <AutoWikiModal 
                onGenerated={handleAutoGenerated}
                isOpen={isAutoWikiModalOpen}
                onOpenChange={setIsAutoWikiModalOpen}
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
        </>
    );
}