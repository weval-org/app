"use client";

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useStoryOrchestrator, type Message } from './hooks/useStoryOrchestrator';
import { ControlSignalHelpers } from '@/app/api/story/utils/control-signals';
import { sanitizeCtaText } from '@/app/api/story/utils/validation';
import { QuickRunFallback } from './components/QuickRunFallback';
import { QuickRunResults } from './components/QuickRunResults';
import { Bot, User, XCircle, RefreshCcw } from 'lucide-react';
import { GuidedStepHeader } from './components/GuidedStepHeader';
import Icon from '@/components/ui/icon';
import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';

export default function StoryPage() {
  const [story, setStory] = useState('');
  const [composer, setComposer] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  
  const {
    messages,
    outlineObj,
    phase,
    pending,
    createPending,
    quickRunPending,
    chatError,
    createError,
    quickRunError,
    startChat,
    sendMessage,
    sendCta,
    runQuickTest,
    clearErrors,
    resetChat,
  } = useStoryOrchestrator();

  // Hide the "Suggest quick test" button if we've already suggested it or shown quick results
  const showSuggestQuick = (() => {
    try {
      return !messages.some(m => m.role === 'assistant' && (
        (ControlSignalHelpers.extractQuickResult(m.content) != null) ||
        (ControlSignalHelpers.extractCtas(m.content) || []).some(t => /run a quick test/i.test(t))
      ));
    } catch { return true; }
  })();

  const canSubmitIntro = story.trim().length > 0 && !pending;
  const canSend = composer.trim().length > 0 && !pending;

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Autofocus composer when chat starts
  useEffect(() => {
    if (phase === 'chat') {
      composerRef.current?.focus();
    }
  }, [phase]);

  // Persistence
  const STORAGE_KEY = 'story_session_v1';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
        // TODO: Restore state from localStorage via hook
        // For now, just clear any existing errors
        clearErrors();
      }
    } catch {}
  }, [clearErrors]);

  const onSubmitIntro = async () => {
    if (!canSubmitIntro) return;
    await startChat(story);
  };

  const onSend = async () => {
    if (!canSend) return;
    const content = composer.trim();
    setComposer('');
    await sendMessage(content);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const onReset = () => {
    if (window.confirm('Are you sure you want to clear this conversation and start over?')) {
      resetChat();
    }
  };

  return (
    <div className="container mx-auto py-8 flex flex-col h-[calc(100vh-100px)]">
      {phase === 'intro' ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-full max-w-3xl">
            <GuidedStepHeader 
              icon="file-text"
              title="Tell Us Your Story"
              description="Describe how an AI has affected you, what you want improved, or a goal you care about. We'll help you turn it into a test."
              isActive={true}
              isCompleted={false}
              stepNumber={1}
            />
            <Card className="p-4 mt-6">
              <Textarea
                value={story}
                onChange={e => setStory(e.target.value)}
                className="h-64 resize-vertical text-base"
                placeholder="For example: I asked for a summary of a news article, but the AI completely missed the main point and focused on trivial details..."
              />
              <div className="mt-4 flex justify-end">
                <Button onClick={onSubmitIntro} disabled={!canSubmitIntro} size="lg">
                  Start Conversation
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-semibold">Building Your Test</h1>
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Start Over
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
            <div className="lg:col-span-2">
              <Card className="p-0 h-full flex flex-col">
                <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((m, i) => {
                    const cleanText = m.role === 'assistant' ? ControlSignalHelpers.cleanText(m.content) : m.content;
                    const ctas = m.role === 'assistant' ? ControlSignalHelpers.extractCtas(m.content) : [];
                    const quickResult = m.role === 'assistant' ? ControlSignalHelpers.extractQuickResult(m.content) : null;
                    
                    return (
                      <div key={i} className={cn('flex items-start gap-3 max-w-[85%]', m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto')}>
                        <div className="rounded-full border p-2 bg-background flex-shrink-0">
                          {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </div>
                        <div className={cn('rounded-md p-3', m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground border')}>
                          {!quickResult ? (
                            <div className={cn(
                              "prose prose-sm max-w-none prose-inherit",
                              m.role === 'assistant' && 'dark:prose-invert'
                            )}>
                              <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{cleanText}</ReactMarkdown>
                            </div>
                          ) : (
                            <QuickRunResults result={quickResult} />
                          )}
                          {m.role === 'assistant' && ctas.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {ctas.map((t, idx) => (
                                <Button key={idx} variant="secondary" size="sm" onClick={() => {
                                  const sanitized = sanitizeCtaText(t);
                                  if (sanitized) {
                                    sendCta(sanitized);
                                  }
                                }}>{t}</Button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t p-3 flex gap-2 items-end">
                  <Textarea
                    ref={composerRef}
                    value={composer}
                    onChange={e => setComposer(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={pending ? 'Assistant is typing…' : 'Type your message, or shift+enter for new line'}
                    className="min-h-[60px]"
                    disabled={pending}
                  />
                  <Button onClick={onSend} disabled={!canSend}>Send</Button>
                </div>
                {chatError && (
                  <div className="px-4 pb-3 text-sm text-destructive flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    <span>{chatError}</span>
                  </div>
                )}
              </Card>
            </div>
            <div className="lg:col-span-1">
              <Card className="p-4 h-full overflow-y-auto">
                <h2 className="text-lg font-medium mb-4">Your Test Plan</h2>
                {createPending && (
                  <div className="text-sm text-muted-foreground animate-pulse p-4 text-center">Creating your test plan…</div>
                )}
                {createError && (
                  <div className="text-sm text-destructive mb-2 rounded border border-destructive/50 bg-destructive/10 p-3">{createError}</div>
                )}
                {!outlineObj && !createPending && !createError && (
                  <div className="text-center py-8 px-4">
                    <Icon name="file-text" className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground mt-4">As you chat with the assistant, we’ll build a simple list of questions and expectations here.</p>
                  </div>
                )}
                {outlineObj && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold">{outlineObj.title || 'Untitled Test'}</h3>
                      {outlineObj.description && (
                        <p className="text-sm text-muted-foreground mt-1">{outlineObj.description}</p>
                      )}
                    </div>
                    <div className="space-y-3">
                      {(outlineObj.prompts || []).slice(0, 8).map((p: any, idx: number) => (
                        <Card key={p.id || idx} className="p-3 bg-background/50">
                          <div className="font-semibold text-sm mb-2 text-primary">Question #{idx + 1} for the AI</div>
                          <p className="font-medium text-sm text-foreground/90">{p.promptText}</p>
                          {Array.isArray(p.points) && p.points.length > 0 && (
                            <div className="mt-3">
                              <h4 className="text-xs font-semibold text-muted-foreground mb-2">What to Look For:</h4>
                              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                {(Array.isArray(p.points[0]) ? p.points[0] : p.points).slice(0, 5).map((pt: any, idx: number) => (
                                  <li key={idx}>{typeof pt === 'string' ? pt : (pt?.text || String(pt))}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                    <div className="pt-2">
                      <Button variant="secondary" disabled={!outlineObj || quickRunPending} onClick={runQuickTest} className="w-full">
                        <Icon name="flask-conical" className="mr-2 h-4 w-4" />
                        Run Quick Test on this Plan
                      </Button>
                      {quickRunPending && (
                        <div className="text-xs text-muted-foreground flex items-center gap-2 p-2 rounded-md bg-muted justify-center mt-2">
                           <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                           <span>Running quick test…</span>
                        </div>
                      )}
                      {quickRunError && (
                        <QuickRunFallback 
                          onRetry={runQuickTest}
                          onSkip={() => clearErrors()}
                          onGoToSandbox={() => window.open('/sandbox', '_blank')}
                          isRetrying={quickRunPending}
                        />
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


