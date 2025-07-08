'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { ConversationMessage } from '@/types/shared';

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));
const RefreshCw = dynamic(() => import('lucide-react').then(mod => mod.RefreshCw));
const User = dynamic(() => import('lucide-react').then(mod => mod.User));
const Bot = dynamic(() => import('lucide-react').then(mod => mod.Bot));
const BrainCircuit = dynamic(() => import('lucide-react').then(mod => mod.BrainCircuit));

interface Prompt {
  system?: string | null;
  messages: ConversationMessage[];
}

interface ComparisonTask {
  taskId: string;
  prompt: Prompt | string;
  responseA: string;
  responseB: string;
}

const PromptDisplay = ({ prompt }: { prompt: ComparisonTask['prompt'] }) => {
  if (typeof prompt === 'string') {
    return <p className="text-foreground whitespace-pre-wrap">{prompt}</p>;
  }

  return (
    <div className="space-y-4">
      {prompt.system && (
        <div className="p-3 bg-blue-900/10 dark:bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <BrainCircuit className="w-5 h-5 text-blue-500" />
            <h4 className="font-semibold text-blue-600 dark:text-blue-400">System Prompt</h4>
          </div>
          <p className="text-foreground/80 whitespace-pre-wrap text-sm">{prompt.system}</p>
        </div>
      )}
      {prompt.messages.map((message, index) => (
        <div key={index} className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${message.role === 'user' ? 'bg-gray-200 dark:bg-gray-700' : 'bg-green-200 dark:bg-green-800'}`}>
            {message.role === 'user' ? <User className="w-5 h-5 text-gray-600 dark:text-gray-300" /> : <Bot className="w-5 h-5 text-green-600 dark:text-green-300" />}
          </div>
          <div className="flex-grow pt-1">
            <p className="text-foreground whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

const PairwiseComparisonForm = () => {
  const [task, setTask] = useState<ComparisonTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreference, setSelectedPreference] = useState<'A' | 'B' | 'Indifferent' | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const fetchTask = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setReason('');
    setSelectedPreference(null);
    try {
      const response = await fetch('/api/pairs/get-task');
      if (!response.ok) {
        throw new Error('Failed to fetch the next comparison task.');
      }
      const data: ComparisonTask = await response.json();
      setTask(data);
    } catch (e: any) {
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);
  
  const handlePreferenceSelect = (preference: 'A' | 'B') => {
    setSelectedPreference(preference);
    handleSubmit(preference);
  };

  const handleSubmit = async (preference: 'A' | 'B' | 'Indifferent') => {
    if (!task) return;
    
    setIsSubmitting(true);
    
    try {
        const response = await fetch('/api/pairs/submit-preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                taskId: task.taskId,
                preference: preference,
                reason: reason,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to submit your preference.');
        }

        toast({
            title: "Preference Submitted!",
            description: "Thank you for your feedback. Loading next pair...",
        });

        // Fetch the next task after a short delay to allow toast to be seen
        setTimeout(fetchTask, 1000);

    } catch (e: any) {
        setError(e.message || 'An unknown error occurred during submission.');
        toast({
            variant: 'destructive',
            title: "Submission Failed",
            description: e.message || 'Please try again.',
        });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  if (isLoading && !task) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
            <Loader2 className="w-12 h-12 animate-spin mb-4" />
            <p>Fetching a new comparison...</p>
        </div>
    );
  }

  if (error) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-red-500">
            <p className="mb-4">{error}</p>
            <Button onClick={fetchTask}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
            </Button>
        </div>
    );
  }

  if (!task) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
            <p>No tasks available right now. Please check back later.</p>
        </div>
    );
  }
  
  const isButtonDisabled = isSubmitting || isLoading;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">The Prompt</h3>
        <div className="p-4 border rounded-lg bg-muted/50">
          <PromptDisplay prompt={task.prompt} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Response A */}
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-foreground">Response A</h3>
          <Card className="flex-grow">
            <CardContent className="p-4">
              <p className="text-foreground whitespace-pre-wrap">{task.responseA}</p>
            </CardContent>
          </Card>
          <Button size="lg" onClick={() => handlePreferenceSelect('A')} disabled={isButtonDisabled}>
            {isSubmitting && selectedPreference === 'A' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            A is Better
          </Button>
        </div>

        {/* Response B */}
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-foreground">Response B</h3>
          <Card className="flex-grow">
            <CardContent className="p-4">
               <p className="text-foreground whitespace-pre-wrap">{task.responseB}</p>
            </CardContent>
          </Card>
          <Button size="lg" onClick={() => handlePreferenceSelect('B')} disabled={isButtonDisabled}>
            {isSubmitting && selectedPreference === 'B' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            B is Better
          </Button>
        </div>
      </div>

       <div className="pt-4 space-y-4">
          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-muted-foreground mb-2">Why did you make this choice? (Optional, but helpful!)</label>
            <Textarea
                id="reason"
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full p-2 border rounded-md bg-transparent"
                placeholder="e.g., Response A was more concise and directly answered the question."
                disabled={isButtonDisabled}
            />
          </div>
          <div className="flex justify-center items-center gap-4">
             <Button variant="ghost" onClick={() => handleSubmit('Indifferent')} disabled={isButtonDisabled}>
                {isSubmitting && selectedPreference === 'Indifferent' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                About the Same
            </Button>
            <Button variant="link" onClick={fetchTask} disabled={isButtonDisabled}>
                Skip
            </Button>
          </div>
      </div>
    </div>
  );
};


const PairsPage = () => {
  return (
    <div className="container mx-auto py-12 px-4">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-primary">Help Us Evaluate AI</h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          Help improve AI evaluation by choosing the better response between two models for a given prompt. Your feedback provides valuable data for our research.
        </p>
      </header>

      <main className="max-w-4xl mx-auto">
        <Card className="shadow-2xl">
          <CardHeader>
            <CardTitle>Which response is better?</CardTitle>
            <CardDescription>
              Read the prompt and the two responses below, then select the one you think is better. There are no right or wrong answers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PairwiseComparisonForm />
          </CardContent>
        </Card>
      </main>

      <footer className="text-center mt-12 text-sm text-muted-foreground">
        <p>Your contributions are anonymous and help build an open dataset for AI research.</p>
        <p>Weval is a project by the <a href="https://www.cip.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Collective Intelligence Project</a>.</p>
      </footer>
    </div>
  );
};

export default PairsPage; 