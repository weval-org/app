'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  configId: string;
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
}

const ResponseCard: React.FC<ResponseCardProps> = ({
  response,
  isExpanded,
  onToggleExpand,
  onSelect,
  isSelected
}) => {
  const isLong = response.text.length > 1000;

  return (
    <div className="flex flex-col gap-4">
      <Card className={`flex-grow relative ${isSelected ? 'ring-2 ring-primary' : 'border-2'}`}>
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
      <Button
        size="lg"
        onClick={onSelect}
        className={`w-full text-base font-bold py-6 ${
          isSelected
            ? "bg-primary text-primary-foreground hover:bg-primary/90 ring-2 ring-primary ring-offset-2"
            : "bg-highlight-warning text-highlight-warning-foreground hover:bg-highlight-warning/90"
        }`}
        aria-label="Select this response as better"
        aria-pressed={isSelected}
      >
        {isSelected && <Icon name="check" className="mr-2 h-5 w-5" aria-hidden="true" />}
        <span>{isSelected ? "Selected" : "This one is better"}</span>
      </Button>
    </div>
  );
};

interface PairwiseComparisonFormProps {
  configId?: string;
}

export const PairwiseComparisonForm: React.FC<PairwiseComparisonFormProps> = ({ configId }) => {
  const [task, setTask] = useState<ComparisonTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<'A' | 'B' | null>(null);
  const [alternativeSelection, setAlternativeSelection] = useState<'Indifferent' | 'Unknown' | null>(null);
  const [reason, setReason] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [expandedBoth, setExpandedBoth] = useState(false);
  const { toast } = useToast();

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
    setAlternativeSelection(null);
    setExpandedBoth(false);
    setSwapped(Math.random() > 0.5);

    try {
      const endpoint = configId
        ? `/api/pairs/config/${configId}/get-task`
        : '/api/pairs/get-task';

      const response = await fetch(endpoint);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch the next comparison task.');
      }
      const data: ComparisonTask = await response.json();
      setTask(data);
    } catch (e: any) {
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [configId]);

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

    const fullReason = selectedTemplates.length > 0
      ? `${selectedTemplates.join(', ')}${reason ? '. ' + reason : ''}`
      : reason;

    // Optimistically fetch next task immediately
    setSessionCount(prev => prev + 1);
    fetchTask();

    // Submit preference in background
    try {
        await fetch('/api/pairs/submit-preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                taskId: task.taskId,
                preference: preference,
                reason: fullReason,
            }),
        });
        // Silently succeed - user has already moved on
    } catch (e: any) {
        // Only show error if submission actually failed
        console.error('Failed to submit preference:', e);
        toast({
            variant: 'destructive',
            title: "Submission Failed",
            description: 'Your previous selection may not have been saved.',
        });
    }
  };

  const handleSubmitSelected = () => {
    if (selectedResponse) {
      handleSubmit(selectedResponse);
    }
  };

  const handleAlternativeSelect = (type: 'Indifferent' | 'Unknown') => {
    setAlternativeSelection(type);
    setSelectedResponse(null);
    setSelectedTemplates([]);
  };

  const handleSubmitAlternative = () => {
    if (alternativeSelection) {
      handleSubmit(alternativeSelection);
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

  const isButtonDisabled = isLoading;

  return (
    <div className="relative">
      {/* Loading overlay when fetching new task */}
      {isLoading && task && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg" role="status" aria-live="assertive">
          <div className="flex flex-col items-center gap-3">
            <Icon name="loader-2" className="w-10 h-10 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Loading next comparison...</p>
          </div>
        </div>
      )}

      <div className="space-y-8 animate-fade-in">
        {sessionCount > 0 && (
          <div className="flex justify-center" role="status" aria-live="polite">
            <Badge variant="secondary" className="text-sm py-2 px-4">
              <Icon name="check-circle" className="w-4 h-4 mr-2 text-green-500" aria-hidden="true" />
              {sessionCount} comparison{sessionCount > 1 ? 's' : ''} completed this session
            </Badge>
          </div>
        )}

        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Given this prompt:</h3>
          <div className="p-4 border rounded-lg bg-muted/50">
            <ScrollArea className="max-h-[400px]">
              <PromptDisplay prompt={task.prompt} />
            </ScrollArea>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Which response is better?</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`rounded-xl p-5 transition-all ${selectedResponse === displayedResponses.left.side ? 'bg-primary/5 border-2 border-primary/30' : 'border-2 border-transparent'}`}>
            <ResponseCard
              response={displayedResponses.left}
              isExpanded={expandedBoth}
              onToggleExpand={() => setExpandedBoth(!expandedBoth)}
              onSelect={() => {
                setSelectedResponse(displayedResponses.left.side);
                setAlternativeSelection(null);
              }}
              isSelected={selectedResponse === displayedResponses.left.side}
            />
          </div>

          <div className={`rounded-xl p-5 transition-all ${selectedResponse === displayedResponses.right.side ? 'bg-primary/5 border-2 border-primary/30' : 'border-2 border-transparent'}`}>
            <ResponseCard
              response={displayedResponses.right}
              isExpanded={expandedBoth}
              onToggleExpand={() => setExpandedBoth(!expandedBoth)}
              onSelect={() => {
                setSelectedResponse(displayedResponses.right.side);
                setAlternativeSelection(null);
              }}
              isSelected={selectedResponse === displayedResponses.right.side}
            />
          </div>
        </div>

        {selectedResponse && (
          <div className="bg-primary/5 border-2 border-primary/30 rounded-xl p-6 space-y-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                You selected this response
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Tell us why (optional), then submit your choice below
              </p>
            </div>

            <div>
              <label id="reason-templates" className="block text-sm font-medium text-muted-foreground mb-2">
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

            <div className="flex justify-center">
              <Button
                size="lg"
                className="text-lg px-8"
                onClick={handleSubmitSelected}
                disabled={isButtonDisabled}
              >
                <Icon name="check" className="mr-2 h-5 w-5" aria-hidden="true" />
                Submit My Choice
              </Button>
            </div>
          </div>
        )}

        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground text-center mb-4">
            Or choose a different option:
          </p>
          <div className="flex justify-center items-center gap-4 flex-wrap">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => handleAlternativeSelect('Indifferent')}
              disabled={isButtonDisabled}
            >
              About the Same
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => handleAlternativeSelect('Unknown')}
              disabled={isButtonDisabled}
            >
              I Don't Know
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={fetchTask}
              disabled={isButtonDisabled}
            >
              {isLoading && !task ? (
                <>
                  <Icon name="loader-2" className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading...
                </>
              ) : (
                'Skip This Comparison'
              )}
            </Button>
          </div>
        </div>

        {alternativeSelection && (
          <div className="bg-primary/5 border-2 border-primary/30 rounded-xl p-6 space-y-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                You selected: {alternativeSelection === 'Indifferent' ? 'About the Same' : "I Don't Know"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Add any context (optional), then submit your choice below
              </p>
            </div>

            <div>
              <label htmlFor="alternative-reason" className="block text-sm font-medium text-muted-foreground mb-2">
                Why did you choose this? (Optional)
              </label>
              <Textarea
                  id="alternative-reason"
                  name="alternative-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full p-2 border rounded-md bg-transparent"
                  placeholder="e.g., Both responses had similar quality and accuracy."
                  disabled={isButtonDisabled}
              />
            </div>

            <div className="flex justify-center">
              <Button
                size="lg"
                className="text-lg px-8"
                onClick={handleSubmitAlternative}
                disabled={isButtonDisabled}
              >
                <Icon name="check" className="mr-2 h-5 w-5" aria-hidden="true" />
                Submit My Choice
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
