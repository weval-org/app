'use client';

import React, { useState, useEffect } from 'react';
import * as yaml from 'js-yaml';
import { useDebouncedCallback } from 'use-debounce';
import { ActiveBlueprint } from '../hooks/useWorkspace';
import { ComparisonConfig, PointDefinition, PromptConfig } from '@/cli/types/cli_types';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GlobalConfigCard } from './GlobalConfigCard';
import { PromptCard } from './PromptCard';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import { produce } from 'immer';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { AutoExtendModal } from './AutoExtendModal';
import { useToast } from '@/components/ui/use-toast';
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

const Plus = dynamic(() => import('lucide-react').then(mod => mod.Plus));
const Sparkles = dynamic(() => import('lucide-react').then(mod => mod.Sparkles));
const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));
const HelpCircle = dynamic(() => import('lucide-react').then(mod => mod.HelpCircle));
const PlayCircle = dynamic(() => import('lucide-react').then(mod => mod.PlayCircle));
const X = dynamic(() => import('lucide-react').then(mod => mod.X));

interface FormPanelProps {
    parsedBlueprint: ComparisonConfig | null;
    onUpdate: (newConfig: ComparisonConfig) => void;
    isLoading: boolean;
    isSaving: boolean;
    isEditable: boolean;
    onShowTour?: () => void;
}

const GUIDE_DISMISSED_KEY = 'sandbox_guide_dismissed';

