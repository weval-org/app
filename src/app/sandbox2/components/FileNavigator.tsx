'use client';

import React from 'react';
import { BlueprintFile } from '../hooks/useWorkspace';
import { Button } from '@/components/ui/button';

export interface FileNavigatorProps {
    files: BlueprintFile[];
    activeFilePath: string | null;
    onSelectFile: (file: BlueprintFile) => void;
    onDeleteFile: (file: BlueprintFile) => void;
    onCreateNew: () => void;
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
    isLoading, 
    isCreating,
    isDeleting,
}: FileNavigatorProps) {
    return (
        <div className="bg-slate-50 dark:bg-slate-900/50 border-r h-full flex flex-col">
            <div className="p-2 border-b">
                <Button 
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={onCreateNew}
                    disabled={isLoading || isCreating}
                >
                    {isCreating ? "Creating..." : "Create New"}
                </Button>
            </div>
            
            <div className="flex-grow overflow-y-auto">
                {isLoading ? (
                    <div className="p-4 text-sm text-muted-foreground">Loading files...</div>
                ) : files.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">No blueprints found.</div>
                ) : (
                    <ul>
                        {files.map(file => (
                            <li key={file.path} className="flex items-center justify-between pr-2 group">
                                <button
                                    className={`flex-grow text-left text-sm pl-4 pr-2 py-2 truncate ${
                                        activeFilePath === file.path
                                            ? 'bg-primary/10 text-primary font-semibold'
                                            : 'hover:bg-accent'
                                    }`}
                                    onClick={() => onSelectFile(file)}
                                >
                                    {file.name}
                                </button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm(`Are you sure you want to delete ${file.name}? This action cannot be undone.`)) {
                                            onDeleteFile(file);
                                        }
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

function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
} 