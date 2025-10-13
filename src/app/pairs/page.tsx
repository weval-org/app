'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/components/ui/use-toast';
import { ConversationMessage } from '@/types/shared';
import Icon from '@/components/ui/icon';
import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';

interface Prompt {
  system?: string | null;
  messages: ConversationMessage[];
}

interface ComparisonTask {
  taskId: string;
  prompt: Prompt | string;
  responseA: string;
  responseB: string;
  modelIdA?: string;
  modelIdB?: string;
}

interface DisplayedResponse {
  text: string;
  side: 'A' | 'B';
  modelId?: string;
}

const REASON_TEMPLATES = [
  'More concise',
  'Better accuracy',
  'Clearer explanation',
  'More creative',
  'Safer response',
  'More helpful',
  'Better structured',
  'More thorough',
];

const PromptDisplay = ({ prompt }: { prompt: ComparisonTask['prompt'] }) => {
  const [isSystemOpen, setIsSystemOpen] = useState(false);

  if (typeof prompt === 'string') {
    return <p className="text-foreground whitespace-pre-wrap">{prompt}</p>;
  }

  return (
    <div className="space-y-4">
      {prompt.system && (
        <Collapsible open={isSystemOpen} onOpenChange={setIsSystemOpen}>
          <CollapsibleTrigger asChild>
            <button
              className="w-full text-left"
              aria-expanded={isSystemOpen}
              aria-label={isSystemOpen ? "Collapse system prompt" : "Expand system prompt"}
            >
              <div className="p-3 bg-blue-900/10 dark:bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-900/20 dark:hover:bg-blue-500/20 transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="brain-circuit" className="w-5 h-5 text-blue-500" aria-hidden="true" />
                    <h4 className="font-semibold text-blue-600 dark:text-blue-400">System Prompt</h4>
                  </div>
                  <Icon
                    name={isSystemOpen ? "chevron-up" : "chevron-down"}
                    className="w-4 h-4 text-blue-500"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="p-3 bg-blue-900/5 dark:bg-blue-500/5 border border-blue-500/10 rounded-lg">
              <p className="text-foreground/80 whitespace-pre-wrap text-sm">{prompt.system}</p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      {prompt.messages.map((message, index) => (
        <div key={index} className="flex items-start gap-3">
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${message.role === 'user' ? 'bg-gray-200 dark:bg-gray-700' : 'bg-green-200 dark:bg-green-800'}`}
            aria-hidden="true"
          >
            {message.role === 'user' ? <Icon name="user" className="w-5 h-5 text-gray-600 dark:text-gray-300" /> : <Icon name="bot" className="w-5 h-5 text-green-600 dark:text-green-300" />}
          </div>
          <div className="flex-grow pt-1">
            <p className="text-foreground whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

interface ResponseCardProps {
  response: DisplayedResponse;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  isSelected: boolean;
  modelRevealed?: string;
}

const ResponseCard: React.FC<ResponseCardProps> = ({
  response,
  isExpanded,
  onToggleExpand,
  onSelect,
  isSelected,
  modelRevealed
}) => {
  const isLong = response.text.length > 1000;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Response {response.side}</h3>
        <Button
          size="lg"
          onClick={onSelect}
          variant={isSelected ? "default" : "outline"}
          className={isSelected ? "ring-2 ring-primary ring-offset-2" : ""}
          aria-label={`Select response ${response.side}`}
          aria-pressed={isSelected}
        >
          {isSelected && <Icon name="check" className="mr-2 h-4 w-4" aria-hidden="true" />}
          <span className="font-semibold">{isSelected ? `${response.side} Selected` : `Select ${response.side}`}</span>
        </Button>
      </div>
      <Card className={`flex-grow relative ${isSelected ? 'ring-2 ring-primary' : ''}`}>
        <CardContent className="p-4">
          {isLong && !isExpanded ? (
            <ScrollArea className="h-[400px]">
              <div className="prose prose-sm prose-inherit max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                  {response.text}
                </ReactMarkdown>
              </div>
            </ScrollArea>
          ) : (
            <div className="prose prose-sm prose-inherit max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                {response.text}
              </ReactMarkdown>
            </div>
          )}
        </CardContent>
        {isLong && (
          <div className="absolute top-2 right-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleExpand}
              className="h-8 w-8 p-0"
              aria-label={isExpanded ? 'Collapse response' : 'Expand response'}
            >
              <Icon name={isExpanded ? "minimize-2" : "maximize-2"} className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </Card>
      {modelRevealed && (
        <div className="flex items-center justify-center">
          <Badge variant="outline" className="text-xs py-1 px-3">
            <Icon name="cpu" className="w-3 h-3 mr-1" aria-hidden="true" />
            {modelRevealed}
          </Badge>
        </div>
      )}
    </div>
  );
};

const PairwiseComparisonForm = () => {
  const [task, setTask] = useState<ComparisonTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<'A' | 'B' | null>(null);
  const [reason, setReason] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [expandedBoth, setExpandedBoth] = useState(false);
  const [modelRevealA, setModelRevealA] = useState<string | null>(null);
  const [modelRevealB, setModelRevealB] = useState<string | null>(null);
  const { toast } = useToast();

  // Randomize A/B display to reduce position bias
  const [swapped, setSwapped] = useState(false);

  const displayedResponses = useMemo<{ left: DisplayedResponse; right: DisplayedResponse } | null>(() => {
    if (!task) return null;

    if (swapped) {
      return {
        left: { text: task.responseB, side: 'B' as const, modelId: task.modelIdB },
        right: { text: task.responseA, side: 'A' as const, modelId: task.modelIdA }
      };
    }
    return {
      left: { text: task.responseA, side: 'A' as const, modelId: task.modelIdA },
      right: { text: task.responseB, side: 'B' as const, modelId: task.modelIdB }
    };
  }, [task, swapped]);

  const fetchTask = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setReason('');
    setSelectedTemplates([]);
    setSelectedResponse(null);
    setExpandedBoth(false);
    setModelRevealA(null);
    setModelRevealB(null);
    setSwapped(Math.random() > 0.5); // Randomize position

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

  const handleTemplateToggle = (template: string) => {
    setSelectedTemplates(prev =>
      prev.includes(template)
        ? prev.filter(t => t !== template)
        : [...prev, template]
    );
  };

  const handleSubmit = async (preference: 'A' | 'B' | 'Indifferent' | 'Unknown') => {
    if (!task) return;

    setIsSubmitting(true);

    try {
        const fullReason = selectedTemplates.length > 0
          ? `${selectedTemplates.join(', ')}${reason ? '. ' + reason : ''}`
          : reason;

        const response = await fetch('/api/pairs/submit-preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                taskId: task.taskId,
                preference: preference,
                reason: fullReason,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to submit your preference.');
        }

        // Show model reveal
        if (task.modelIdA) setModelRevealA(task.modelIdA);
        if (task.modelIdB) setModelRevealB(task.modelIdB);

        setSessionCount(prev => prev + 1);

        toast({
            title: "Preference Submitted!",
            description: `Thank you for your feedback. You've completed ${sessionCount + 1} comparison${sessionCount + 1 > 1 ? 's' : ''} this session.`,
        });

        // Fetch the next task after showing model reveal briefly
        setTimeout(fetchTask, 2000);

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

  const handleSubmitSelected = () => {
    if (selectedResponse) {
      handleSubmit(selectedResponse);
    }
  };

  if (isLoading && !task) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground" role="status" aria-live="polite">
            <Icon name="loader-2" className="w-12 h-12 animate-spin mb-4" aria-hidden="true" />
            <p>Fetching a new comparison...</p>
        </div>
    );
  }

  if (error) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-red-500" role="alert">
            <p className="mb-4">{error}</p>
            <Button onClick={fetchTask}>
                <Icon name="refresh-cw" className="mr-2 h-4 w-4" aria-hidden="true" />
                Try Again
            </Button>
        </div>
    );
  }

  if (!task || !displayedResponses) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
            <p>No tasks available right now. Please check back later.</p>
        </div>
    );
  }

  const isButtonDisabled = isSubmitting || isLoading;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Progress indicator */}
      {sessionCount > 0 && (
        <div className="flex justify-center" role="status" aria-live="polite">
          <Badge variant="secondary" className="text-sm py-2 px-4">
            <Icon name="check-circle" className="w-4 h-4 mr-2 text-green-500" aria-hidden="true" />
            {sessionCount} comparison{sessionCount > 1 ? 's' : ''} completed this session
          </Badge>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">The Prompt</h3>
        <div className="p-4 border rounded-lg bg-muted/50">
          <PromptDisplay prompt={task.prompt} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Response */}
        <ResponseCard
          response={displayedResponses.left}
          isExpanded={expandedBoth}
          onToggleExpand={() => setExpandedBoth(!expandedBoth)}
          onSelect={() => setSelectedResponse(displayedResponses.left.side)}
          isSelected={selectedResponse === displayedResponses.left.side}
          modelRevealed={displayedResponses.left.side === 'A' ? modelRevealA || undefined : modelRevealB || undefined}
        />

        {/* Right Response */}
        <ResponseCard
          response={displayedResponses.right}
          isExpanded={expandedBoth}
          onToggleExpand={() => setExpandedBoth(!expandedBoth)}
          onSelect={() => setSelectedResponse(displayedResponses.right.side)}
          isSelected={selectedResponse === displayedResponses.right.side}
          modelRevealed={displayedResponses.right.side === 'A' ? modelRevealA || undefined : modelRevealB || undefined}
        />
      </div>

      {/* Reasoning section - only show if A or B is selected */}
      {selectedResponse && (
        <div className="pt-4 space-y-4 border-t-2 border-primary/20">
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">
              You selected Response {selectedResponse}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Tell us why (optional), then submit your choice below
            </p>
          </div>

          {/* Quick reason templates */}
          <div>
            <label htmlFor="reason-templates" className="block text-sm font-medium text-muted-foreground mb-2">
              Quick reasons (optional)
            </label>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="reason-templates">
              {REASON_TEMPLATES.map(template => (
                <Badge
                  key={template}
                  variant={selectedTemplates.includes(template) ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/80 transition-colors"
                  onClick={() => handleTemplateToggle(template)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selectedTemplates.includes(template)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleTemplateToggle(template);
                    }
                  }}
                >
                  {template}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-muted-foreground mb-2">
              Additional thoughts? (Optional)
            </label>
            <Textarea
                id="reason"
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full p-2 border rounded-md bg-transparent"
                placeholder="e.g., Response was more concise and directly answered the question."
                disabled={isButtonDisabled}
            />
          </div>

          {/* Submit button for selected response */}
          <div className="flex justify-center">
            <Button
              size="lg"
              className="text-lg px-8"
              onClick={handleSubmitSelected}
              disabled={isButtonDisabled}
            >
              {isSubmitting ? (
                <>
                  <Icon name="loader-2" className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                  Submitting...
                </>
              ) : (
                <>
                  <Icon name="check" className="mr-2 h-5 w-5" aria-hidden="true" />
                  Submit My Choice
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Alternative actions - always visible */}
      <div className="pt-4 border-t">
        <p className="text-sm text-muted-foreground text-center mb-4">
          {selectedResponse ? "Or choose a different option:" : "Can't decide between A and B?"}
        </p>
        <div className="flex justify-center items-center gap-4 flex-wrap">
          <Button
            className="bg-highlight-warning text-highlight-warning-foreground hover:bg-highlight-warning/90"
            size="lg"
            onClick={() => handleSubmit('Indifferent')}
            disabled={isButtonDisabled}
          >
            {isSubmitting && <Icon name="loader-2" className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            About the Same
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => handleSubmit('Unknown')}
            disabled={isButtonDisabled}
          >
            {isSubmitting && <Icon name="loader-2" className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            I Don't Know
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={fetchTask}
            disabled={isButtonDisabled}
          >
            Skip This Comparison
          </Button>
        </div>
      </div>
    </div>
  );
};


const PairsPage = () => {
  const [showDetails, setShowDetails] = useState(false);

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
        <Card className="shadow-2xl">
          <CardHeader>
            <CardTitle>Which response is better?</CardTitle>
          </CardHeader>
          <CardContent>
            <PairwiseComparisonForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default PairsPage;
