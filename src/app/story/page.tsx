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
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-semibold">Your Story</h1>
        {phase === 'chat' && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Start Over
          </Button>
        )}
      </div>
      {phase === 'intro' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="p-4">
              <label className="block text-sm font-medium mb-2">Share an issue, story, or goal</label>
              <Textarea
                value={story}
                onChange={e => setStory(e.target.value)}
                className="h-64 resize-vertical"
                placeholder="Describe how AI has affected you, what you want improved, or an area you care about…"
              />
              <div className="mt-4 flex justify-end">
                <Button onClick={onSubmitIntro} disabled={!canSubmitIntro}>
                  Start Conversation
                </Button>
              </div>
            </Card>
          </div>
          <div className="lg:col-span-1">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">
                We’ll ask a few clarifying questions before proposing a simple test outline. This helps ensure we capture what matters to you.
              </p>
            </Card>
          </div>
        </div>
      ) : (
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
                          cleanText
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
              <h2 className="text-lg font-medium mb-2">Emerging Test Outline</h2>
              {createPending && (
                <div className="text-sm text-muted-foreground animate-pulse p-4 text-center">Creating outline…</div>
              )}
              {createError && (
                <div className="text-sm text-destructive mb-2 rounded border border-destructive/50 bg-destructive/10 p-3">{createError}</div>
              )}
              {!outlineObj && !createPending && !createError && (
                <p className="text-sm text-muted-foreground p-4 text-center">We’ll propose a simple list of prompts and expectations here once ready.</p>
              )}
              {outlineObj && (
                <div className="space-y-3">
                  <div>
                    <div className="font-medium">{outlineObj.title || 'Untitled Evaluation'}</div>
                    {outlineObj.description && (
                      <div className="text-sm text-muted-foreground">{outlineObj.description}</div>
                    )}
                  </div>
                  <div className="space-y-3">
                    {(outlineObj.prompts || []).slice(0, 8).map((p: any) => (
                      <Card key={p.id} className="p-3">
                        <div className="font-medium text-sm">{p.promptText}</div>
                        {Array.isArray(p.points) && p.points.length > 0 && (
                          <ul className="list-disc pl-5 mt-2 text-sm text-muted-foreground space-y-1">
                            {(Array.isArray(p.points[0]) ? p.points[0] : p.points).slice(0, 5).map((pt: any, idx: number) => (
                              <li key={idx}>{typeof pt === 'string' ? pt : (pt?.text || String(pt))}</li>
                            ))}
                          </ul>
                        )}
                      </Card>
                    ))}
                  </div>
                  <div className="pt-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" variant="secondary" disabled={!outlineObj || quickRunPending} onClick={runQuickTest}>
                        Run a quick test
                      </Button>
                      {quickRunPending && (
                        <div className="text-xs text-muted-foreground flex items-center gap-2 p-2 rounded-md bg-muted">
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
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}


