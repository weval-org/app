'use client';

import { useState, useEffect, useCallback, ChangeEvent, useRef } from 'react';
import dynamic from 'next/dynamic';
import * as yaml from 'js-yaml';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import CIPLogo from '@/components/icons/CIPLogo';
import { PlaygroundBlueprint, Prompt, StatusResponse, Expectation } from './components/types';
import { GlobalConfigCard } from './components/GlobalConfigCard';
import { PromptCard } from './components/PromptCard';
import { RunStatusModal } from './components/RunStatusModal';
import { ContributionGuide } from './components/ContributionGuide';
import { YamlEditorCard } from './components/YamlEditorCard';
import { WelcomeCard } from './components/WelcomeCard';
import { AutoCreateModal } from './components/AutoCreateModal';

// Dynamic imports for icons
const Plus = dynamic(() => import('lucide-react').then(mod => mod.Plus));
const Trash2 = dynamic(() => import('lucide-react').then(mod => mod.Trash2));
const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));
const Wand = dynamic(() => import('lucide-react').then(mod => mod.Wand2));

const LOCAL_STORAGE_KEY = 'playgroundBlueprint_v2';
const RUN_STATE_STORAGE_KEY = 'playgroundRunState';

const DEFAULT_BLUEPRINT: PlaygroundBlueprint = {
    title: 'My First Playground Blueprint',
    description: 'A quick test to see how different models respond to my prompts.',
    models: [],
    system: '',
    prompts: [
        {
            id: 'prompt-default-1',
            prompt: 'Explain the concept of "separation of powers" in a democracy.',
            ideal: 'Separation of powers refers to the division of a state\'s government into branches, each with separate, independent powers and responsibilities, so that the powers of one branch are not in conflict with those of the other branches. The typical division is into a legislature, an executive, and a judiciary.',
            should: [
                { id: 'should-default-1', value: 'Mentions the three branches: legislative, executive, and judicial.' },
                { id: 'should-default-2', value: 'Explains the purpose is to prevent concentration of power.' },
            ],
            should_not: [
                 { id: 'should_not-default-1', value: 'Attempts to describe separation of powers but confuses it with federalism.' },
            ],
        },
    ],
};

// --- Main Page Component ---

