'use client';

import React from 'react';
import Link from 'next/link';
import { BlueprintFile, PRStatus } from '../hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import CIPLogo from '@/components/icons/CIPLogo';
import { User } from '../hooks/useAuth';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';
import Icon from '@/components/ui/icon';

type WorkspaceState =
  | { type: 'not_logged_in' }
  | { type: 'missing_username' }
  | { type: 'setup_not_started' }
  | { type: 'setup_in_progress' }
  | { type: 'stale_fork', staleForkName: string }
  | { type: 'ready', forkName: string };

const getPrIcon = (status: PRStatus) => {
    if (status.merged) {
      return <Icon name="git-merge" className="w-4 h-4 text-purple-500" />;
    }
    if (status.state === 'open') {
      return <Icon name="git-pull-request" className="w-4 h-4 text-green-500" />;
    }
    return <Icon name="git-pull-request-closed" className="w-4 h-4 text-red-500" />;
};

const getWorkspaceStatusBadge = (state: WorkspaceState): { icon: string; label: string; color: string } | null => {
    switch (state.type) {
        case 'ready':
            return { icon: 'check-circle', label: 'Ready', color: 'text-green-600' };
        case 'setup_not_started':
            return { icon: 'alert-circle', label: 'Setup Required', color: 'text-yellow-600' };
        case 'setup_in_progress':
            return { icon: 'loader-2', label: 'Setting Up...', color: 'text-blue-600' };
        case 'stale_fork':
            return { icon: 'alert-triangle', label: 'Update Required', color: 'text-orange-600' };
        case 'missing_username':
            return { icon: 'x-circle', label: 'Error', color: 'text-red-600' };
        default:
            return null;
    }
};

export interface FileNavigatorProps {
    files: BlueprintFile[];
    activeFilePath: string | null;
    onSelectFile: (file: BlueprintFile) => void;
    onDeleteFile: (file: BlueprintFile) => void;
    onRenameFile: (file: BlueprintFile) => void;
    onDuplicateFile: (file: BlueprintFile) => void;
    onCreateNew: () => void;
    onAutoCreate: () => void;
    isLoading: boolean;
    isSyncingWithGitHub: boolean;
    isCreating: boolean;
    isDeleting: boolean;
    deletingFilePath: string | null;
    user: User | null;
    forkName: string | null;
    workspaceState: WorkspaceState;
    onManageWorkspace: () => void;
    onLogin: () => void;
    isLoggingInWithGitHub: boolean;
    onLogout: () => void;
    onRefresh: () => void;
    showTourBlurb: boolean;
    onTourBlurbClick: () => void;
}

