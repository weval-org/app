"use client";

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useStoryOrchestrator } from '@/hooks/useStoryOrchestrator';
import { ControlSignalHelpers } from '@/lib/story-utils/control-signals';
import { QuickRunFallback } from './components/QuickRunFallback';
import { QuickRunResults } from './components/QuickRunResults';
import { QuickRunSummary } from './components/QuickRunSummary';
import { Bot, User, XCircle, RefreshCcw, MessageSquare, ArrowLeft, Edit3, Download, History, Plus, Trash2, ExternalLink, CheckCircle, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { GuidedStepHeader } from './components/GuidedStepHeader';
import Icon from '@/components/ui/icon';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import RemarkGfmPlugin from 'remark-gfm';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { StorySessionSummary } from '@/types/story';

export default function StoryPageClient() {
  const [story, setStory] = useState('');
  const [composer, setComposer] = useState('');
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [sessions, setSessions] = useState<StorySessionSummary[]>([]);
  const [isExporting, setIsExporting] = useState(false);
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
    runQuickTest,
    clearErrors,
    resetChat,
    activeStream,
    quickRunResult,
    listSessions,
    loadSession,
    deleteSession,
    clearAllSessions,
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

  // Load most recent session on first mount, if any
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    try {
      const sessions = listSessions();
      if (Array.isArray(sessions) && sessions.length > 0) {
        loadSession(sessions[0].id);
      }
    } catch {}
  }, [listSessions, loadSession]);

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
      setShowDetailedResults(false);
    }
  };

  const onExportToSandbox = async () => {
    if (!outlineObj) return;

    setIsExporting(true);
    try {
      // Use the sessionId if available, otherwise generate one
      const exportId = listSessions()[0]?.id || `story-${Date.now()}`;

      const response = await fetch('/api/story/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: exportId,
          outlineObj,
          quickRunResult: quickRunResult || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to export blueprint');
      }

      const { exportId: confirmedId } = await response.json();

      // Redirect to sandbox with the story parameter
      window.location.href = `/sandbox?story=${confirmedId}`;
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export blueprint to Sandbox. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Persistent toolbar component
  const renderToolbar = () => (
    <div className="flex justify-between items-center p-4 border-b bg-background">
      <h1 className="text-xl font-semibold">Weval / Story</h1>
      <div className="flex items-center gap-2">
        <DropdownMenu onOpenChange={(open) => { if (open) { try { setSessions(listSessions()); } catch {} } }}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <History className="mr-2 h-4 w-4" />
              Sessions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Recent sessions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sessions.length === 0 ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">No saved sessions yet</div>
            ) : (
              sessions.map(s => (
                <DropdownMenuItem key={s.id} className="flex items-center gap-2">
                  <button className="flex-1 min-w-0 text-left" onClick={() => loadSession(s.id)}>
                    <div className="text-sm font-medium truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground truncate">Updated {new Date(s.updatedAt).toLocaleString()}</div>
                  </button>
                  <button
                    className="ml-2 text-muted-foreground hover:text-destructive"
                    title="Delete session"
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); setSessions(listSessions()); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => resetChat()}>
              <Plus className="mr-2 h-4 w-4" />
              New session
            </DropdownMenuItem>
            {sessions.length > 0 && (
              <DropdownMenuItem onClick={() => { clearAllSessions(); setSessions([]); }}>
                <Trash2 className="mr-2 h-4 w-4" />
                Clear all
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {outlineObj && !quickRunResult && (
          <Button
            variant="default"
            size="sm"
            onClick={runQuickTest}
            disabled={quickRunPending}
          >
            {quickRunPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent mr-2"></div>
                Running Test...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Quick Test
              </>
            )}
          </Button>
        )}
        <Button
          variant="default"
          size="sm"
          onClick={onExportToSandbox}
          disabled={isExporting || !outlineObj}
        >
          {isExporting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent mr-2"></div>
              Exporting...
            </>
          ) : (
            <>
              <ExternalLink className="mr-2 h-4 w-4" />
              Export to Sandbox
            </>
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Start Over
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen">
      {phase === 'intro' ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-5xl">
            <div className="flex justify-end mb-2">
              <DropdownMenu onOpenChange={(open) => { if (open) { try { setSessions(listSessions()); } catch {} } }}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <History className="mr-2 h-4 w-4" />
                    Sessions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Recent sessions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {sessions.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-muted-foreground">No saved sessions yet</div>
                  ) : (
                    sessions.map(s => (
                      <DropdownMenuItem key={s.id} className="flex items-center gap-2">
                        <button className="flex-1 min-w-0 text-left" onClick={() => loadSession(s.id)}>
                          <div className="text-sm font-medium truncate">{s.title}</div>
                          <div className="text-xs text-muted-foreground truncate">Updated {new Date(s.updatedAt).toLocaleString()}</div>
                        </button>
                        <button
                          className="ml-2 text-muted-foreground hover:text-destructive"
                          title="Delete session"
                          onClick={(e) => { e.stopPropagation(); deleteSession(s.id); setSessions(listSessions()); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => resetChat()}>
                    <Plus className="mr-2 h-4 w-4" />
                    New session
                  </DropdownMenuItem>
                  {sessions.length > 0 && (
                    <DropdownMenuItem onClick={() => { clearAllSessions(); setSessions([]); }}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear all
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
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
        // CHAT MODE: Main layout
        <div className="flex flex-col h-full">
          {renderToolbar()}
          <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-4 lg:grid-cols-3 gap-4 p-4">
            <div className="xl:col-span-2 lg:col-span-2 flex flex-col min-h-0">
              <Card className="p-0 flex-1 flex flex-col min-h-0">
                <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((m, idx) => {
                    const isLast = idx === messages.length - 1;
                    // For the last assistant message, we might be streaming, so take from activeStream
                    const content = (isLast && m.role === 'assistant' && activeStream) ? activeStream.visibleContent : m.content;
                    const cleanText = m.role === 'assistant' ? ControlSignalHelpers.cleanUserText(content) : content;
                    
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
              {quickRunPending && (
                <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{quickRunStatus?.message || 'Running your test...'}</p>
                      <p className="text-xs text-muted-foreground">This may take a moment</p>
                    </div>
                  </div>
                </Card>
              )}
              {quickRunResult && (
                <QuickRunSummary
                  result={quickRunResult}
                  onViewDetails={() => setShowDetailedResults(true)}
                  onRerun={runQuickTest}
                />
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
                      <p className="text-sm text-muted-foreground mt-4">As you chat with the assistant, a test plan will be generated here.</p>
                    </div>
                  )}
                  {outlineObj && (
                    <div className="space-y-4">

                      {quickRunError && !quickRunResult && (
                        <QuickRunFallback
                          onRetry={runQuickTest}
                          onSkip={() => clearErrors()}
                          onGoToSandbox={() => window.open('/sandbox', '_blank')}
                          isRetrying={quickRunPending}
                        />
                      )}

                      {/* Outline details */}
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
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Key Criteria:</h4>
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

      {/* Detailed Results Modal */}
      <Dialog open={showDetailedResults} onOpenChange={setShowDetailedResults}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
          <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
            <DialogTitle className="text-2xl font-semibold">Detailed Test Results</DialogTitle>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {quickRunResult && <QuickRunResults result={quickRunResult} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}