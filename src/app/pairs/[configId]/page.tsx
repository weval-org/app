'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import Icon from '@/components/ui/icon';
import { PairwiseComparisonForm } from '../PairwiseComparisonForm';

interface GenerationStatus {
  status: 'pending' | 'generating' | 'complete' | 'error';
  message: string;
  timestamp: string;
  tasksGenerated?: number;
  totalTasksInQueue?: number;
  error?: string;
}

interface CheckStatusResponse {
  hasTasks: boolean;
  taskCount: number;
  generationStatus: GenerationStatus | null;
}

const ConfigPairsPage = () => {
  const params = useParams();
  const configId = params.configId as string;
  const [pageState, setPageState] = useState<'loading' | 'no-pairs' | 'generating' | 'ready' | 'error'>('loading');
  const [statusData, setStatusData] = useState<CheckStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/pairs/config/${configId}/check-status`);
      if (!response.ok) {
        throw new Error('Failed to check status');
      }
      const data: CheckStatusResponse = await response.json();
      setStatusData(data);

      if (data.hasTasks) {
        setPageState('ready');
      } else if (data.generationStatus) {
        const status = data.generationStatus.status;
        if (status === 'generating' || status === 'pending') {
          // Check if status is stale (more than 2 minutes old)
          const statusAge = Date.now() - new Date(data.generationStatus.timestamp).getTime();
          const twoMinutes = 2 * 60 * 1000;
          if (statusAge > twoMinutes && status === 'pending') {
            setPageState('error');
            setErrorMessage('Generation appears to be stuck. The job may have failed to start.');
          } else {
            setPageState('generating');
          }
        } else if (status === 'error') {
          setPageState('error');
          setErrorMessage(data.generationStatus.error || data.generationStatus.message);
        } else {
          setPageState('no-pairs');
        }
      } else {
        setPageState('no-pairs');
      }
    } catch (error: any) {
      setPageState('error');
      setErrorMessage(error.message || 'Failed to check status');
    }
  }, [configId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (pageState === 'generating') {
      const interval = setInterval(checkStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [pageState, checkStatus]);

  const startGeneration = async () => {
    try {
      setPageState('loading');
      const response = await fetch(`/api/pairs/config/${configId}/start-generation`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to start generation');
      }
      toast({
        title: "Generation Started",
        description: "Generating comparison pairs for this config...",
      });
      setPageState('generating');
    } catch (error: any) {
      setPageState('error');
      setErrorMessage(error.message || 'Failed to start generation');
      toast({
        variant: 'destructive',
        title: "Generation Failed",
        description: error.message || 'Please try again.',
      });
    }
  };

  return (
    <div className="container mx-auto py-12 px-4">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-primary mb-4">Help Us Evaluate AI</h1>
        {!showDetails && (
          <button
            onClick={() => setShowDetails(true)}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Learn more about this project
          </button>
        )}
        {showDetails && (
          <div className="mt-4 max-w-2xl mx-auto space-y-3">
            <p className="text-lg text-muted-foreground">
              Help improve AI evaluation by choosing the better response between two models for a given prompt. Your feedback provides valuable data for our research.
            </p>
            <p className="text-sm text-muted-foreground">
              Your contributions are anonymous and help build an open dataset for AI research. Responses are randomly positioned to reduce bias.
            </p>
            <p className="text-sm text-muted-foreground">
              Weval is a project by the <a href="https://www.cip.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Collective Intelligence Project</a>.
            </p>
            <button
              onClick={() => setShowDetails(false)}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Show less
            </button>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto">
        {pageState === 'loading' && (
          <Card className="shadow-2xl">
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <Icon name="loader-2" className="w-12 h-12 animate-spin mb-4" aria-hidden="true" />
                <p>Checking status...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {pageState === 'no-pairs' && (
          <Card className="shadow-2xl">
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center space-y-6">
                <Icon name="server" className="w-16 h-16 text-muted-foreground" aria-hidden="true" />
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-semibold">No Pairs Available</h2>
                  <p className="text-muted-foreground">
                    Comparison pairs haven't been generated for this config yet.
                  </p>
                </div>
                <Button size="lg" onClick={startGeneration}>
                  <Icon name="play-circle" className="mr-2 h-5 w-5" aria-hidden="true" />
                  Generate Pairs for This Config
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {pageState === 'generating' && statusData?.generationStatus && (
          <Card className="shadow-2xl">
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center space-y-6">
                <Icon name="loader-2" className="w-16 h-16 animate-spin text-primary" aria-hidden="true" />
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-semibold">Generating Pairs...</h2>
                  <p className="text-muted-foreground">{statusData.generationStatus.message}</p>
                  {statusData.generationStatus.tasksGenerated !== undefined && (
                    <p className="text-sm text-muted-foreground">
                      Generated {statusData.generationStatus.tasksGenerated} tasks
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {pageState === 'error' && (
          <Card className="shadow-2xl">
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center space-y-6">
                <Icon name="alert-circle" className="w-16 h-16 text-red-500" aria-hidden="true" />
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-semibold text-red-500">Error</h2>
                  <p className="text-muted-foreground">{errorMessage}</p>
                </div>
                <div className="flex gap-4">
                  <Button variant="outline" onClick={checkStatus}>
                    <Icon name="refresh-cw" className="mr-2 h-4 w-4" aria-hidden="true" />
                    Check Status
                  </Button>
                  <Button onClick={startGeneration}>
                    <Icon name="undo" className="mr-2 h-4 w-4" aria-hidden="true" />
                    Retry Generation
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {pageState === 'ready' && (
          <Card className="shadow-2xl">
            <CardContent className="pt-6">
              <PairwiseComparisonForm configId={configId} />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default ConfigPairsPage;
