'use client';

import React, { Component, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  workshopId: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class WorkshopResultsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    console.error('[Workshop Results Error Boundary] Caught error:', error);
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Workshop Results Error Boundary] Error details:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="p-8">
          <div className="flex flex-col items-center text-center">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Error Displaying Results</h2>
            <p className="text-muted-foreground mb-4 max-w-md">
              An error occurred while trying to display the evaluation results. This might be due to
              incompatible data format or missing required fields.
            </p>
            <details className="mb-4 text-left w-full max-w-md">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                Technical Details
              </summary>
              <div className="mt-2 p-3 bg-muted rounded-md overflow-auto max-h-48">
                <p className="text-xs font-mono whitespace-pre-wrap break-words">
                  {this.state.error?.message || 'Unknown error'}
                </p>
                {this.state.error?.stack && (
                  <pre className="text-xs font-mono mt-2 whitespace-pre-wrap break-words text-muted-foreground">
                    {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                  </pre>
                )}
              </div>
            </details>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reload Page
              </Button>
              <Button asChild>
                <a href={`/workshop/${this.props.workshopId}`}>Create New Evaluation</a>
              </Button>
            </div>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
