/**
 * useWorkshopOrchestrator Hook
 *
 * Manages workshop session, blueprint creation, publishing, and runs.
 * Uses shared chat orchestration logic from useSharedChatOrchestrator.
 */

import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  getWorkshopSession,
  saveWorkshopSession,
  saveDisplayName,
  saveWorkshopState,
  getWorkshopState,
  clearWorkshopState,
} from '@/lib/workshop-utils';
import type { WorkshopSession } from '@/types/workshop';
import {
  useSharedChatOrchestrator,
  nanoid,
  type ChatMessage
} from './useSharedChatOrchestrator';
import type { QuickRunStatus } from '@/types/story';

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
  quickRunStatus: QuickRunStatus;
  sessionId: string | null;
  displayName: string | null;
  workshopId: string;
}

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
  const [quickRunStatus, setQuickRunStatus] = useState<QuickRunStatus>({ status: 'idle' });
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

  // Initialize shared chat orchestrator with Workshop-specific configuration
  const sharedOrchestrator = useSharedChatOrchestrator({
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
    log: () => {}, // Workshop doesn't use logging (could add if needed)
    outlineYaml,
    outlineObj,
    quickRunResult,
    quickRunId,
    quickRunStatus,
    setCreatePending,
    setCreateError,
    setOutlineYaml,
    setOutlineObj,
    setPending,
    setActiveStream,
    setChatError,
    setQuickRunPending,
    setQuickRunError,
    setQuickRunResult,
    setQuickRunId,
    setQuickRunStatus,
    addMessage: (message) => {
      setMessages(prev => [...prev, message as WorkshopMessage]);
    },
    setMessages: (updater) => {
      setMessages(prev => updater(prev as ChatMessage[]) as WorkshopMessage[]);
    },
  });

  /**
   * Start chat - uses shared orchestrator
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
    await sharedOrchestrator.handleStream([seed] as ChatMessage[]);
  }, [session, toast, sharedOrchestrator]);

  /**
   * Send message in chat - uses shared orchestrator
   */
  const sendMessage = useCallback(async (content: string) => {
    if (!session || pending) return;

    setChatError(null);

    setMessages(prev => {
      const userMsg: WorkshopMessage = {
        id: nanoid(),
        role: 'user',
        content: content.trim()
      };
      const newMessages = [...prev, userMsg];
      sharedOrchestrator.handleStream(newMessages as ChatMessage[]);
      return newMessages;
    });
  }, [session, pending, sharedOrchestrator]);

  /**
   * Run quick test - uses shared orchestrator
   */
  const runQuickTest = useCallback(async () => {
    await sharedOrchestrator.runQuickTest();
  }, [sharedOrchestrator]);

  /**
   * Clear errors - uses shared orchestrator
   */
  const clearErrors = useCallback(() => {
    sharedOrchestrator.clearErrors();
  }, [sharedOrchestrator]);

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
