import React, { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';

interface StaleForkWarningProps {
  staleForkName: string;
  onReset: () => void;
}

export function StaleForkWarning({ staleForkName, onReset }: StaleForkWarningProps) {
  const [showResetDialog, setShowResetDialog] = useState(false);

  return (
    <>
      <Alert variant="destructive" className="mb-4">
        <Icon name="alert-triangle" className="h-4 w-4" />
        <AlertTitle>Workspace Update Required</AlertTitle>
        <AlertDescription>
          Your workspace is using an outdated fork configuration (<code className="bg-muted px-1 py-0.5 rounded">{staleForkName}</code>).
          <br />
          <span className="text-sm">
            The system now uses <code className="bg-muted px-1 py-0.5 rounded">weval-configs</code> to avoid naming conflicts.
          </span>
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResetDialog(true)}
              className="bg-background"
            >
              <Icon name="refresh-cw" className="mr-2 h-3 w-3" />
              Reset Workspace
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Workspace?</DialogTitle>
            <DialogDescription>
              This will clear your local workspace configuration and cache. You will need to set up your workspace again.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <div className="text-sm">
              <p className="font-semibold text-yellow-600 dark:text-yellow-500 mb-2">
                ⚠️ What happens when you reset:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Your local workspace settings will be cleared</li>
                <li>Cached blueprint data will be removed</li>
                <li>You'll need to complete workspace setup again</li>
              </ul>
            </div>

            <div className="text-sm">
              <p className="font-semibold text-green-600 dark:text-green-500 mb-2">
                ✅ What is preserved:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Your existing GitHub fork (<code className="text-xs">{staleForkName}</code>) remains unchanged</li>
                <li>All your blueprints and branches on GitHub are safe</li>
                <li>Open pull requests are not affected</li>
              </ul>
            </div>

            <div className="bg-muted p-3 rounded-md">
              <p className="text-xs text-muted-foreground">
                <strong>Note:</strong> After resetting, you can either continue using your existing fork or create a new one with the updated name (<code>weval-configs</code>).
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowResetDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onReset();
                setShowResetDialog(false);
              }}
            >
              <Icon name="refresh-cw" className="mr-2 h-4 w-4" />
              Reset Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