export function FormPanel({ parsedBlueprint, onUpdate, isLoading, isSaving, isEditable, onShowTour }: FormPanelProps) {
    const [isAutoExtendModalOpen, setIsAutoExtendModalOpen] = useState(false);
    const [isExtending, setIsExtending] = useState(false);
    const [showGuide, setShowGuide] = useState(true);
    const [isAdvancedMode, setIsAdvancedMode] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (!parsedBlueprint) return;

        const hasGlobalAdvancedOptions = !!parsedBlueprint.description || !!parsedBlueprint.system || !!parsedBlueprint.systems;
        const hasAlternativePaths = parsedBlueprint.prompts.some(p => 
            p.points && p.points.some(point => Array.isArray(point))
        );
        const hasPromptLevelAdvancedFeatures = parsedBlueprint.prompts.some(p => 
            p.description || p.citation
        );

        if (hasGlobalAdvancedOptions || hasAlternativePaths || hasPromptLevelAdvancedFeatures) {
            setIsAdvancedMode(true);
        } else {
            setIsAdvancedMode(false);
        }
    }, [parsedBlueprint]);

    // Load guide visibility state from localStorage on mount
    useEffect(() => {
        try {
            const dismissed = localStorage.getItem(GUIDE_DISMISSED_KEY);
            setShowGuide(dismissed !== 'true');
        } catch (e) {
            // If localStorage fails, default to showing the guide
            setShowGuide(true);
        }
    }, []);

    const dismissGuide = () => {
        setShowGuide(false);
        try {
            localStorage.setItem(GUIDE_DISMISSED_KEY, 'true');
        } catch (e) {
            // Silently fail if localStorage is unavailable
            console.warn('Could not save guide dismissed state to localStorage');
        }
    };

    const handleUpdate = (newConfig: ComparisonConfig) => {
        onUpdate(newConfig);
    };

    const handleUpdatePrompt = (index: number, updatedPrompt: PromptConfig) => {
        if (!parsedBlueprint) return;
        const nextState = produce(parsedBlueprint, draft => {
            draft.prompts[index] = updatedPrompt;
        });
        onUpdate(nextState);
    };

    const handleAddPrompt = () => {
        if (!parsedBlueprint) return;
        const newPrompt: PromptConfig = {
            id: `prompt-${Date.now()}`,
            messages: [{ role: 'user', content: '' }],
        };
        const nextState = produce(parsedBlueprint, draft => {
            draft.prompts.push(newPrompt);
        });
        onUpdate(nextState);
    };

    const handleRemovePrompt = (index: number) => {
        if (!parsedBlueprint) return;
        const nextState = produce(parsedBlueprint, draft => {
            draft.prompts.splice(index, 1);
        });
        onUpdate(nextState);
    };

    const handleDuplicatePrompt = (index: number) => {
        if (!parsedBlueprint) return;
        const originalPrompt = parsedBlueprint.prompts[index];
        
        // Deep copy and assign a new unique ID
        const duplicatedPrompt = JSON.parse(JSON.stringify(originalPrompt));
        duplicatedPrompt.id = `prompt-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const nextState = produce(parsedBlueprint, draft => {
            draft.prompts.splice(index + 1, 0, duplicatedPrompt);
        });
        onUpdate(nextState);
    };

    const stringifyPoint = (p: PointDefinition) => JSON.stringify(p);

    const handleAutoExtend = async (guidance: string) => {
        if (!parsedBlueprint) return;
        setIsExtending(true);
        // Don't close the modal - it will handle its own loading state

        try {
            const existingBlueprintContent = yaml.dump(parsedBlueprint);
            const response = await fetch('/api/sandbox/auto-extend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ existingBlueprintContent, guidance }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to extend blueprint.');
            }

            const newBlueprint = parseAndNormalizeBlueprint(data.yaml, 'yaml');

            // --- Validation Logic ---
            const existingPromptsMap = new Map(parsedBlueprint.prompts.map(p => [p.id, p]));
            
            for (const newPrompt of newBlueprint.prompts) {
                if (existingPromptsMap.has(newPrompt.id)) {
                    const existingPrompt = existingPromptsMap.get(newPrompt.id)!;
                    
                    // It must not change the core prompt text
                    if (JSON.stringify(newPrompt.messages) !== JSON.stringify(existingPrompt.messages)) {
                         throw new Error(`Auto-extend failed validation: It tried to modify the text of an existing prompt (ID: ${newPrompt.id}).`);
                    }

                    // 'points' must be additive
                    const existingPoints = new Set((existingPrompt.points || []).map(stringifyPoint));
                    const newPoints = newPrompt.points || [];
                    for(const p of newPoints) {
                        if (!existingPoints.has(stringifyPoint(p))) {
                            // This is a new point, which is allowed
                        } else {
                            existingPoints.delete(stringifyPoint(p)); // Remove found point
                        }
                    }
                    if (existingPoints.size > 0) {
                        throw new Error(`Auto-extend failed validation: It tried to remove a 'should' criteria from prompt ID ${newPrompt.id}.`);
                    }
                }
            }
            
            toast({ title: 'Blueprint Extended!', description: 'The AI has added to your blueprint.' });
            onUpdate(newBlueprint);
            setIsAutoExtendModalOpen(false); // Close modal on success

        } catch (error: any) {
            console.error('Auto-extend error:', error);
            toast({ variant: 'destructive', title: 'Extension Failed', description: error.message, duration: 8000 });
        } finally {
            setIsExtending(false);
        }
    };

    if (isLoading) {
        return (
            <div className="p-3 space-y-3 h-full bg-background">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    if (!parsedBlueprint) {
        return (
            <div className="p-3 h-full bg-background flex items-center justify-center text-muted-foreground">
                <p>{'Select a blueprint to begin or fix the errors in the YAML.'}</p>
            </div>
        );
    }

    return (
        <div className="p-3 space-y-3 bg-background relative h-full">
            <div className="flex items-center justify-between pb-2">
                <div></div>
                <div className="flex items-center space-x-2">
                    <Switch id="advanced-mode" checked={isAdvancedMode} onCheckedChange={setIsAdvancedMode} disabled={!isEditable} />
                    <Label htmlFor="advanced-mode" className="text-sm font-medium">Advanced Options</Label>
                </div>
            </div>

            {showGuide && (
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <PlayCircle className="w-5 h-5 text-primary" />
                                Welcome to Sandbox Studio
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={dismissGuide}
                                className="h-6 w-6 rounded-full hover:bg-primary/10"
                                title="Dismiss guide"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </CardTitle>
                        <CardDescription>
                            Create and test AI model prompts with our blueprint system
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="text-sm text-muted-foreground space-y-2">
                            <p><strong>1. Configure your blueprint:</strong> Set the title, description, and models to test</p>
                            <p><strong>2. Add prompts:</strong> Create prompts with evaluation criteria (what counts as a good response?)</p>
                            <p><strong>3. Run evaluation:</strong> Test your prompts across multiple AI models and see detailed comparisons</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <GlobalConfigCard 
                blueprint={parsedBlueprint}
                onUpdate={handleUpdate}
                isEditable={isEditable}
                isAdvancedMode={isAdvancedMode}
            />
            <div className="space-y-3">
                {parsedBlueprint.prompts.map((prompt, index) => (
                    <PromptCard
                        key={index}
                        prompt={prompt}
                        onUpdate={(p) => handleUpdatePrompt(index, p)}
                        onRemove={() => handleRemovePrompt(index)}
                        onDuplicate={() => handleDuplicatePrompt(index)}
                        isEditable={isEditable}
                        isAdvancedMode={isAdvancedMode}
                    />
                ))}
            </div>
            <div className="flex items-center justify-center gap-4 pt-2 pb-12">
                <Button 
                    variant="outline" 
                    disabled={!isEditable}
                    size={parsedBlueprint.prompts && parsedBlueprint.prompts.length > 0 ? "sm" : "lg"}
                    onClick={handleAddPrompt}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    {parsedBlueprint.prompts && parsedBlueprint.prompts.length > 0 ? "Add Prompt" : "Add your first prompt"}
                </Button>
                {parsedBlueprint.prompts && parsedBlueprint.prompts.length > 0 && (
                    <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => setIsAutoExtendModalOpen(true)}
                        disabled={isExtending}
                        className="bg-exciting text-exciting-foreground border-exciting hover:bg-exciting/90 hover:text-exciting-foreground"
                    >
                        <Sparkles className="h-4 w-4 mr-2" />
                            {isExtending ? 'Extending...' : 'Auto-extend'}
                    </Button>
                )}
            </div>

            <AutoExtendModal
                isOpen={isAutoExtendModalOpen}
                onOpenChange={setIsAutoExtendModalOpen}
                onConfirm={handleAutoExtend}
                isSubmitting={isExtending}
            />
        </div>
    );
} 