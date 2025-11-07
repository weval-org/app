import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Icon from '@/components/ui/icon';

type WorkspaceState =
  | { type: 'not_logged_in' }
  | { type: 'missing_username' }
  | { type: 'setup_not_started' }
  | { type: 'setup_in_progress' }
  | { type: 'stale_fork', staleForkName: string }
  | { type: 'ready', forkName: string };

interface WorkspaceManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceState: WorkspaceState;
  forkName: string | null;
  onSetupWorkspace: () => Promise<void>;
  onResetWorkspace: () => void;
  isSettingUp: boolean;
}

export function WorkspaceManagementModal({
  isOpen,
  onClose,
  workspaceState,
  forkName,
  onSetupWorkspace,
  onResetWorkspace,
  isSettingUp,
}: WorkspaceManagementModalProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const getStatusInfo = () => {
    switch (workspaceState.type) {
      case 'ready':
        return {
          icon: 'check-circle' as const,
          color: 'text-green-600',
          title: 'Workspace Ready',
          description: `Your workspace is set up and ready to use. Fork: ${workspaceState.forkName}`,
        };
      case 'setup_not_started':
        return {
          icon: 'alert-circle' as const,
          color: 'text-yellow-600',
          title: 'Setup Required',
          description: 'Your workspace needs to be initialized before you can save blueprints to GitHub.',
        };
      case 'setup_in_progress':
        return {
          icon: 'loader-2' as const,
          color: 'text-blue-600',
          title: 'Setting Up',
          description: 'Your workspace is being set up. This may take a moment...',
        };
      case 'stale_fork':
        return {
          icon: 'alert-triangle' as const,
          color: 'text-orange-600',
          title: 'Update Required',
          description: `Your workspace uses an outdated fork (${workspaceState.staleForkName}). Reset to use the new format.`,
        };
      case 'missing_username':
        return {
          icon: 'x-circle' as const,
          color: 'text-red-600',
          title: 'Profile Error',
          description: 'Unable to retrieve your GitHub username. Try logging out and back in.',
        };
      default:
        return null;
    }
  };

  const statusInfo = getStatusInfo();
  const needsSetup = workspaceState.type === 'setup_not_started' || workspaceState.type === 'stale_fork';

  if (showResetConfirm) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Workspace?</DialogTitle>
            <DialogDescription>
              This will clear your local workspace configuration. You'll need to set up again.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <Alert variant="destructive">
              <Icon name="alert-triangle" className="h-4 w-4" />
              <AlertDescription>
                <strong>What will be reset:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>Local workspace settings</li>
                  <li>Cached blueprint data</li>
                  <li>Fork configuration</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Alert>
              <Icon name="info" className="h-4 w-4" />
              <AlertDescription>
                <strong>What is preserved:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>Your GitHub fork{forkName && ` (${forkName})`}</li>
                  <li>All blueprints and branches on GitHub</li>
                  <li>Open pull requests</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowResetConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onResetWorkspace();
                setShowResetConfirm(false);
                onClose();
              }}
            >
              <Icon name="refresh-cw" className="mr-2 h-4 w-4" />
              Reset Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workspace Management</DialogTitle>
          <DialogDescription>
            Manage your GitHub workspace configuration and fork settings.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Current Status */}
          {statusInfo && (
            <Alert>
              <Icon name={statusInfo.icon} className={`h-4 w-4 ${statusInfo.color} ${statusInfo.icon === 'loader-2' ? 'animate-spin' : ''}`} />
              <AlertDescription>
                <strong className={statusInfo.color}>{statusInfo.title}</strong>
                <p className="text-sm text-muted-foreground mt-1">{statusInfo.description}</p>
              </AlertDescription>
            </Alert>
          )}

          {/* Setup Info */}
          {needsSetup && (
            <div className="bg-muted p-4 rounded-md space-y-2">
              <p className="text-sm font-semibold">What happens during setup:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Creates a fork of <code className="text-xs bg-background px-1 py-0.5 rounded">weval-org/configs</code></li>
                <li>Fork will be named <code className="text-xs bg-background px-1 py-0.5 rounded">weval-configs</code></li>
                <li>Initializes your blueprint directory</li>
                <li>Enables saving blueprints to GitHub</li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {/* Reset Button (always available except during setup) */}
          {workspaceState.type !== 'setup_in_progress' && workspaceState.type !== 'not_logged_in' && (
            <Button
              variant="outline"
              onClick={() => setShowResetConfirm(true)}
              className="sm:mr-auto"
            >
              <Icon name="refresh-cw" className="mr-2 h-4 w-4" />
              Reset Workspace
            </Button>
          )}

          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>

          {/* Setup Button (only when setup needed) */}
          {needsSetup && (
            <Button onClick={onSetupWorkspace} disabled={isSettingUp}>
              {isSettingUp ? (
                <>
                  <Icon name="loader-2" className="mr-2 h-4 w-4 animate-spin" />
                  Setting Up...
                </>
              ) : (
                <>
                  <Icon name="arrow-right" className="mr-2 h-4 w-4" />
                  Set Up Workspace
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
