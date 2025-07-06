'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { SandboxRunStatus } from '../hooks/useWorkspace';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const CheckCircle2 = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle2), { ssr: false });
const XCircle = dynamic(() => import('lucide-react').then(mod => mod.XCircle), { ssr: false });
const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2), { ssr: false });


interface RunStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: SandboxRunStatus;
}

export function RunStatusModal({ isOpen, onClose, status }: RunStatusModalProps) {
    const isRunning = ['pending', 'generating_responses', 'evaluating', 'saving'].includes(status.status);
    const inProgressStatuses = ['pending', 'generating_responses', 'evaluating', 'saving'];

    const getStatusDisplayName = (s: string) => {
        return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Evaluation Status</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    {inProgressStatuses.includes(status.status) && (
                         <div>
                            <div className="flex items-center space-x-2 mb-2">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                <div>
                                    <p><strong>Status:</strong> {getStatusDisplayName(status.status)}...</p>
                                    {status.message && <p className="text-sm text-muted-foreground">{status.message}</p>}
                                </div>
                            </div>
                            {status.progress && (
                                <>
                                    <Progress value={(status.progress.completed / status.progress.total) * 100} className="w-full" />
                                    <p className="text-sm text-muted-foreground mt-1 text-center">
                                        {status.progress.completed} / {status.progress.total} steps completed
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                    {status.status === 'complete' && (
                        <div className="text-center p-4 bg-green-100 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800">
                            <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto mb-2" />
                            <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">Run Complete!</h3>
                            {status.resultUrl && (
                                <Button asChild variant="default" className="mt-4">
                                    <Link href={status.resultUrl} target="_blank">View Results</Link>
                                </Button>
                            )}
                        </div>
                    )}
                    {status.status === 'error' && (
                         <div className="text-center p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                            <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
                            <h3 className="text-lg font-semibold text-destructive">An Error Occurred</h3>
                            <p className="text-sm text-muted-foreground mt-2">{status.message || 'An unknown error occurred.'}</p>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button onClick={onClose} variant="outline" disabled={isRunning}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 