import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2), { ssr: false });

interface WorkspaceSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isConfirming: boolean;
}

export function WorkspaceSetupModal({ isOpen, onClose, onConfirm, isConfirming }: WorkspaceSetupModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workspace Setup Required</DialogTitle>
          <DialogDescription>
            To save your blueprints and propose them to the public library, this application needs to create a fork of the 
            <a href="https://github.com/weval-org/configs" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline mx-1">
              weval-org/configs
            </a> 
            repository on your behalf.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            This will create a new repository under your GitHub account named <code className="bg-muted px-1 py-0.5 rounded">weval-configs</code>. 
            You will be able to manage and delete this repository just like any other.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isConfirming}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Fork...
              </>
            ) : (
              'Continue'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 