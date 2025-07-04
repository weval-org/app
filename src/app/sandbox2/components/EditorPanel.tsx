'use client';

import React, { useEffect, useState } from 'react';
import { ActiveBlueprint } from '../hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import Editor, { Monaco } from '@monaco-editor/react';
import blueprintSchema from '@/lib/blueprint-schema.json';

const SCHEMA_URI = 'file:///blueprint-schema.json';

export interface EditorPanelProps {
    activeBlueprint: ActiveBlueprint | null;
    isLoading: boolean;
    isSaving: boolean;
    onSave: (content: string) => Promise<void>;
}

export function EditorPanel({ activeBlueprint, isLoading, isSaving, onSave }: EditorPanelProps) {
    const [content, setContent] = useState<string | undefined>('');

    useEffect(() => {
        if (activeBlueprint) {
            setContent(activeBlueprint.content);
        } else {
            setContent(undefined);
        }
    }, [activeBlueprint]);

    const handleSave = () => {
        if (activeBlueprint && typeof content === 'string') {
            onSave(content);
        }
    };

    async function handleEditorDidMount(editor: any, monaco: Monaco) {
        // Dynamically import the configuration function
        const { configureMonacoYaml } = await import('monaco-yaml');

        configureMonacoYaml(monaco, {
            enableSchemaRequest: true,
            schemas: [
                {
                    uri: SCHEMA_URI,
                    fileMatch: ['*'], // Apply to all files in the editor
                    schema: blueprintSchema as any,
                },
            ],
        });
    }
    
    if (isLoading) {
        return <div className="p-4"><p>Loading blueprint...</p></div>;
    }

    if (!activeBlueprint) {
        return (
            <div className="p-4 h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900/50">
                <div className="text-center">
                    <p className="text-muted-foreground">Select a file to start editing or create a new one.</p>
                </div>
            </div>
        );
    }

    const hasChanges = activeBlueprint.content !== content;

    return (
        <div className="flex flex-col h-full bg-slate-950">
            <div className="flex-shrink-0 p-2 border-b border-slate-800 flex justify-between items-center">
                <span className="font-mono text-sm text-slate-400">{activeBlueprint.path}</span>
                <Button
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                    size="sm"
                >
                    {isSaving ? 'Saving...' : 'Save'}
                    {hasChanges && !isSaving && '*'}
                </Button>
            </div>
            <div className="flex-grow h-full">
                <Editor
                    height="100%"
                    language="yaml"
                    theme="vs-dark"
                    value={content}
                    onChange={(value) => setContent(value)}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        padding: { top: 16 },
                    }}
                />
            </div>
        </div>
    );
} 