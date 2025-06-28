'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { StatusResponse } from './types';
import { Progress } from '@/components/ui/progress';

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));
const CheckCircle = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle));
const XCircle = dynamic(() => import('lucide-react').then(mod => mod.XCircle));
const ExternalLink = dynamic(() => import('lucide-react').then(mod => mod.ExternalLink));

interface RunStatusModalProps {
  isOpen: boolean;
  status: StatusResponse;
  isRunning: boolean;
  onClose: () => void;
  onCancel: () => void;
}

export function RunStatusModal({ isOpen, status, isRunning, onClose, onCancel }: RunStatusModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isRunning) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Evaluation Status</DialogTitle>
          <DialogDescription>{status.message || '...'}</DialogDescription>
        </DialogHeader>
        <div className="py-4 text-center space-y-4">
          {status.status === 'complete' && <CheckCircle className="w-16 h-16 text-green-500 mx-auto animate-in fade-in" />}
          {status.status === 'error' && <XCircle className="w-16 h-16 text-destructive mx-auto animate-in fade-in" />}
          {(status.status === 'pending' || status.status === 'generating_responses' || status.status === 'evaluating') && (
            <Loader2 className="w-16 h-16 text-primary mx-auto animate-spin" />
          )}
           {status.progress && (status.status === 'generating_responses' || status.status === 'evaluating') && (
            <div className="w-full max-w-sm mx-auto text-left">
              <Progress value={(status.progress.completed / status.progress.total) * 100} className="mb-2" />
              <p className="text-sm text-muted-foreground text-center">
                Processing: {status.progress.completed} of {status.progress.total} tasks
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <div>
            {isRunning && (
              <Button variant="destructive" onClick={onCancel}>Cancel Run</Button>
            )}
          </div>
          <div>
            {status.status === 'complete' && status.resultUrl && (
              <Link href={status.resultUrl} target="_blank" rel="noopener noreferrer" passHref>
                <Button onClick={onClose}><ExternalLink className="w-4 h-4 mr-2" />View Results</Button>
              </Link>
            )}
            {(status.status === 'complete' || status.status === 'error') && (
              <Button variant="secondary" onClick={onClose} className="ml-2">Close</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 