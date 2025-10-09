'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useWorkshopOrchestrator } from '@/hooks/useWorkshopOrchestrator';
import { PublishModal } from './components/PublishModal';
import { ShareModal } from './components/ShareModal';
import { WorkshopHeader } from '../components/WorkshopHeader';
import { ControlSignalHelpers } from '@/lib/story-utils/control-signals';
import { Bot, User, RefreshCcw, Share2, ExternalLink, Users, Play, CheckCircle, Download } from 'lucide-react';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import { QuickRunFallback } from '@/app/story/components/QuickRunFallback';
import { TestPlanWithResults } from './components/TestPlanWithResults';
import yaml from 'js-yaml';

interface PageProps {
  params: Promise<{ workshopId: string }>;
}

export default function WorkshopBuilderPage({ params }: PageProps) {
  const { workshopId } = use(params);
  const router = useRouter();
  const [story, setStory] = useState('');
  const [composer, setComposer] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    messages,
    outlineObj,
    outlineYaml,
    phase,
    pending,
    createPending,
    quickRunPending,
    chatError,
    quickRunError,
    quickRunResult,
    quickRunStatus,
    activeStream,
    session,
    showPublishModal,
    showShareModal,
    isPublishing,
    isSharing,
    shareUrl,
    startChat,
    sendMessage,
    runQuickTest,
    clearErrors,
    publishBlueprint,
    shareBlueprint,
    resetChat,
    setShowPublishModal,
    setShowShareModal,
  } = useWorkshopOrchestrator(workshopId);

  const canSubmitIntro = story.trim().length > 0 && !pending;
  const canSend = composer.trim().length > 0 && !pending;

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (activeStream) {
      scrollToBottom();
    }
  }, [activeStream]);

  useEffect(() => {
    if (phase === 'chat') {
      composerRef.current?.focus();
    }
  }, [phase]);

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

  const handlePublish = async (metadata: { authorName: string; description: string }) => {
    return await publishBlueprint(metadata);
  };

  const handleDownloadYaml = () => {
    if (!outlineObj) return;

    // Convert to YAML
    const yamlContent = yaml.dump(outlineObj, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });

    // Create blob and download
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = outlineObj.title
      ? `${outlineObj.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.yaml`
      : 'weval.yaml';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-col h-screen">
        {phase === 'intro' ? (
          <div className="flex-1 flex flex-col">
            <WorkshopHeader
              workshopId={workshopId}
              rightContent={
                <Button variant="outline" size="sm" asChild>
                  <a href={`/workshop/${workshopId}/gallery`} target="_blank" rel="noopener noreferrer">
                    <Users className="mr-2 h-4 w-4" />
                    Workshop Gallery
                  </a>
                </Button>
              }
            />

            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <div className="w-full max-w-5xl">
                <div className="text-center mb-12">
                  <h1 className="text-4xl font-bold mb-4">
                    Let's change AI! First step: How has AI affected you?
                  </h1>
                  <p className="text-muted-foreground text-lg">
                    Describe how an AI has affected you, what you want improved, or a goal you care about.
                    We'll help you capture the key points.
                  </p>
                </div>

                <Card className="p-6">
                  <Textarea
                    value={story}
                    onChange={(e) => setStory(e.target.value)}
                    onKeyDown={onIntroKeyDown}
                    className="h-64 resize-vertical text-base mb-4"
                    placeholder="For example: I asked for a summary of a news article, but the AI completely missed the main point and focused on trivial details..."
                  />
                  <div className="flex justify-end">
                    <Button onClick={onSubmitIntro} disabled={!canSubmitIntro} size="lg">
                      Start Conversation
                    </Button>
                  </div>
                </Card>
            </div>
          </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <WorkshopHeader
              workshopId={workshopId}
              rightContent={
                <>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/workshop/${workshopId}/gallery`} target="_blank" rel="noopener noreferrer">
                      <Users className="mr-2 h-4 w-4" />
                      Workshop Gallery
                    </a>
                  </Button>
                  {outlineObj && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadYaml}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download YAML
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={shareBlueprint}
                        disabled={isSharing}
                      >
                        {isSharing ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent mr-2"></div>
                            Sharing...
                          </>
                        ) : (
                          <>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Share this Weval
                          </>
                        )}
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setShowPublishModal(true)}
                        disabled={isPublishing}
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        Publish to Gallery
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={onReset}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Start Over
                  </Button>
                </>
              }
            />
            <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-4 lg:grid-cols-3 gap-4 p-4">
              <div className="xl:col-span-2 lg:col-span-2 flex flex-col min-h-0">
                <Card className="p-0 flex-1 flex flex-col min-h-0">
                  <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((m, idx) => {
                      const isLast = idx === messages.length - 1;
                      const content = isLast && m.role === 'assistant' && activeStream
                        ? activeStream.visibleContent
                        : m.content;
                      const cleanText = m.role === 'assistant' ? ControlSignalHelpers.cleanUserText(content) : content;

                      return (
                        <div
                          key={m.id || `msg-${idx}`}
                          className={cn('flex items-start gap-3', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
                        >
                          <div
                            className={cn(
                              'rounded-full p-2 flex-shrink-0',
                              m.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground border'
                            )}
                          >
                            {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                          </div>
                          <div
                            className={cn(
                              'rounded-lg p-3 max-w-[80%]',
                              m.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-card text-card-foreground border'
                            )}
                          >
                            {/* Show typing indicator if streaming with no/little content */}
                            {isLast && m.role === 'assistant' && activeStream && (!cleanText || cleanText.trim().length < 3) ? (
                              <div className="flex items-center gap-1 py-1">
                                <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"></div>
                              </div>
                            ) : (
                              <div className={cn('prose prose-sm max-w-none prose-inherit', m.role === 'assistant' && 'dark:prose-invert')}>
                                <ResponseRenderer content={cleanText} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Show typing indicator bubble if streaming started but no assistant message yet */}
                    {activeStream && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                      <div className="flex items-start gap-3 flex-row">
                        <div className="rounded-full p-2 flex-shrink-0 bg-muted text-muted-foreground border">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div className="rounded-lg p-3 max-w-[80%] bg-card text-card-foreground border">
                          <div className="flex items-center gap-1 py-1">
                            <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                            <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 border-t p-3 flex gap-2 items-end">
                    <Textarea
                      ref={composerRef}
                      value={composer}
                      onChange={(e) => setComposer(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder={pending ? 'Assistant is typing…' : 'Type your message, or shift+enter for new line'}
                      className="min-h-[60px]"
                      disabled={pending}
                    />
                    <Button onClick={onSend} disabled={!canSend}>
                      Send
                    </Button>
                  </div>
                </Card>
              </div>

              <div className="xl:col-span-2 lg:col-span-1 flex flex-col min-h-0 overflow-y-auto">
                <Card className="p-4 flex-1 flex flex-col min-h-0">
                  <h2 className="text-lg font-medium mb-4 flex-shrink-0">Your Test Plan</h2>

                  {/* Test button - only show when outline exists */}
                  {outlineObj && (
                    <div className="mb-4 flex-shrink-0">
                      <Button
                        variant="default"
                        size="lg"
                        onClick={runQuickTest}
                        disabled={quickRunPending}
                        className="w-full"
                      >
                        {quickRunPending ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-background border-t-transparent mr-2"></div>
                            Testing Your Plan...
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-5 w-5" />
                            Run Quick Test
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Testing status banner */}
                  {quickRunPending && (
                    <div className="mb-4 flex-shrink-0 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{quickRunStatus?.message || 'Running your test...'}</p>
                          <p className="text-xs text-muted-foreground">This may take a moment</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Simple completion banner */}
                  {quickRunResult && !quickRunPending && (
                    <div className="mb-4 flex-shrink-0 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span className="font-medium text-green-900 dark:text-green-100">
                          Test complete! Results shown below.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Quick Run Error */}
                  {quickRunError && !quickRunResult && (
                    <div className="mb-4 flex-shrink-0">
                      <QuickRunFallback
                        onRetry={runQuickTest}
                        onSkip={() => clearErrors()}
                        onGoToSandbox={() => window.open('/sandbox', '_blank')}
                        isRetrying={quickRunPending}
                      />
                    </div>
                  )}

                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {createPending && (
                      <div className="flex flex-col items-center justify-center py-8 px-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mb-3"></div>
                        <p className="text-sm text-muted-foreground text-center">Creating your test plan...</p>
                      </div>
                    )}

                    {/* Test Plan with inline results */}
                    <TestPlanWithResults
                      outline={outlineObj}
                      quickRunResult={quickRunResult}
                    />
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>

      <PublishModal
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        onPublish={handlePublish}
        defaultAuthorName={session?.displayName || ''}
        defaultDescription={outlineObj?.description || ''}
      />

      <ShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareUrl={shareUrl || ''}
      />
    </>
  );
}
