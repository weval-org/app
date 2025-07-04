'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import CodeMirror from '@uiw/react-codemirror';
import { yaml as yamlLanguage } from '@codemirror/lang-yaml';
import { githubDark, githubLight } from '@uiw/codemirror-theme-github';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedCallback } from 'use-debounce';

const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));

interface EditorPanelProps {
    rawContent: string | null;
    onChange: (content: string) => void;
    isLoading: boolean;
    isSaving: boolean;
    readOnly?: boolean;
    yamlError?: string | null;
}

export function EditorPanel({ rawContent, onChange, isLoading, isSaving, readOnly = false, yamlError }: EditorPanelProps) {
    const [content, setContent] = useState('');
    const { resolvedTheme } = useTheme();

    useEffect(() => {
        // Prevent updates from parent if content is the same, avoids cursor jumping
        if (rawContent !== null && rawContent !== content) {
            setContent(rawContent);
        }
    }, [rawContent]);

    const debouncedUpdate = useDebouncedCallback((value: string) => {
        onChange(value);
    }, 300);

    const handleChange = (value: string) => {
        setContent(value);
        debouncedUpdate(value);
    }

    if (isLoading && rawContent === null) {
        return (
            <div className="p-4 space-y-2">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/2" />
                 <br />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
            </div>
        )
    }

    return (
        <div className="h-full w-full bg-background p-4">
            <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border">
                {isSaving && (
                    <div className="absolute top-2 right-4 z-10 text-xs text-muted-foreground">Saving...</div>
                )}
                <div className="relative flex-grow">
                    <div className="absolute inset-0">
                        <CodeMirror
                            value={content}
                            height="100%"
                            extensions={[yamlLanguage()]}
                            onChange={handleChange}
                            theme={resolvedTheme === 'dark' ? githubDark : githubLight}
                            className="h-full w-full"
                            readOnly={readOnly}
                            basicSetup={{
                                foldGutter: true,
                                dropCursor: true,
                                allowMultipleSelections: true,
                                indentOnInput: true,
                            }}
                        />
                    </div>
                </div>
                {yamlError && (
                    <div className="flex flex-shrink-0 items-center gap-2 bg-destructive p-2 text-xs font-mono text-destructive-foreground">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        <p className="truncate">YAML Error: {yamlError}</p>
                    </div>
                )}
            </div>
        </div>
    );
} 