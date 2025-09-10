/**
 * Fallback UI when quick-run fails
 * Provides alternative actions for users
 */

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';

interface QuickRunFallbackProps {
  onRetry: () => void;
  onSkip: () => void;
  onGoToSandbox: () => void;
  isRetrying?: boolean;
}

export function QuickRunFallback({ onRetry, onSkip, onGoToSandbox, isRetrying = false }: QuickRunFallbackProps) {
  return (
    <Card className="p-4 border-destructive/20 bg-destructive/5">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-medium text-destructive">Quick Test Failed</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The quick evaluation couldn't complete. This might be due to high API load or temporary service issues.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={onRetry}
              disabled={isRetrying}
              className="border-destructive/20 hover:bg-destructive/10"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Retrying...' : 'Try Again'}
            </Button>
            
            <Button size="sm" variant="ghost" onClick={onSkip}>
              Continue Without Test
            </Button>
            
            <Button size="sm" variant="ghost" onClick={onGoToSandbox}>
              <ExternalLink className="h-4 w-4 mr-1" />
              Use Full Sandbox
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground">
            <strong>Alternative:</strong> You can continue refining your evaluation outline and test it later, 
            or use our full Sandbox Studio for advanced testing options.
          </div>
        </div>
      </div>
    </Card>
  );
}