export function FileNavigator({
    files,
    activeFilePath,
    onSelectFile,
    onDeleteFile,
    onRenameFile,
    onDuplicateFile,
    onCreateNew,
    onAutoCreate,
    isLoading,
    isSyncingWithGitHub,
    isCreating,
    isDeleting,
    deletingFilePath,
    user,
    forkName,
    workspaceState,
    onManageWorkspace,
    onLogin,
    isLoggingInWithGitHub,
    onLogout,
    onRefresh,
    showTourBlurb,
    onTourBlurbClick,
}: FileNavigatorProps) {
    const { toast } = useToast();

    const localFiles = files.filter(f => f.isLocal);
    const remoteFiles = files.filter(f => !f.isLocal);

    const renderFileItem = (file: BlueprintFile) => {
        const isActive = file.path === activeFilePath;
        const isFileBeingDeleted = deletingFilePath === file.path;
        const hasOpenPr = file.prStatus?.state === 'open';
        const isEditable = !hasOpenPr;

        return (
            <div
                key={file.path}
                className={`flex items-center text-sm px-3 py-2.5 rounded-md cursor-pointer group transition-colors duration-150 ${
                    isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'hover:bg-primary/5'
                } ${isFileBeingDeleted ? 'opacity-50' : ''}`}
                onClick={() => {
                    if (!isFileBeingDeleted) {
                        onSelectFile(file);
                    }
                }}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex-shrink-0">
                        {file.isLocal ? (
                            <Icon name="file" className="w-4 h-4" />
                        ) : (
                            file.prStatus 
                                ? getPrIcon(file.prStatus) 
                                : <Icon name="github" className="w-4 h-4" />
                        )}
                    </div>
                    <span className="truncate flex-1">{file.name}</span>
                </div>
                
                {!file.isLocal && file.prStatus && (
                    <div className="flex-shrink-0 ml-2">
                        <a 
                            href={file.prStatus.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="opacity-60 hover:opacity-100 px-1.5 py-0.5 rounded text-xs font-mono hover:bg-primary/10 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                        >
                            #{file.prStatus.number}
                        </a>
                    </div>
                )}
                
                <div className="flex-shrink-0 ml-2 transition-opacity">
                    {isFileBeingDeleted ? (
                        <Icon name="loader-2" className="w-4 h-4 animate-spin" />
                    ) : (
                        <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-slate-200 data-[state=open]:bg-slate-200 dark:hover:bg-slate-700 dark:data-[state=open]:bg-slate-700"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Icon name="more-vertical" className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuItem onSelect={() => setTimeout(() => onRenameFile(file), 0)}>
                                    <Icon name="pencil" className="w-3.5 h-3.5 mr-2" />
                                    Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setTimeout(() => onDuplicateFile(file), 0)}>
                                    <Icon name="copy" className="w-3.5 h-3.5 mr-2" />
                                    Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                    onSelect={() => setTimeout(() => onDeleteFile(file), 0)}
                                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                >
                                    <Icon name="trash" className="w-3.5 h-3.5 mr-2" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b">
                <Link href="/" className="flex items-center gap-2.5 mb-3 group">
                    <CIPLogo className="h-8 w-auto text-foreground group-hover:text-primary transition-colors" />
                    <div>
                        <h2 className="font-semibold leading-tight tracking-tight">Sandbox Studio</h2>
                        <p className="text-xs text-muted-foreground leading-tight">Weval</p>
                    </div>
                </Link>
                <p className="text-sm text-muted-foreground leading-snug mb-3">
                    Create, test, and refine evaluation blueprints before proposing them to the public library. Or experiment and enlighten yourself.
                </p>
                
                {user?.isLoggedIn ? (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                                <Icon name="github" className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-grow min-w-0">
                                <div className="font-semibold text-sm truncate">{user.username}</div>
                                {workspaceState.type !== 'not_logged_in' && (() => {
                                    const badge = getWorkspaceStatusBadge(workspaceState);
                                    if (!badge) return null;
                                    return (
                                        <div className="flex items-center gap-1 text-xs">
                                            <Icon
                                                name={badge.icon as any}
                                                className={cn("w-3 h-3", badge.color, badge.icon === 'loader-2' && "animate-spin")}
                                            />
                                            <span className={cn("truncate", badge.color)}>{badge.label}</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                                    <Icon name="more-vertical" className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={onManageWorkspace}>
                                    <Icon name="cog" className="w-4 h-4 mr-2" />
                                    Manage Workspace
                                </DropdownMenuItem>
                                {forkName && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem asChild>
                                            <a
                                                href={`https://github.com/${forkName}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <Icon name="external-link" className="w-4 h-4 mr-2" />
                                                View Fork
                                            </a>
                                        </DropdownMenuItem>
                                    </>
                                )}
                                <DropdownMenuSeparator />
                                 <DropdownMenuItem onClick={onLogout}>
                                    <Icon name="log-out" className="w-4 h-4 mr-2" />
                                    Logout
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ) : (
                    <div className="p-0 pt-3 border-t">
                        <div className="bg-background rounded-lg p-3 text-center">
                            <Icon name="github" className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                            <h4 className="font-semibold text-sm mb-1">Connect your GitHub</h4>
                            <p className="text-xs text-muted-foreground mb-3">
                                Save blueprints, create proposals, and sync your work.
                            </p>
                            <Button 
                                onClick={onLogin} 
                                size="sm"
                                className="w-full" 
                                disabled={isLoggingInWithGitHub}
                                data-tour="login-button"
                            >
                                {isLoggingInWithGitHub ? (
                                    <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Icon name="github" className="w-4 h-4 mr-2" />
                                )}
                                Login with GitHub
                            </Button>
                        </div>
                    </div>
                )}
            </div>
            <div className="p-2 border-b">
                <div className="flex gap-2">
                    <Button 
                        size="sm"
                        className="flex-1"
                        onClick={onCreateNew}
                        disabled={isLoading || isCreating}
                    >
                        <Icon name="plus" className="w-4 h-4 mr-1" />
                        {isCreating ? "Creating..." : "New"}
                    </Button>
                    <Button 
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-exciting text-exciting-foreground border-exciting hover:bg-exciting/90 hover:text-exciting-foreground"
                        onClick={onAutoCreate}
                        disabled={isLoading || isCreating}
                    >
                        <Icon name="wand-2" className="w-4 h-4 mr-1" />
                        Auto-create
                    </Button>
                </div>
            </div>
            
            <div className="flex-grow overflow-y-auto">
                <div className="p-2">
                    <div className="flex items-center justify-between px-2 mb-2">
                        <h3 className="text-sm font-semibold text-muted-foreground">Your Blueprints</h3>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onRefresh}
                            disabled={isSyncingWithGitHub || isLoading}
                            className="h-7 w-7"
                            title="Refresh file list"
                        >
                            {isSyncingWithGitHub || isLoading ? (
                                <Icon name="loader-2" className="h-4 w-4 animate-spin" />
                            ) : (
                                <Icon name="refresh-cw" className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                    
                    {isLoading && files.length === 0 ? (
                        <div className="text-sm text-muted-foreground flex items-center justify-center gap-2 mt-4">
                            <Icon name="loader-2" className="h-4 w-4 animate-spin" />
                            <span>Loading blueprints...</span>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <h4 className="px-2 text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-1">
                                    GitHub
                                </h4>
                                {isSyncingWithGitHub ? (
                                    <div className="space-y-1 px-2">
                                        <Skeleton className="h-10 w-full bg-border" />
                                        <Skeleton className="h-10 w-full bg-border" />
                                    </div>
                                ) : remoteFiles.length > 0 ? (
                                    <div className="space-y-1">
                                        {remoteFiles.map(renderFileItem)}
                                    </div>
                                ) : (
                                    <p className="px-2 py-1 text-sm text-muted-foreground">No GitHub blueprints.</p>
                                )}
                            </div>
                            <div>
                                <h4 className="px-2 text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-1">
                                    Local Scratchpad
                                </h4>
                                {localFiles.length > 0 ? (
                                    <div className="space-y-1">
                                        {localFiles.map(renderFileItem)}
                                    </div>
                                ) : (
                                    <p className="px-2 py-1 text-sm text-muted-foreground">No local blueprints.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {isSyncingWithGitHub && (
                    <div className="p-2 text-xs text-muted-foreground flex items-center justify-center gap-1.5 border-t">
                        <Icon name="loader-2" className="h-3 w-3 animate-spin" />
                        <span>Syncing with GitHub...</span>
                    </div>
                )}
            </div>
        </div>
    );
} 