'use client';

import React, { useState, useEffect } from 'react';
import * as yaml from 'js-yaml';
import { useDebouncedCallback } from 'use-debounce';
import { ActiveBlueprint } from '../hooks/useWorkspace';
import { ComparisonConfig, PromptConfig } from '@/cli/types/cli_types';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';
import { Skeleton } from '@/components/ui/skeleton';
import { GlobalConfigCard } from './GlobalConfigCard';
import { PromptCard } from './PromptCard';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import { produce } from 'immer';

const Plus = dynamic(() => import('lucide-react').then(mod => mod.Plus));

interface FormPanelProps {
    parsedBlueprint: ComparisonConfig | null;
    onUpdate: (newConfig: ComparisonConfig) => void;
    isLoading: boolean;
    isSaving: boolean;
    isEditable: boolean;
}

export function FormPanel({ parsedBlueprint, onUpdate, isLoading, isSaving, isEditable }: FormPanelProps) {
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
        <div className="p-3 space-y-3 bg-background">
            <GlobalConfigCard 
                blueprint={parsedBlueprint}
                onUpdate={handleUpdate}
                isEditable={isEditable}
            />
            <div className="space-y-3">
                {parsedBlueprint.prompts.map((prompt, index) => (
                    <PromptCard
                        key={index}
                        prompt={prompt}
                        onUpdate={(p) => handleUpdatePrompt(index, p)}
                        onRemove={() => handleRemovePrompt(index)}
                        isEditable={isEditable}
                    />
                ))}
            </div>
             {isEditable && (
                <div className="text-center pt-2">
                    <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleAddPrompt}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Prompt
                    </Button>
                </div>
            )}
        </div>
    );
} 