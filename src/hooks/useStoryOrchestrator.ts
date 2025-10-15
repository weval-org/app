/**
 * Custom hook for Story orchestration logic
 * Separates business logic from UI components
 *
 * Uses shared chat orchestration logic from useSharedChatOrchestrator
 */

import { useCallback, useState, useEffect } from 'react';
import { Message, StoryState, StorySessionSummary } from '@/types/story';
import {
  useSharedChatOrchestrator,
  nanoid,
  isSystemInstruction,
  type ChatMessage,
  type SystemInstruction
} from './useSharedChatOrchestrator';

// A logging utility to provide observability during development
const log = (label: string, ...data: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    if (data.length > 0) {
      console.log(`[Story Orchestrator] ${label}`, ...data);
    } else {
      console.log(`[Story Orchestrator] ${label}`);
    }
  }
};

export interface StoryActions {
  startChat: (initialStory: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  runQuickTest: () => Promise<void>;
  clearErrors: () => void;
  resetChat: () => void;
  // Local session persistence helpers
  listSessions: () => StorySessionSummary[];
  loadSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  clearAllSessions: () => void;
}

const initialState: StoryState = {
  messages: [],
  activeStream: null,
  outlineYaml: null,
  outlineObj: null,
  phase: 'intro',
  pending: false,
  createPending: false,
  quickRunPending: false,
  chatError: null,
  createError: null,
  quickRunError: null,
  quickRunResult: null,
  quickRunId: null,
  quickRunStatus: { status: 'idle' },
  sessionId: null,
  startedAt: null,
  updatedAt: null,
  title: null,
};


export function useStoryOrchestrator(): StoryState & StoryActions {
  const [state, setState] = useState<StoryState>(() => {
    log('Initializing state', initialState);
    return initialState;
  });

  const updateState = useCallback((updates: Partial<StoryState>) => {
    log('Updating state with', updates);
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // -----------------------
  // LocalStorage persistence
  // -----------------------
  const STORAGE_PREFIX = 'story_session_v1:';
  const STORAGE_INDEX_KEY = 'story_session_index_v1';

  const generateId = () => Math.random().toString(36).slice(2);

  const getIndex = useCallback((): StorySessionSummary[] => {
    try {
      const raw = localStorage.getItem(STORAGE_INDEX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);

  const putIndex = useCallback((list: StorySessionSummary[]) => {
    try {
      localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(list));
    } catch {}
  }, []);

  const deriveTitle = (messages: Message[], outlineObj: any): string => {
    const firstUser = messages.find(m => m.role === 'user');
    if (outlineObj?.description) return String(outlineObj.description).slice(0, 120);
    if (firstUser?.content) return firstUser.content.slice(0, 120);
    return 'Untitled session';
  };

  const saveSession = useCallback((next: StoryState) => {
    // Do not create or update a session if there is no meaningful content yet
    const hasContent = (next.messages && next.messages.length > 0) || Boolean(next.outlineObj) || Boolean(next.quickRunResult);
    if (!hasContent) {
      return;
    }
    try {
      const id = next.sessionId || generateId();
      const nowIso = new Date().toISOString();
      const startedAt = next.startedAt || nowIso;
      const title = next.title || deriveTitle(next.messages, next.outlineObj);

      const payload: StoryState = { ...next, sessionId: id, startedAt, updatedAt: nowIso, title };
      const key = `${STORAGE_PREFIX}${id}`;
      localStorage.setItem(key, JSON.stringify(payload));

      const index = getIndex();
      const messageCount = payload.messages.length;
      const summary: StorySessionSummary = { id, title, startedAt, updatedAt: nowIso, messageCount };
      const filtered = index.filter(i => i.id !== id);
      const updated = [summary, ...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50);
      putIndex(updated);
    } catch {}
  }, [getIndex, putIndex]);

  const listSessions = useCallback((): StorySessionSummary[] => {
    // Filter out any historical empty entries if they exist
    return getIndex().filter(i => (i.messageCount || 0) > 0);
  }, [getIndex]);

  const loadSession = useCallback((sessionId: string) => {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoryState;
      setState({ ...initialState, ...parsed, pending: false, createPending: false, quickRunPending: false, chatError: null, createError: null, quickRunError: null, activeStream: null });
    } catch {}
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${sessionId}`);
      const idx = getIndex().filter(i => i.id !== sessionId);
      putIndex(idx);
    } catch {}
  }, [getIndex, putIndex]);

  const clearAllSessions = useCallback(() => {
    try {
      const idx = getIndex();
      idx.forEach(i => {
        try { localStorage.removeItem(`${STORAGE_PREFIX}${i.id}`); } catch {}
      });
      putIndex([]);
    } catch {}
  }, [getIndex, putIndex]);

  // Autosave whenever key state changes (debounced to prevent excessive writes)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveSession(state);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [state.messages, state.outlineObj, state.outlineYaml, state.quickRunResult, state.phase, saveSession]);

  // Initialize shared chat orchestrator with Story-specific configuration
  const sharedOrchestrator = useSharedChatOrchestrator({
    uiContext: {
      pageName: 'Story Page',
      pageUrl: typeof window !== 'undefined' ? window.location.href : 'https://weval.org/story',
      availableActions: [
        'Quick Run button (click to test your evaluation with a few models)',
        'Reset button (start over with a new evaluation)',
        'Save sessions (your work is auto-saved to browser storage)'
      ]
    },
    log,
    outlineYaml: state.outlineYaml,
    outlineObj: state.outlineObj,
    quickRunResult: state.quickRunResult,
    quickRunId: state.quickRunId,
    quickRunStatus: state.quickRunStatus,
    setCreatePending: (pending) => updateState({ createPending: pending }),
    setCreateError: (error) => updateState({ createError: error }),
    setOutlineYaml: (yaml) => {
      setState(prev => ({
        ...prev,
        outlineYaml: yaml,
      }));
    },
    setOutlineObj: (obj) => {
      setState(prev => ({
        ...prev,
        outlineObj: obj,
        // Update title when outline is created/updated
        title: (obj?.description ? String(obj.description).slice(0, 120) : prev.title) || prev.title || null,
      }));
    },
    setPending: (pending) => updateState({ pending }),
    setActiveStream: (stream) => updateState({ activeStream: stream }),
    setChatError: (error) => updateState({ chatError: error }),
    setQuickRunPending: (pending) => updateState({ quickRunPending: pending }),
    setQuickRunError: (error) => updateState({ quickRunError: error }),
    setQuickRunResult: (result) => updateState({ quickRunResult: result }),
    setQuickRunId: (id) => updateState({ quickRunId: id }),
    setQuickRunStatus: (status) => updateState({ quickRunStatus: status }),
    addMessage: (message) => {
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, message as Message],
      }));
    },
    setMessages: (updater) => {
      setState(prev => ({
        ...prev,
        messages: updater(prev.messages as ChatMessage[]) as Message[],
      }));
    },
  });

  // Story-specific wrapper for handleStream that adds sanitizeAgencyClaims logic
  const handleStreamWithSanitization = useCallback(async (context: Message[]) => {
    // First, call the shared stream handler
    await sharedOrchestrator.handleStream(context as ChatMessage[]);

    // Then apply Story-specific sanitization to the last message
    setState(prev => {
      const lastMsg = prev.messages[prev.messages.length - 1];
      if (!lastMsg || lastMsg.role !== 'assistant') return prev;

      const sanitizeAgencyClaims = (text: string) => {
        if (!text) return text;
        const claimRegex = /\b(I('|')?ll|I will|we('|')?ll|we will)\s+(start|set up|setup|run|process|kick\s*off|get (it )?started)/i;
        if (claimRegex.test(text)) {
          return `${text}\n\nNote: No evaluation has been started.`;
        }
        return text;
      };

      const sanitizedContent = sanitizeAgencyClaims(lastMsg.content);
      if (sanitizedContent === lastMsg.content) return prev; // No change needed

      const updatedMessages = [...prev.messages];
      updatedMessages[updatedMessages.length - 1] = { ...lastMsg, content: sanitizedContent };

      return {
        ...prev,
        messages: updatedMessages,
      };
    });
  }, [sharedOrchestrator]);

  const startChat = useCallback(async (initialStory: string) => {
    log('Action: startChat', { initialStory });
    const seed: Message = { id: nanoid(), role: 'user' as const, content: initialStory.trim() };
    updateState({ messages: [seed], phase: 'chat', chatError: null, title: initialStory.trim().slice(0, 120) });
    await handleStreamWithSanitization([seed]);
  }, [handleStreamWithSanitization, updateState]);

  const sendMessage = useCallback(async (content: string) => {
    log('Action: sendMessage', { content });
    if (state.pending) return;
    const userMsg: Message = { id: nanoid(), role: 'user' as const, content: content.trim() };
    const newMessages = [...state.messages, userMsg];
    updateState({ messages: newMessages, chatError: null });
    await handleStreamWithSanitization(newMessages);
  }, [state.messages, state.pending, handleStreamWithSanitization, updateState]);

  const runQuickTest = useCallback(async () => {
    log('Action: runQuickTest');
    await sharedOrchestrator.runQuickTest();
  }, [sharedOrchestrator]);

  const clearErrors = useCallback(() => {
    log('Action: clearErrors');
    sharedOrchestrator.clearErrors();
  }, [sharedOrchestrator]);

  const resetChat = useCallback(() => {
    log('Action: resetChat');
    setState(initialState);
  }, [setState]);

  return {
    ...state,
    startChat,
    sendMessage,
    runQuickTest,
    clearErrors,
    resetChat,
    listSessions,
    loadSession,
    deleteSession,
    clearAllSessions,
  };
}
