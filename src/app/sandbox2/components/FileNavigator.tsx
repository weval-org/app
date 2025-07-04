'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BlueprintFile } from '../hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import CIPLogo from '@/components/icons/CIPLogo';

const TrashIcon = dynamic(() => import('lucide-react').then(mod => mod.Trash), {
    ssr: false,
    loading: () => <Skeleton className="h-4 w-4" />,
});
const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2), { ssr: false });
const Wand = dynamic(() => import('lucide-react').then(mod => mod.Wand2));
const BookOpenCheck = dynamic(() => import('lucide-react').then(mod => mod.BookOpenCheck));
const Github = dynamic(() => import('lucide-react').then(mod => mod.Github), { ssr: false });

export interface FileNavigatorProps {
    files: BlueprintFile[];
    activeFilePath: string | null;
    onSelectFile: (file: BlueprintFile) => void;
    onDeleteFile: (file: BlueprintFile) => void;
    onCreateNew: () => void;
    onAutoCreate: () => void;
    onAutoWiki: () => void;
    isLoading: boolean;
    isCreating: boolean;
    isDeleting: boolean;
}

export function FileNavigator({ 
    files, 
    activeFilePath, 
    onSelectFile, 
    onDeleteFile,
    onCreateNew, 
    onAutoCreate,
    onAutoWiki,
    isLoading, 
    isCreating,
    isDeleting,
}: FileNavigatorProps) {
    const { toast } = useToast();

    const handleDeleteClick = (file: BlueprintFile) => {
        toast({
            variant: "destructive",
            title: `Delete ${file.name}?`,
            description: "This action cannot be undone.",
            action: <ToastAction altText="Confirm delete" onClick={() => onDeleteFile(file)}>Confirm</ToastAction>,
        });
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b bg-muted/20">
                <Link href="/" className="flex items-center gap-2.5 mb-3 group">
                    <CIPLogo className="h-8 w-auto text-foreground group-hover:text-primary transition-colors" />
                    <div>
                        <h2 className="font-semibold leading-tight tracking-tight">Sandbox Studio</h2>
                        <p className="text-xs text-muted-foreground leading-tight">Weval</p>
                    </div>
                </Link>
                <p className="text-sm text-muted-foreground leading-snug">
                    Create, test, and refine evaluation blueprints before proposing them to the public library. Or experiment and enlighten yourself.
                </p>
            </div>
            <div className="p-2 border-b">
                <Button 
                    size="sm"
                    className="w-full mb-2"
                    onClick={onCreateNew}
                    disabled={isLoading || isCreating}
                >
                    {isCreating ? "Creating..." : "Create New Blank Blueprint"}
                </Button>
                <div className="flex items-center gap-2">
                     <Button 
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={onAutoCreate}
                        disabled={isLoading || isCreating}
                    >
                        <Wand className="w-4 h-4 mr-2" />
                        Auto-Create
                    </Button>
                    <Button 
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={onAutoWiki}
                        disabled={isLoading || isCreating}
                    >
                        <BookOpenCheck className="w-4 h-4 mr-2" />
                        Auto-Wiki
                    </Button>
                </div>
            </div>
            
            <div className="flex-grow overflow-y-auto">
                {isLoading ? (
                    <div className="p-4 text-sm text-muted-foreground flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading blueprints...</span>
                    </div>
                ) : files.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">No blueprints found.</div>
                ) : (
                    <ul>
                        {files.map(file => (
                            <li key={file.path} 
                                onClick={() => onSelectFile(file)}
                                className={`flex items-center justify-between mx-2 my-1 rounded-md pr-2 group cursor-pointer ${
                                    activeFilePath === file.path
                                        ? 'bg-primary/10 text-primary font-semibold'
                                        : 'hover:bg-accent'
                                }`}
                            >
                                <div className="flex-grow text-left text-sm pl-2 py-2 truncate flex items-center gap-2">
                                    <span className="truncate">{file.name}</span>
                                    {file.isLocal ? (
                                        <span className="text-xs font-normal text-blue-500 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
                                            Local
                                        </span>
                                    ) : (
                                        <Github className="h-3 w-3 text-muted-foreground" />
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteClick(file);
                                    }}
                                    disabled={isDeleting || isLoading}
                                    aria-label={`Delete file ${file.name}`}
                                >
                                    <TrashIcon className="h-4 w-4" />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
} 