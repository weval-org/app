'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Icon from '@/components/ui/icon';
import { ErrorReport, copyErrorReportToClipboard } from '../utils/error-reporting';

export interface ErrorReportDialogProps {
  error: ErrorReport | null;
  open: boolean;
  onClose: () => void;
}

export function ErrorReportDialog({ error, open, onClose }: ErrorReportDialogProps) {
  const [copied, setCopied] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);

  if (!error) return null;

  const handleCopy = async () => {
    const success = await copyErrorReportToClipboard(error);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleClose = () => {
    setCopied(false);
    setShowTechnical(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="alert-circle" className="w-5 h-5 text-destructive" />
            Operation Failed
          </DialogTitle>
          <DialogDescription>
            Error ID: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{error.errorId}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* User-friendly message */}
          <Alert>
            <Icon name="info" className="h-4 w-4" />
            <AlertDescription className="mt-2">
              {error.userMessage}
            </AlertDescription>
          </Alert>

          {/* Suggested actions */}
          {error.suggestedActions.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2">What you can try:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                {error.suggestedActions.map((action, idx) => (
                  <li key={idx}>{action}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Technical details (collapsible) */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTechnical(!showTechnical)}
              className="flex items-center gap-2 p-0 h-auto hover:bg-transparent"
            >
              <Icon
                name={showTechnical ? 'chevron-down' : 'chevron-right'}
                className="w-4 h-4"
              />
              <span className="text-sm font-semibold">Technical Details</span>
            </Button>

            {showTechnical && (
              <div className="mt-2 p-3 bg-muted rounded-md">
                <p className="text-xs font-mono text-muted-foreground mb-2">
                  {error.technicalMessage}
                </p>

                {error.context.operation && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold">Operation:</span> {error.context.operation}
                  </p>
                )}

                {error.context.activeBlueprint && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Active Blueprint:</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {error.context.activeBlueprint.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {error.context.activeBlueprint.isLocal ? 'Local' : 'GitHub'}
                      {error.context.activeBlueprint.branchName && ` (${error.context.activeBlueprint.branchName})`}
                    </p>
                  </div>
                )}

                {error.context.originalError && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Stack Trace:</p>
                    <pre className="text-xs text-muted-foreground overflow-x-auto">
                      {error.context.originalError.stack || error.context.originalError.toString()}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Help text */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
            <p className="font-semibold mb-1">Need help?</p>
            <p>
              Copy the full error report using the button below and email it to{' '}
              <a href="mailto:support@weval.ai" className="underline hover:text-foreground">
                support@weval.ai
              </a>
              . The error ID helps us diagnose the issue quickly.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 justify-between sm:justify-between">
          <Button
            variant="outline"
            onClick={handleCopy}
            className="flex items-center gap-2"
          >
            <Icon name={copied ? 'check' : 'copy'} className="w-4 h-4" />
            {copied ? 'Copied!' : 'Copy Full Error Report'}
          </Button>

          <Button onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
