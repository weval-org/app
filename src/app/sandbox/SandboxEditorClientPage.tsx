'use client';

import { useState, useEffect, useCallback, ChangeEvent, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import * as yaml from 'js-yaml';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import CIPLogo from '@/components/icons/CIPLogo';
import { SandboxBlueprint, Prompt, StatusResponse, Expectation } from './components/types';
import { GlobalConfigCard } from './components/GlobalConfigCard';
import { PromptCard } from './components/PromptCard';
import { RunStatusModal } from './components/RunStatusModal';
import { ContributionGuide } from './components/ContributionGuide';
import { YamlEditorCard } from './components/YamlEditorCard';
import { WelcomeCard } from './components/WelcomeCard';
import { AutoCreateModal } from './components/AutoCreateModal';
import { AutoWikiModal } from './components/AutoWikiModal';
import { BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import { RunConfirmationDialog } from './components/RunConfirmationDialog';
import { ProposalModal } from './components/ProposalModal';

// Dynamic imports for icons
const Plus = dynamic(() => import('lucide-react').then(mod => mod.Plus));
const Trash2 = dynamic(() => import('lucide-react').then(mod => mod.Trash2));
const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));
const Wand = dynamic(() => import('lucide-react').then(mod => mod.Wand2));
const GitPullRequest = dynamic(() => import('lucide-react').then(mod => mod.GitPullRequest));
const BookOpenCheck = dynamic(() => import('lucide-react').then(mod => mod.BookOpenCheck));