export default function PlaygroundEditorClientPage() {
    const [blueprint, setBlueprint] = useState<PlaygroundBlueprint>(DEFAULT_BLUEPRINT);
    const [isClient, setIsClient] = useState(false);
    
    // YAML State
    const [yamlText, setYamlText] = useState('');
    const [yamlError, setYamlError] = useState<string | null>(null);

    // Run State
    const [runId, setRunId] = useState<string | null>(null);
    const [status, setStatus] = useState<StatusResponse>({ status: 'idle' });
    const [isRunModalOpen, setIsRunModalOpen] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const { toast } = useToast();
    const promptsContainerRef = useRef<HTMLDivElement>(null);
    const prevPromptsLength = useRef(blueprint.prompts.length);

    const MAX_PROMPTS = 5;

    // --- Effects for State Management ---

    // Load state from localStorage on initial mount
    useEffect(() => {
        setIsClient(true);
        // Load blueprint
        try {
            const savedBlueprint = window.localStorage.getItem(LOCAL_STORAGE_KEY);
            if (savedBlueprint) {
                const parsed = JSON.parse(savedBlueprint);
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

    // Sync from Blueprint State -> YAML Text
    useEffect(() => {
        try {
            const header: any = {};
            if (blueprint.title?.trim()) header.title = blueprint.title.trim();
            if (blueprint.description?.trim()) header.description = blueprint.description.trim();
            if (blueprint.models && blueprint.models.length > 0) header.models = blueprint.models;
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
    }, [blueprint]);

    const handleYamlChange = useCallback((value: string) => {
        setYamlText(value);
        try {
            const docs = yaml.loadAll(value).filter(d => d !== null && d !== undefined);
            const newBlueprint: PlaygroundBlueprint = { ...DEFAULT_BLUEPRINT, prompts: [] };

            if (docs.length === 0) {
                setBlueprint(newBlueprint);
                setYamlError(null);
                return;
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
                toast({
                    variant: 'destructive',
                    title: 'Prompt Limit Exceeded',
                    description: `Playground blueprints are limited to ${MAX_PROMPTS} prompts. The first ${MAX_PROMPTS} have been imported.`
                });
                parsedPrompts = parsedPrompts.slice(0, MAX_PROMPTS);
            }

            newBlueprint.prompts = parsedPrompts;

            setBlueprint(newBlueprint);
            setYamlError(null);
        } catch (e: any) {
            setYamlError(e.message);
        }
    }, []);

    // --- Handlers for Blueprint Manipulation ---

    const handleUpdateBlueprint = (updatedBlueprint: PlaygroundBlueprint) => {
        setBlueprint(updatedBlueprint);
    };

    const handleAddPrompt = () => {
        if (blueprint.prompts.length >= MAX_PROMPTS) {
            toast({
                variant: 'destructive',
                title: 'Prompt Limit Reached',
                description: `You can add a maximum of ${MAX_PROMPTS} prompts in the playground.`
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
            setBlueprint(DEFAULT_BLUEPRINT);
            setRunId(null);
            setStatus({ status: 'idle' });
            setIsRunModalOpen(false);
            window.localStorage.removeItem(RUN_STATE_STORAGE_KEY);
            window.localStorage.removeItem(LOCAL_STORAGE_KEY);
            toast({
                title: 'Form Reset',
                description: 'The playground has been reset to the default example.',
            });
        }
    };

    // --- Handlers for API Interaction ---

    const handleRun = async () => {
        setStatus({ status: 'pending', message: 'Initiating evaluation...' });
        setIsRunModalOpen(true);
        setRunId(null);

        try {
            const response = await fetch('/api/playground/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(blueprint),
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
            await fetch(`/api/playground/cancel/${runId}`, { method: 'POST' });
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
                const response = await fetch(`/api/playground/status/${runId}`);
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
                    <p className="text-muted-foreground">Loading Playground...</p>
                </div>
            </div>
        );
    }
    
    const isRunning = status.status !== 'idle' && status.status !== 'complete' && status.status !== 'error';

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <header className="bg-background/80 backdrop-blur-lg border-b sticky top-0 z-20">
                <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <CIPLogo className="w-7 h-7" />
                        <span>Blueprint Playground</span>
                    </h1>
                    <div className="flex items-center gap-2">
                        <AutoCreateModal onGenerated={handleYamlChange}>
                            <Button variant="outline">
                                <Wand className="w-4 h-4 mr-2" />
                                Auto-Create
                            </Button>
                        </AutoCreateModal>
                        <Button onClick={handleRun} disabled={isRunning} className="w-36">
                            {isRunning ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Running</> : "🧪 Run Playground"}
                        </Button>
                    </div>
                </div>
            </header>
            
            <main className="max-w-screen-2xl mx-auto p-4 sm:p-6 lg:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-8 xl:gap-12">
                    {/* Left Column: Form UI */}
                    <div className="lg:pr-4">
                        <div className="space-y-8">
                            <WelcomeCard />
                            <GlobalConfigCard blueprint={blueprint} onUpdate={handleUpdateBlueprint} />

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

                            <div className="text-center border-t pt-6">
                                <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground hover:text-destructive">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Reset Form and Clear Saved Work
                                </Button>
                            </div>

                            <ContributionGuide />
                        </div>
                    </div>

                    {/* Right Column: YAML Editor */}
                    <div>
                        <YamlEditorCard 
                            yamlText={yamlText} 
                            yamlError={yamlError}
                            onYamlChange={handleYamlChange} 
                        />
                    </div>
                </div>
            </main>

            <RunStatusModal
                isOpen={isRunModalOpen}
                status={status}
                isRunning={isRunning}
                onClose={() => setIsRunModalOpen(false)}
                onCancel={handleCancelRun}
            />
        </div>
    );
}
