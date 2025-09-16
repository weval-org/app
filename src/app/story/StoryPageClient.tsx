"use client";

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useStoryOrchestrator } from '@/hooks/useStoryOrchestrator';
import { ControlSignalHelpers } from '@/lib/story-utils/control-signals';
import { sanitizeCtaText } from '@/app/api/story/utils/validation';
import { QuickRunFallback } from './components/QuickRunFallback';
import { QuickRunResults } from './components/QuickRunResults';
import { Bot, User, XCircle, RefreshCcw } from 'lucide-react';
import { GuidedStepHeader } from './components/GuidedStepHeader';
import Icon from '@/components/ui/icon';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import RemarkGfmPlugin from 'remark-gfm';

export default function StoryPageClient() {
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
    quickRunStatus,
    chatError,
    createError,
    quickRunError,
    startChat,
    sendMessage,
    sendCta,
    runQuickTest,
    clearErrors,
    resetChat,
    activeStream,
    quickRunResult,
  } = useStoryOrchestrator();

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

  // Auto-scroll as streaming updates arrive
  useEffect(() => {
    if (activeStream) {
      scrollToBottom();
    }
  }, [activeStream]);

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

  const onIntroKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmitIntro();
    }
  };

  const onReset = () => {
    if (window.confirm('Are you sure you want to clear this conversation and start over?')) {
      resetChat();
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {phase === 'intro' ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-5xl">
            <GuidedStepHeader 
              icon="file-text"
              title="Let's change AI! First step: How has AI affected you?"
              description="Describe how an AI has affected you, what you want improved, or a goal you care about. We'll help you capture the key points."
              isActive={true}
              isCompleted={false}
              stepNumber={1}
            />
            <Card className="p-4 mt-6">
              <Textarea
                value={story}
                onChange={e => setStory(e.target.value)}
                onKeyDown={onIntroKeyDown}
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
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center p-4 border-b bg-background">
            <h1 className="text-3xl font-semibold">Exploring Your Story</h1>
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Start Over
            </Button>
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-4 lg:grid-cols-3 gap-4 p-4">
            <div className="xl:col-span-2 lg:col-span-2 flex flex-col min-h-0">
              <Card className="p-0 flex-1 flex flex-col min-h-0">
                <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((m, idx) => {
                    const isLast = idx === messages.length - 1;
                    // For the last assistant message, we might be streaming, so take from activeStream
                    const content = (isLast && m.role === 'assistant' && activeStream) ? activeStream.visibleContent : m.content;
                    const cleanText = m.role === 'assistant' ? ControlSignalHelpers.cleanUserText(content) : content;
                    const ctas = m.role === 'assistant' ? (m.ctas || ControlSignalHelpers.extractCtas(m.content)) : [];
                    
                    return (
                      <div key={m.id || `msg-${idx}`} className={cn('flex items-start gap-3', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                        <div className={cn(
                          'rounded-full p-2 flex-shrink-0',
                          m.role === 'user' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground border'
                        )}>
                          {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </div>
                        <div className={cn(
                          'rounded-lg p-3 max-w-[80%]',
                          m.role === 'user' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-card text-card-foreground border'
                        )}>
                          <div className={cn(
                            "prose prose-sm max-w-none prose-inherit",
                            m.role === 'assistant' && 'dark:prose-invert'
                          )}>
                            <ResponseRenderer content={cleanText} />
                          </div>
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

                  {/* Render the actively streaming message */}
                  {activeStream && (
                    <div className="flex items-start gap-3">
                      <div className="rounded-full p-2 bg-muted text-muted-foreground border flex-shrink-0">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="rounded-lg p-3 bg-card text-card-foreground border max-w-[80%]">
                        {activeStream.visibleContent ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none">{activeStream.visibleContent}</div>
                        ) : (
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                            <span>Assistant is typing…</span>
                          </div>
                        )}
                        {activeStream.ctas.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {activeStream.ctas.map((t, idx) => (
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
                  )}
                </div>
                <div className="flex-shrink-0 border-t p-3 flex gap-2 items-end">
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
                  <div className="flex-shrink-0 px-4 pb-3 text-sm text-destructive flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    <span>{chatError}</span>
                  </div>
                )}
              </Card>
            </div>
            <div className="xl:col-span-2 lg:col-span-1 flex flex-col min-h-0 overflow-y-auto space-y-4">
              {outlineObj && (
                <Card className="p-4 flex-shrink-0 flex flex-col max-h-[50vh]">
                  <h2 className="text-lg font-medium mb-4 flex-shrink-0">Quick Preview</h2>
                  <div className="space-y-3 overflow-y-auto">
                    <Button 
                      variant="default" 
                      disabled={!outlineObj || quickRunPending} 
                      onClick={runQuickTest} 
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 h-auto border-2 border-primary/20 hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/20"
                      size="lg"
                    >
                      <Icon name="target" className="mr-2 h-5 w-5" />
                      Run Test Now
                    </Button>
                    {quickRunPending && (
                      <div className="flex items-center gap-3 p-4 rounded-lg bg-highlight-info/10 border border-highlight-info/20">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{quickRunStatus?.message || 'Running your test...'}</p>
                          <p className="text-xs text-muted-foreground">This may take a moment</p>
                        </div>
                      </div>
                    )}
                    {quickRunError && !quickRunResult && (
                      <QuickRunFallback 
                        onRetry={runQuickTest}
                        onSkip={() => clearErrors()}
                        onGoToSandbox={() => window.open('/sandbox', '_blank')}
                        isRetrying={quickRunPending}
                      />
                    )}
                    {quickRunResult && (
                      <QuickRunResults result={quickRunResult} />
                    )}
                  </div>
                </Card>
              )}

              <Card className="p-4 flex-1 flex flex-col min-h-0">
                <h2 className="text-lg font-medium mb-4 flex-shrink-0">Your Test Plan</h2>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {createPending && (
                    <div className="flex flex-col items-center justify-center py-8 px-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mb-3"></div>
                      <p className="text-sm text-muted-foreground text-center">Creating your test plan...</p>
                    </div>
                  )}
                  {createError && (
                    <div className="text-sm text-destructive mb-2 rounded border border-destructive/50 bg-destructive/10 p-3">{createError}</div>
                  )}
                  {!outlineObj && !createPending && !createError && (
                    <div className="text-center py-8 px-4">
                      <Icon name="file-text" className="mx-auto h-12 w-12 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground mt-4">As you chat with the assistant, I'll create a test plan based on your conversation.</p>
                    </div>
                  )}
                  {outlineObj && (
                    <div className="space-y-4">
                      {outlineObj.description && (
                        <div className="p-3 rounded-lg bg-accent/30 border border-accent/40">
                          <p className="text-sm font-medium text-foreground">
                            <span className="text-muted-foreground">The focus of this test:</span> {outlineObj.description}
                          </p>
                        </div>
                      )}
                      <div>
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
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}