const areArraysEqual = (a: string[] | undefined, b: string[] | undefined) => {
    if (!a || !b || a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((value, index) => value === sortedB[index]);
};

const LOCAL_STORAGE_KEY_NORMAL = 'sandboxBlueprint_v1';
const LOCAL_STORAGE_KEY_ADVANCED = 'sandboxBlueprint_advanced_v1';
const RUN_STATE_STORAGE_KEY_NORMAL = 'sandboxRunState_v1';
const RUN_STATE_STORAGE_KEY_ADVANCED = 'sandboxRunState_advanced_v1';

const AVAILABLE_PLAYGROUND_MODELS = [
  "openrouter:openai/gpt-4.1-nano",
  "openrouter:anthropic/claude-3.5-haiku",
  "openrouter:mistralai/mistral-large-2411",
  "openrouter:x-ai/grok-3-mini-beta",
  "openrouter:qwen/qwen3-30b-a3b",
  "openrouter:mistralai/mistral-medium-3",
  "openrouter:deepseek/deepseek-chat-v3-0324"
];

const DEFAULT_PLAYGROUND_MODELS = [
  "openrouter:openai/gpt-4.1-nano",
  "openrouter:anthropic/claude-3.5-haiku",
  "openrouter:x-ai/grok-3-mini-beta",
  "openrouter:qwen/qwen3-30b-a3b"
];

const DEFAULT_BLUEPRINT: SandboxBlueprint = {
    title: 'My First Contribution Blueprint',
    description: 'A test to see how different models respond to my prompts, before proposing it to the community.',
    models: DEFAULT_PLAYGROUND_MODELS,
    system: '',
    prompts: [
        {
            id: 'prompt-default-1',
            prompt: 'Explain the concept of "separation of powers" in a democracy.',
            ideal: 'Separation of powers refers to the division of a state\'s government into branches, each with separate, independent powers and responsibilities, so that the powers of one branch are not in conflict with those of the other branches. The typical division is into a legislature, an executive, and a judiciary.',
            should: [
                { id: 'should-default-1', value: 'Mention the three branches: legislative, executive, and judicial.' },
                { id: 'should-default-2', value: 'Explain the purpose is to prevent concentration of power.' },
            ],
            should_not: [
                 { id: 'should_not-default-1', value: 'Attempt to describe separation of powers but confuses it with federalism.' },
            ],
        },
    ],
};

const BLANK_BLUEPRINT: SandboxBlueprint = {
    title: '',
    description: '',
    models: DEFAULT_PLAYGROUND_MODELS,
    system: '',
    prompts: [],
};

// --- Main Page Component ---

export default function SandboxEditorClientPage() {
    const pathname = usePathname();
    const isAdvancedMode = pathname === '/sandbox/advanced';

    const [blueprint, setBlueprint] = useState<SandboxBlueprint>(DEFAULT_BLUEPRINT);
    const [isClient, setIsClient] = useState(false);
    
    // YAML State
    const [yamlText, setYamlText] = useState('');
    const [yamlError, setYamlError] = useState<string | null>(null);
    const [editMode, setEditMode] = useState<'form' | 'yaml'>('form');

    // Run State
    const [runId, setRunId] = useState<string | null>(null);
    const [status, setStatus] = useState<StatusResponse>({ status: 'idle' });
    const [isRunModalOpen, setIsRunModalOpen] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isRunConfirmationOpen, setIsRunConfirmationOpen] = useState(false);

    // GitHub PR State
    const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);

    const { toast } = useToast();
    const promptsContainerRef = useRef<HTMLDivElement>(null);
    const prevPromptsLength = useRef(blueprint.prompts.length);

    const MAX_PROMPTS = isAdvancedMode ? 10 : 5;
    const MAX_MODELS = isAdvancedMode ? 10 : 5;
    const LOCAL_STORAGE_KEY = isAdvancedMode ? LOCAL_STORAGE_KEY_ADVANCED : LOCAL_STORAGE_KEY_NORMAL;
    const RUN_STATE_STORAGE_KEY = isAdvancedMode ? RUN_STATE_STORAGE_KEY_ADVANCED : RUN_STATE_STORAGE_KEY_NORMAL;

    // --- Effects for State Management ---

    const searchParams = useSearchParams();

    // Effect to handle the post-GitHub-auth redirect
    useEffect(() => {
        const authStatus = searchParams.get('github_auth_status');
        if (authStatus === 'success') {
            toast({
                title: "GitHub Authentication Successful",
                description: "You can now propose your blueprint as a pull request.",
            });
            // We can optionally trigger the PR creation automatically here,
            // but for now we'll let the user click the button again.
            // To auto-trigger: handleProposeBlueprint(true);
        } else if (authStatus === 'error') {
            const errorMessage = searchParams.get('error_message') || 'An unknown error occurred.';
            toast({
                variant: 'destructive',
                title: "GitHub Authentication Failed",
                description: errorMessage,
            });
        }
    }, [searchParams]);

    // Load state from localStorage on initial mount
    useEffect(() => {
        setIsClient(true);
        // Load blueprint
        try {
            const savedBlueprint = window.localStorage.getItem(LOCAL_STORAGE_KEY);
            if (savedBlueprint) {
                const parsed = JSON.parse(savedBlueprint);
                
                // If the saved blueprint has no models, it's likely from an older
                // version, so we populate it with the new defaults.
                if (!parsed.models || parsed.models.length === 0) {
                    parsed.models = DEFAULT_PLAYGROUND_MODELS;
                }

                // Basic validation and merging with default to prevent breakages
                setBlueprint(bp => ({...DEFAULT_BLUEPRINT, ...parsed, prompts: parsed.prompts || bp.prompts }));
            }
        } catch (e) {
            console.error("Failed to parse blueprint from localStorage", e);
        }

        // Load running evaluation state
        try {
            const savedRunState = window.localStorage.getItem(RUN_STATE_STORAGE_KEY);
            if (savedRunState) {
                const { runId: savedRunId, status: savedStatus } = JSON.parse(savedRunState);
                if (savedStatus.status !== 'complete' && savedStatus.status !== 'error') {
                    setRunId(savedRunId);
                    setStatus(savedStatus);
                    setIsRunModalOpen(true);
                } else {
                    window.localStorage.removeItem(RUN_STATE_STORAGE_KEY);
                }
            }
        } catch (e) {
            console.error("Failed to load run state from storage", e);
        }
        setIsInitialLoading(false);
    }, []);

    // Save blueprint to localStorage on change
    useEffect(() => {
        if (isClient) {
            window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(blueprint));
        }
    }, [blueprint, isClient]);

    // Save active run state to localStorage
    useEffect(() => {
        if (isClient && runId && status.status !== 'idle') {
            window.localStorage.setItem(RUN_STATE_STORAGE_KEY, JSON.stringify({ runId, status }));
        }
    }, [runId, status, isClient]);

    // Smooth scroll on add prompt
    useEffect(() => {
        if (blueprint.prompts.length > prevPromptsLength.current) {
            promptsContainerRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        prevPromptsLength.current = blueprint.prompts.length;
    }, [blueprint.prompts.length]);

    // Sync from Blueprint State -> YAML Text (ONLY in form mode)
    useEffect(() => {
        if (editMode === 'yaml') return; // In YAML mode, the editor is the source of truth.

        try {
            const header: any = {};
            if (blueprint.title?.trim()) header.title = blueprint.title.trim();
            if (blueprint.description?.trim()) header.description = blueprint.description.trim();
            if (blueprint.models && blueprint.models.length > 0 && !areArraysEqual(blueprint.models, DEFAULT_PLAYGROUND_MODELS)) {
                header.models = blueprint.models;
            }
            if (blueprint.system?.trim()) header.system = blueprint.system.trim();

            const formatExpectationToYaml = (exp: Expectation) => {
                if (!exp.value?.trim()) return null;
                return exp.value;
            };

            const prompts = blueprint.prompts.map(p => {
                if (!p.prompt.trim()) return null;

                const promptObject: any = {};
                promptObject.prompt = p.prompt;
                if (p.ideal.trim()) promptObject.ideal = p.ideal;

                const should = p.should.map(formatExpectationToYaml).filter(Boolean);
                if (should.length > 0) promptObject.should = should;

                const should_not = p.should_not.map(formatExpectationToYaml).filter(Boolean);
                if (should_not.length > 0) promptObject.should_not = should_not;

                return promptObject;
            }).filter(Boolean);

            const hasHeaderContent = Object.keys(header).length > 0;
            const headerYaml = hasHeaderContent ? yaml.dump(header, { skipInvalid: true, flowLevel: -1, indent: 2 }) : '';
            
            let finalYaml = '';
            if (prompts.length > 0) {
                const promptsYaml = yaml.dump(prompts, { skipInvalid: true, indent: 2, flowLevel: -1 });
                finalYaml = hasHeaderContent ? `${headerYaml}---\n${promptsYaml}` : promptsYaml;
            } else {
                finalYaml = headerYaml;
            }
            
            setYamlText(finalYaml);
            setYamlError(null);
        } catch (e: any) {
            setYamlError("Error generating YAML: " + e.message);
        }
    }, [blueprint, editMode]);

    const updateBlueprintFromYaml = useCallback((value: string, fromAutoCreate: boolean = false) => {
        try {
            const docs = yaml.loadAll(value).filter(d => d !== null && d !== undefined);
            const newBlueprint: SandboxBlueprint = { ...DEFAULT_BLUEPRINT, prompts: [] };

            if (docs.length === 0) {
                setBlueprint(newBlueprint);
                setYamlError(null);
                return true;
            }

            const firstDoc: any = docs[0] || {};
            const firstDocIsConfig = typeof firstDoc === 'object' && !Array.isArray(firstDoc) && (firstDoc.title || firstDoc.description || firstDoc.models || firstDoc.system || firstDoc.id);
            
            const configHeader = firstDocIsConfig ? firstDoc : {};
            const rawPrompts = firstDocIsConfig ? (docs.length > 1 ? docs.slice(1) : (configHeader.prompts || [])) : docs;

            newBlueprint.title = configHeader.title || '';
            newBlueprint.description = configHeader.description || '';
            newBlueprint.models = Array.isArray(configHeader.models) ? configHeader.models : [];
            newBlueprint.system = configHeader.system || '';

            const parseExpectations = (rawItems: any[] | undefined): Expectation[] => {
                if (!Array.isArray(rawItems)) return [];
                return rawItems.map((item, index): Expectation => {
                    const id = `exp-${Date.now()}-${index}`;
                    const value = typeof item === 'string' ? item : yaml.dump(item).trim();
                    return { id, value };
                });
            };

            let parsedPrompts = (rawPrompts.flat() as any[]).map((p: any, index: number): Prompt => ({
                id: p.id || `prompt-${Date.now()}-${index}`,
                prompt: p.prompt || '',
                ideal: p.ideal || '',
                should: parseExpectations(p.should || p.points || p.expect),
                should_not: parseExpectations(p.should_not),
            }));
            
            if (parsedPrompts.length > MAX_PROMPTS) {
                if (fromAutoCreate) { // Only toast for auto-create
                    toast({
                        variant: 'destructive',
                        title: 'Prompt Limit Exceeded',
                        description: `Blueprint proposals are limited to ${MAX_PROMPTS} prompts. The first ${MAX_PROMPTS} have been imported.`
                    });
                }
                parsedPrompts = parsedPrompts.slice(0, MAX_PROMPTS);
            }

            newBlueprint.prompts = parsedPrompts;

            setBlueprint(newBlueprint);
            setYamlError(null);
            return true;
        } catch (e: any) {
            setYamlError(e.message);
            return false;
        }
    }, [isAdvancedMode, toast]);

    const handleYamlChange = useCallback((value: string) => {
        setYamlText(value);
        try {
            yaml.loadAll(value);
            setYamlError(null);
        } catch (e: any) {
            setYamlError(e.message);
        }
    }, []);

    const handleToggleEditMode = () => {
        if (editMode === 'form') {
            setEditMode('yaml');
        } else { // Switching from 'yaml' to 'form'
            if (updateBlueprintFromYaml(yamlText)) {
                setEditMode('form');
            } else {
                if (window.confirm("You have an error in your YAML. Switching to form mode will discard these changes and revert to the last valid state. Continue?")) {
                    setYamlError(null);
                    setEditMode('form'); // This triggers the useEffect to revert the YAML text
                }
            }
        }
    };

    const handleAutoCreate = (generatedYaml: string) => {
        setYamlText(generatedYaml);
        updateBlueprintFromYaml(generatedYaml, true);
        setEditMode('form');
    };

    // --- Handlers for Blueprint Manipulation ---

    const handleUpdateBlueprint = (updatedBlueprint: SandboxBlueprint) => {
        setBlueprint(updatedBlueprint);
    };

    const handleAddPrompt = () => {
        if (blueprint.prompts.length >= MAX_PROMPTS) {
            toast({
                variant: 'destructive',
                title: 'Prompt Limit Reached',
                description: `You can add a maximum of ${MAX_PROMPTS} prompts in ${isAdvancedMode ? 'advanced' : 'normal'} mode.`
            });
            return;
        }
        setBlueprint(prev => ({ 
            ...prev, 
            prompts: [...prev.prompts, { id: `prompt-${Date.now()}`, prompt: '', ideal: '', should: [], should_not: [] }] 
        }));
    };

    const handleUpdatePrompt = (updatedPrompt: Prompt) => {
        setBlueprint(prev => ({ 
            ...prev, 
            prompts: prev.prompts.map(p => (p.id === updatedPrompt.id ? updatedPrompt : p)) 
        }));
    };

    const handleRemovePrompt = (id: string) => {
        setBlueprint(prev => ({ ...prev, prompts: prev.prompts.filter(p => p.id !== id) }));
    };

    const handleReset = () => {
        if (window.confirm("Are you sure you want to clear the form? This will erase all your current work and cannot be undone.")) {
            setBlueprint(BLANK_BLUEPRINT);
            setRunId(null);
            setStatus({ status: 'idle' });
            setIsRunModalOpen(false);
            window.localStorage.removeItem(RUN_STATE_STORAGE_KEY);
            window.localStorage.removeItem(LOCAL_STORAGE_KEY);
            toast({
                title: 'Form Cleared',
                description: 'The sandbox studio has been reset.',
            });
        }
    };

    const handlePopulateWithExample = () => {
        if (window.confirm("This will clear the form and populate it with the example. Any unsaved work will be lost. Continue?")) {
            setBlueprint(DEFAULT_BLUEPRINT);
            toast({
                title: 'Example Loaded',
                description: 'The default example has been loaded into the form.',
            });
        }
    };

    const handleProposeClick = () => {
        // Simple validation before opening the proposal modal
        if (!blueprint.title.trim()) {
            toast({
                variant: 'destructive',
                title: "Blueprint Title Required",
                description: "Please provide a title for your blueprint before proposing it.",
            });
            return;
        }
         if (!yamlText.trim()) {
            toast({
                variant: 'destructive',
                title: "Empty Blueprint",
                description: "You can't propose an empty blueprint.",
            });
            return;
        }
        setIsProposalModalOpen(true);
    };

    const handleRunClick = () => {
        // --- Validation ---
        if (blueprint.prompts.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Validation Failed',
                description: 'Please add at least one prompt to run a test.',
            });
            return;
        }

        for (let i = 0; i < blueprint.prompts.length; i++) {
            const prompt = blueprint.prompts[i];
            const promptNumber = i + 1;

            if (prompt.prompt.trim().length <= 10) {
                toast({
                    variant: 'destructive',
                    title: 'Validation Failed',
                    description: `Prompt #${promptNumber} must be longer than 10 characters.`,
                });
                return;
            }

            const validShoulds = prompt.should.filter(exp => exp.value.trim().length > 0);
            const validShouldNots = prompt.should_not.filter(exp => exp.value.trim().length > 0);

            if (validShoulds.length === 0 && validShouldNots.length === 0) {
                toast({
                    variant: 'destructive',
                    title: 'Validation Failed',
                    description: `Prompt #${promptNumber} needs at least one 'SHOULD' or 'SHOULD NOT' criterion.`,
                });
                return;
            }

            for (const exp of validShoulds) {
                if (exp.value.trim().length <= 10) {
                    toast({
                        variant: 'destructive',
                        title: 'Validation Failed',
                        description: `A 'SHOULD' criterion in Prompt #${promptNumber} is too short. All criteria must be longer than 10 characters.`,
                    });
                    return;
                }
            }
            
            for (const exp of validShouldNots) {
                if (exp.value.trim().length <= 10) {
                    toast({
                        variant: 'destructive',
                        title: 'Validation Failed',
                        description: `A 'SHOULD NOT' criterion in Prompt #${promptNumber} is too short. All criteria must be longer than 10 characters.`,
                    });
                    return;
                }
            }
        }

        // If validation passes, show confirmation dialog
        setIsRunConfirmationOpen(true);
    };

    const handleRun = async () => {
        setIsRunConfirmationOpen(false);
        
        // --- If validation passes, proceed ---
        setStatus({ status: 'pending', message: 'Initiating evaluation...' });
        setIsRunModalOpen(true);
        setRunId(null);

        try {
            const payload: any = { ...blueprint, advanced: isAdvancedMode };
            
            // For the normal run, we don't need to check model equality
            // as the backend will force a specific cheap model set.
            if (isAdvancedMode && areArraysEqual(blueprint.models, DEFAULT_PLAYGROUND_MODELS)) {
                delete payload.models;
            }

            const response = await fetch('/api/sandbox/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to start evaluation run.');
            }

            const { runId: newRunId } = await response.json();
            setRunId(newRunId);
            setStatus({ status: 'pending', message: 'Run accepted and queued.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error starting run', description: error.message });
            setStatus({ status: 'error', message: error.message });
        }
    };

    const handleCancelRun = async () => {
        if (!runId) return;
        try {
            // This API now needs to exist for the sandbox runs
            await fetch(`/api/sandbox/cancel/${runId}`, { method: 'POST' });
            toast({ title: "Cancellation Requested", description: "The run will be stopped shortly." });
        } catch(e: any) {
            toast({ variant: 'destructive', title: "Cancellation Failed", description: e.message });
        }
    };

    // --- Polling Logic ---
    useEffect(() => {
        if (!runId || !isRunModalOpen) return;

        const poll = async () => {
            try {
                // This API needs to exist for sandbox runs
                const response = await fetch(`/api/sandbox/status/${runId}`);
                if (response.ok) {
                    const newStatus: StatusResponse = await response.json();
                    setStatus(newStatus);
                    if (newStatus.status === 'complete' || newStatus.status === 'error') {
                        clearInterval(intervalId);
                    }
                } else if (response.status !== 404 && response.status !== 202) {
                    setStatus({ status: 'error', message: `Failed to get status (HTTP ${response.status}).` });
                    clearInterval(intervalId);
                }
            } catch (error) {
                setStatus({ status: 'error', message: 'Polling failed.' });
                clearInterval(intervalId);
            }
        };
        
        const intervalId = setInterval(poll, 3000);
        poll(); // Initial poll
        return () => clearInterval(intervalId);
    }, [runId, isRunModalOpen]);

    // --- Render Logic ---

    if (!isClient || isInitialLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
                <div className="flex flex-col items-center gap-4">
                    <CIPLogo className="w-12 h-12" />
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground">Loading Sandbox Studio...</p>
                </div>
            </div>
        );
    }
    
    const isRunning = status.status !== 'idle' && status.status !== 'complete' && status.status !== 'error';

    return (
        <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
            <header className="bg-background/80 backdrop-blur-lg border-b sticky top-0 z-20">
                <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <CIPLogo className="w-7 h-7" />
                        <span>Sandbox Studio {isAdvancedMode && <span className="text-sm font-normal text-primary">(Advanced)</span>}</span>
                    </h1>
                    <div className="flex items-center gap-2">
                        {isAdvancedMode && (
                            <AutoWikiModal onGenerated={handleAutoCreate}>
                                <Button variant="outline">
                                    <BookOpenCheck className="w-4 h-4 mr-2" />
                                    Auto-Wiki
                                </Button>
                            </AutoWikiModal>
                        )}

                        <AutoCreateModal onGenerated={handleAutoCreate}>
                            <Button variant="outline">
                                <Wand className="w-4 h-4 mr-2" />
                                Auto-Create
                            </Button>
                        </AutoCreateModal>
                        
                        <Button onClick={handleRunClick} disabled={isRunning} variant={"default"}>
                            {isRunning 
                                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Running...</>
                                : isAdvancedMode
                                    ? <>🚀 Run Evaluation</>
                                    : <>🧪 Test Blueprint</>
                            }
                        </Button>
                        
                        <Button variant={isAdvancedMode ? "secondary" : "default"} onClick={handleProposeClick} disabled={isRunning}>
                           <GitPullRequest className="w-4 h-4 mr-2" />
                           Propose
                        </Button>
                    </div>
                </div>
            </header>
            
            <main className="max-w-screen-2xl mx-auto p-4 sm:p-6 lg:p-8 w-full flex-grow overflow-y-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-8 xl:gap-12 h-full">
                    {/* Left Column: Form UI */}
                    <div className="lg:pr-4 h-full overflow-y-auto custom-scrollbar pb-12">
                        <fieldset disabled={editMode === 'yaml'} className="disabled:opacity-70 transition-opacity">
                            <div className="space-y-8">
                                <WelcomeCard />
                                <GlobalConfigCard 
                                    blueprint={blueprint} 
                                    onUpdate={handleUpdateBlueprint} 
                                    availableModels={AVAILABLE_PLAYGROUND_MODELS}
                                    isAdvanced={isAdvancedMode}
                                    maxSelection={MAX_MODELS}
                                />

                                <div className="space-y-8" ref={promptsContainerRef}>
                                    {blueprint.prompts.map((p) => (
                                        <PromptCard
                                            key={p.id}
                                            prompt={p}
                                            onUpdate={handleUpdatePrompt}
                                            onRemove={() => handleRemovePrompt(p.id)}
                                        />
                                    ))}
                                </div>

                                <div className="text-center">
                                    <Button 
                                        variant="outline" 
                                        onClick={handleAddPrompt}
                                        disabled={blueprint.prompts.length >= MAX_PROMPTS}
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Prompt ({blueprint.prompts.length}/{MAX_PROMPTS})
                                    </Button>
                                </div>

                                <div className="text-center border-t pt-6 space-x-2">
                                    <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground hover:text-destructive">
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Reset Form
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={handlePopulateWithExample}>
                                        Populate with Example
                                    </Button>
                                </div>

                                <div className="py-8 border-t border-dashed">
                                    <div className="text-center space-y-4">
                                         <div className="flex justify-center items-center gap-4">
                                            <Button size="lg" onClick={handleRunClick} disabled={isRunning} variant="secondary">
                                                {isRunning 
                                                    ? <><Loader2 className="w-5 h-5 animate-spin mr-2" />Running...</>
                                                    : isAdvancedMode
                                                        ? <>🚀 Run Evaluation</>
                                                        : <>🧪 Test Blueprint</>
                                                }
                                            </Button>
                                            <Button size="lg" onClick={handleProposeClick} variant="default" disabled={isRunning}>
                                                <GitPullRequest className="w-5 h-5 mr-3" />
                                                Propose Blueprint
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-3 max-w-md mx-auto">
                                            {isAdvancedMode
                                                ? "Run a full evaluation to validate your results, then propose it to the community."
                                                : "Test your blueprint with a quick run, then open a GitHub issue to propose it."
                                            }
                                        </p>
                                    </div>
                                </div>
                                
                                <ContributionGuide />

                            </div>
                        </fieldset>
                    </div>

                    {/* Right Column: YAML Editor */}
                    <div className="flex flex-col h-full">
                        <YamlEditorCard 
                            yamlText={yamlText} 
                            yamlError={yamlError}
                            onYamlChange={handleYamlChange} 
                            readOnly={editMode === 'form'}
                            onToggleEditMode={handleToggleEditMode}
                        />
                    </div>
                </div>
            </main>

            <RunConfirmationDialog
                isOpen={isRunConfirmationOpen}
                onClose={() => setIsRunConfirmationOpen(false)}
                onConfirm={handleRun}
                isAdvancedMode={isAdvancedMode}
            />

            <RunStatusModal
                isOpen={isRunModalOpen}
                status={status}
                isRunning={isRunning}
                onClose={() => setIsRunModalOpen(false)}
                onCancel={handleCancelRun}
            />

            <ProposalModal
                isOpen={isProposalModalOpen}
                onClose={() => setIsProposalModalOpen(false)}
                blueprintYaml={yamlText}
                blueprintTitle={blueprint.title}
                blueprintDescription={blueprint.description}
            />
        </div>
    );
}
