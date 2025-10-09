/**
 * useWorkshopOrchestrator Hook
 *
 * Manages workshop session, blueprint creation, publishing, and runs.
 * Uses EXACT same logic as useStoryOrchestrator for chat and blueprint creation.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  ensureWorkshopSession,
  getWorkshopSession,
  saveWorkshopSession,
  getStoredDisplayName,
  saveDisplayName,
  WorkshopPaths,
  saveWorkshopState,
  getWorkshopState,
  clearWorkshopState,
} from '@/lib/workshop-utils';
import type { WorkshopSession } from '@/types/workshop';
import { StreamingParser } from '@/lib/story-utils/streaming-parser';
import { ControlSignalHelpers } from '@/lib/story-utils/control-signals';

export interface WorkshopMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface WorkshopState {
  messages: WorkshopMessage[];
  outlineObj: any | null;
  outlineYaml: string | null;
  phase: 'intro' | 'chat';
  pending: boolean;
  createPending: boolean;
  quickRunPending: boolean;
  chatError: string | null;
  createError: string | null;
  quickRunError: string | null;
  quickRunResult: any | null;
  quickRunId: string | null;
  quickRunStatus: { status: string; message?: string; result?: any };
  sessionId: string | null;
  displayName: string | null;
  workshopId: string;
}

// System instruction type (same as Story)
type SystemInstruction = {
  command: 'CREATE_OUTLINE' | 'UPDATE_OUTLINE' | 'NO_OP';
  payload?: any;
};

function isSystemInstruction(obj: any): obj is SystemInstruction {
  return obj && typeof obj.command === 'string';
}

// ID generator
const nanoid = () => Math.random().toString(36).substring(2);

export function useWorkshopOrchestrator(workshopId: string) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<WorkshopMessage[]>([]);
  const [outlineObj, setOutlineObj] = useState<any | null>(null);
  const [outlineYaml, setOutlineYaml] = useState<string | null>(null);
  const [phase, setPhase] = useState<'intro' | 'chat'>('intro');
  const [pending, setPending] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [quickRunPending, setQuickRunPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [quickRunError, setQuickRunError] = useState<string | null>(null);
  const [quickRunResult, setQuickRunResult] = useState<any | null>(null);
  const [quickRunId, setQuickRunId] = useState<string | null>(null);
  const [quickRunStatus, setQuickRunStatus] = useState<{ status: string; message?: string; result?: any }>({ status: 'idle' });
  const [activeStream, setActiveStream] = useState<any>(null);
  const [session, setSession] = useState<WorkshopSession | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Auto-create session on mount (client-side only, no server call)
  useEffect(() => {
    const existingSession = getWorkshopSession(workshopId);

    if (existingSession) {
      setSession(existingSession);
    } else {
      // Auto-create session client-side (no friction, no registration required)
      const newSession: WorkshopSession = {
        sessionId: `ws_${nanoid()}`,
        workshopId,
        displayName: null,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      setSession(newSession);
      saveWorkshopSession(newSession);
    }
  }, [workshopId]);

  // Auto-load saved state on mount
  useEffect(() => {
    const savedState = getWorkshopState(workshopId);
    if (savedState && savedState.messages.length > 0) {
      setMessages(savedState.messages);
      setOutlineObj(savedState.outlineObj);
      setOutlineYaml(savedState.outlineYaml);
      setPhase(savedState.phase);
      setQuickRunResult(savedState.quickRunResult);
    }
  }, [workshopId]);

  // Auto-save state when key values change
  useEffect(() => {
    // Throttle saves by using Promise.resolve to batch rapid changes
    const timeoutId = setTimeout(() => {
      saveWorkshopState(workshopId, {
        messages,
        outlineObj,
        outlineYaml,
        phase,
        quickRunResult,
      });
    }, 500); // Debounce saves by 500ms

    return () => clearTimeout(timeoutId);
  }, [workshopId, messages, outlineObj, outlineYaml, phase, quickRunResult]);

  /**
   * API Helpers (same as Story)
   */
  const callCreate = useCallback(async (summary: string) => {
    const res = await fetch('/api/story/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    });
    if (!res.ok) throw new Error('Create API failed');
    return await res.json() as { yaml?: string; data?: any };
  }, []);

  const callUpdate = useCallback(async (currentJson: any, guidance: string) => {
    const res = await fetch('/api/story/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentJson, guidance }),
    });
    if (!res.ok) throw new Error('Update API failed');
    return await res.json() as { yaml?: string; data?: any };
  }, []);

  /**
   * Handle system instructions from AI (same as Story)
   */
  const handleSystemInstruction = useCallback(async (instruction: SystemInstruction, opts?: { synthesizeIfEmpty?: boolean }) => {
    switch (instruction.command) {
      case 'CREATE_OUTLINE':
        setCreatePending(true);
        setCreateError(null);
        try {
          const out = await callCreate(instruction.payload.summary);
          setOutlineYaml(String(out.yaml || ''));
          setOutlineObj(out.data || null);

          // If the visible chat content was empty, synthesize a confirmation message
          if (opts?.synthesizeIfEmpty) {
            setMessages(prev => [...prev, {
              id: nanoid(),
              role: 'assistant',
              content: 'Created a draft evaluation outline.'
            }]);
          }
        } catch (e) {
          console.error('Error creating outline', e);
          setCreateError('Failed to create evaluation outline.');
        } finally {
          setCreatePending(false);
        }
        break;

      case 'UPDATE_OUTLINE':
        if (!outlineObj) return;
        setCreatePending(true);
        try {
          const updated = await callUpdate(outlineObj, instruction.payload.guidance);
          setOutlineObj(updated.data || null);
          setOutlineYaml(String(updated.yaml || ''));
          setMessages(prev => [...prev, {
            id: nanoid(),
            role: 'assistant',
            content: 'I have updated the evaluation outline.'
          }]);
        } catch (e) {
          console.error('Error updating outline', e);
          setMessages(prev => [...prev, {
            id: nanoid(),
            role: 'assistant',
            content: 'Sorry - I could not update the evaluation this time.'
          }]);
        } finally {
          setCreatePending(false);
        }
        break;

      case 'NO_OP':
        // Do nothing
        break;
    }
  }, [outlineObj, callCreate, callUpdate]);


  /**
   * Handle streaming response (same as Story)
   */
  const handleStream = useCallback(async (context: WorkshopMessage[]) => {
    const messageId = nanoid();
    setPending(true);
    setActiveStream({ messageId, visibleContent: '', systemInstructions: null, streamError: null });

    try {
      const res = await fetch('/api/story/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: context,
          blueprintYaml: outlineYaml,
          quickRunResult: quickRunResult,
          uiContext: {
            pageName: 'Workshop',
            pageUrl: typeof window !== 'undefined' ? window.location.href : `https://weval.org/workshop/${workshopId}`,
            availableActions: [
              'Share button (top right - creates a shareable link without publishing to gallery)',
              'Publish button (top right - publishes to workshop gallery with your name)',
              'Quick Run button (test your evaluation with a few models)',
              'Gallery link (view all published evaluations in this workshop)'
            ]
          },
        }),
      });

      if (!res.ok || !res.body) throw new Error('Chat stream API failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = new StreamingParser();

      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunk = decoder.decode(value, { stream: true });

        if (chunk) {
          const parsed = parser.ingest(chunk);
          setActiveStream({ messageId, ...parsed });
          if (parsed.streamError) throw new Error(parsed.streamError);
        }
      }

      const finalParsed = parser.finalize();
      const hadVisible = (finalParsed.visibleContent || '').trim().length > 0;
      const hadError = !!finalParsed.streamError;
      const maybeInstruction = finalParsed.systemInstructions;
      const instruction = isSystemInstruction(maybeInstruction) ? maybeInstruction : null;
      const isNoOpInstruction = instruction?.command === 'NO_OP';

      // If there was a stream error, show it to the user
      if (hadError) {
        const errorMessage: WorkshopMessage = {
          id: messageId,
          role: 'assistant',
          content: finalParsed.streamError || 'An error occurred while processing your message.',
        };
        setMessages(prev => [...prev, errorMessage]);
        setActiveStream(null);
        setChatError(finalParsed.streamError || 'Stream error');
        return; // Don't process instructions if there was an error
      }

      if (hadVisible) {
        const finalMessage: WorkshopMessage = {
          id: messageId,
          role: 'assistant',
          content: finalParsed.visibleContent,
        };
        setMessages(prev => [...prev, finalMessage]);
        setActiveStream(null);
      } else {
        // No visible content
        const fallbackText = 'I received your message but did not produce a visible reply. Please try rephrasing.';

        if (!instruction || isNoOpInstruction) {
          const finalMessage: WorkshopMessage = {
            id: messageId,
            role: 'assistant',
            content: fallbackText,
          };
          setMessages(prev => [...prev, finalMessage]);
          setActiveStream(null);
        } else {
          setActiveStream(null);
        }
      }

      // Handle instructions after stream is complete
      if (instruction) {
        await handleSystemInstruction(instruction, { synthesizeIfEmpty: !hadVisible && !isNoOpInstruction });
      }
    } catch (e: any) {
      console.error('Error during stream handling', e);
      const errorMsg: WorkshopMessage = {
        id: nanoid(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.'
      };
      setMessages(prev => [...prev, errorMsg]);
      setActiveStream(null);
      setChatError(e.message);
    } finally {
      setPending(false);
    }
  }, [outlineYaml, quickRunResult, workshopId, handleSystemInstruction]);

  /**
   * Start chat (same as Story)
   */
  const startChat = useCallback(async (initialStory: string) => {
    if (!session) {
      toast({
        variant: 'destructive',
        title: 'No session',
        description: 'Please create or recover a session first.',
      });
      return;
    }

    const seed: WorkshopMessage = {
      id: nanoid(),
      role: 'user',
      content: initialStory.trim()
    };
    setMessages([seed]);
    setPhase('chat');
    setChatError(null);
    await handleStream([seed]);
  }, [session, toast, handleStream]);

  /**
   * Send message in chat (same as Story)
   */
  const sendMessage = useCallback(async (content: string) => {
    if (!session || pending) return;

    const userMsg: WorkshopMessage = {
      id: nanoid(),
      role: 'user',
      content: content.trim()
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setChatError(null);
    await handleStream(newMessages);
  }, [session, messages, pending, handleStream]);

  /**
   * Run quick test (same as Story)
   */
  const runQuickTest = useCallback(async () => {
    if (!outlineObj) return;

    setQuickRunPending(true);
    setQuickRunError(null);
    setQuickRunResult(null);
    setQuickRunId(null);
    setQuickRunStatus({ status: 'pending', message: 'Initiating evaluation...' });

    try {
      const res = await fetch('/api/story/quick-run/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline: outlineObj }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start the quick test.');
      }

      setQuickRunId(data.runId);
    } catch (e: any) {
      console.error('Error in runQuickTest (start)', e);
      setQuickRunError('Failed to start the test. Please try again.');
      setQuickRunPending(false);
      setQuickRunStatus({ status: 'error', message: 'Failed to start the test.' });
    }
  }, [outlineObj]);

  // Poll for quick run status (same as Story)
  useEffect(() => {
    const inProgress = ['pending', 'generating_responses', 'evaluating'].includes(quickRunStatus?.status);

    if (!quickRunId || !inProgress) {
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/story/quick-run/status/${quickRunId}`);
        if (res.status === 202 || res.status === 404) {
          return;
        }
        if (!res.ok) {
          throw new Error(`Status check failed with status ${res.status}`);
        }
        const newStatus: any = await res.json();

        if (newStatus.status === 'complete') {
          setQuickRunResult(newStatus.result);
          setQuickRunPending(false);
          setQuickRunError(null);
          setQuickRunStatus(newStatus);
        } else if (newStatus.status === 'error') {
          setQuickRunError(newStatus.message || 'The test failed.');
          setQuickRunPending(false);
          setQuickRunStatus(newStatus);
        } else {
          setQuickRunStatus(newStatus);
        }
      } catch (err: any) {
        console.error('Error polling quick run status', err);
        setQuickRunError('Failed to check test status.');
        setQuickRunPending(false);
        setQuickRunStatus({ status: 'error', message: 'Failed to check test status.' });
      }
    };

    poll();
    const interval = setInterval(poll, 2000);

    return () => clearInterval(interval);
  }, [quickRunId, quickRunStatus?.status]);

  /**
   * Clear errors
   */
  const clearErrors = useCallback(() => {
    setChatError(null);
    setCreateError(null);
    setQuickRunError(null);
  }, []);

  /**
   * Publish blueprint to workshop gallery with name, starts evaluation
   */
  const publishBlueprint = useCallback(async (metadata: { authorName: string; description: string }) => {
    if (!session || !outlineObj) {
      toast({
        variant: 'destructive',
        title: 'Cannot publish',
        description: 'Missing session or blueprint.',
      });
      return null;
    }

    setIsPublishing(true);

    try {
      // Update display name in session if provided
      if (metadata.authorName && metadata.authorName !== session.displayName) {
        const updatedSession = {
          ...session,
          displayName: metadata.authorName,
        };
        setSession(updatedSession);
        saveWorkshopSession(updatedSession);
        saveDisplayName(metadata.authorName);
      }

      // Publish the weval
      const response = await fetch('/api/workshop/weval/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workshopId,
          sessionId: session.sessionId,
          blueprint: outlineObj,
          authorName: metadata.authorName,
          description: metadata.description,
          inGallery: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to publish blueprint');
      }

      const data = await response.json();

      toast({
        title: 'Published to Gallery!',
        description: 'Your evaluation is running and will appear in the gallery.',
      });

      return data;
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to publish',
        description: error.message,
      });
      return null;
    } finally {
      setIsPublishing(false);
      setShowPublishModal(false);
    }
  }, [session, outlineObj, workshopId, toast]);

  /**
   * Share blueprint - creates a read-only link without requiring name, starts evaluation
   */
  const shareBlueprint = useCallback(async () => {
    if (!session || !outlineObj) {
      toast({
        variant: 'destructive',
        title: 'Cannot share',
        description: 'Missing session or blueprint.',
      });
      return null;
    }

    setIsSharing(true);

    try {
      const response = await fetch('/api/workshop/weval/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workshopId,
          sessionId: session.sessionId,
          blueprint: outlineObj,
          authorName: 'Anonymous',
          description: outlineObj.description || 'No description',
          inGallery: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to share blueprint');
      }

      const data = await response.json();

      setShareUrl(data.wevalUrl);
      setShowShareModal(true);

      toast({
        title: 'Evaluation Started',
        description: 'Your test plan is being evaluated. Share the link!',
      });

      return data;
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to share',
        description: error.message,
      });
      return null;
    } finally {
      setIsSharing(false);
    }
  }, [session, outlineObj, workshopId, toast]);

  /**
   * Reset chat
   */
  const resetChat = useCallback(() => {
    setMessages([]);
    setOutlineObj(null);
    setOutlineYaml(null);
    setPhase('intro');
    setChatError(null);
    setCreateError(null);
    setQuickRunError(null);
    setQuickRunResult(null);
    setQuickRunId(null);
    setQuickRunStatus({ status: 'idle' });
    setActiveStream(null);

    // Also clear saved state from localStorage
    clearWorkshopState(workshopId);
  }, [workshopId]);

  return {
    // State
    messages,
    outlineObj,
    outlineYaml,
    phase,
    pending,
    createPending,
    quickRunPending,
    chatError,
    createError,
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

    // Actions
    startChat,
    sendMessage,
    runQuickTest,
    clearErrors,
    publishBlueprint,
    shareBlueprint,
    resetChat,
    setShowPublishModal,
    setShowShareModal,
  };
}
