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

export default function StoryPage() {
  const [story, setStory] = useState('');
  const [composer, setComposer] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  
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
    suggestQuickTest,
    clearErrors,
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

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-semibold mb-4">Your Story</h1>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="p-0 h-[70vh] flex flex-col">
              <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m, i) => {
                  const cleanText = m.role === 'assistant' ? ControlSignalHelpers.cleanText(m.content) : m.content;
                  const ctas = m.role === 'assistant' ? ControlSignalHelpers.extractCtas(m.content) : [];
                  const quickResult = m.role === 'assistant' ? ControlSignalHelpers.extractQuickResult(m.content) : null;
                  
                  return (
                    <div key={i} className={cn('max-w-[80%]', m.role === 'user' ? 'ml-auto text-right' : 'mr-auto text-left')}>
                      <div className={cn('rounded-md p-3', m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground border')}>
                        {!quickResult ? (
                          cleanText
                        ) : (
                          <div className="text-left space-y-3">
                            {(quickResult.prompts || []).map((pr: any, idx: number) => (
                              <details key={idx} className="border rounded">
                                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{pr.promptText}</summary>
                                <div className="px-3 pb-3 pt-1 space-y-3">
                                  {(pr.models || []).map((m: any, midx: number) => (
                                    <div key={midx} className="border rounded p-2">
                                      <div className="text-xs text-muted-foreground mb-1">{m.modelId}</div>
                                      <div className="text-sm whitespace-pre-wrap max-h-40 overflow-auto">{(m.response || '').slice(0, 800)}{(m.response || '').length > 800 ? '…' : ''}</div>
                                      {Array.isArray(m.points) && m.points.length > 0 && (
                                        <ul className="mt-2 text-sm grid gap-1">
                                          {m.points.map((pt: any, pidx: number) => (
                                            <li key={pidx} className="flex items-center justify-between gap-3">
                                              <span className="truncate">{pt.text}</span>
                                              <span className="text-xs tabular-nums">{pt.score === null || pt.score === undefined ? 'N/A' : `${pt.score}%`}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            ))}
                          </div>
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
                  value={composer}
                  onChange={e => setComposer(e.target.value)}
                  placeholder={pending ? 'Please wait…' : 'Type your message'}
                  className="min-h-[60px]"
                  disabled={pending}
                />
                <Button onClick={onSend} disabled={!canSend}>Send</Button>
              </div>
              {chatError && (
                <div className="px-4 pb-3 text-sm text-destructive">{chatError}</div>
              )}
            </Card>
          </div>
          <div className="lg:col-span-1">
            <Card className="p-4 h-[70vh] overflow-y-auto">
              <h2 className="text-lg font-medium mb-2">Emerging Test Outline</h2>
              {createPending && (
                <div className="text-sm text-muted-foreground animate-pulse">Creating outline…</div>
              )}
              {createError && (
                <div className="text-sm text-destructive mb-2">{createError}</div>
              )}
              {!outlineObj && !createPending && !createError && (
                <p className="text-sm text-muted-foreground">We’ll propose a simple list of prompts and expectations here once ready.</p>
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
                      <div key={p.id} className="border rounded p-2">
                        <div className="font-medium text-sm">{p.promptText}</div>
                        {Array.isArray(p.points) && p.points.length > 0 && (
                          <ul className="list-disc pl-5 mt-1 text-sm">
                            {(Array.isArray(p.points[0]) ? p.points[0] : p.points).slice(0, 5).map((pt: any, idx: number) => (
                              <li key={idx}>{typeof pt === 'string' ? pt : (pt?.text || String(pt))}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="pt-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {showSuggestQuick && (
                        <Button size="sm" onClick={suggestQuickTest}>
                          Ask for a quick test
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" disabled={!outlineObj || quickRunPending} onClick={runQuickTest}>
                        Run a quick test
                      </Button>
                      {quickRunPending && <div className="text-xs text-muted-foreground">Running quick test…</div>}
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


