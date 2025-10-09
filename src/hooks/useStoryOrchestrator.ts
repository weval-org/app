/**
 * Custom hook for Story orchestration logic
 * Separates business logic from UI components
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { ControlSignalHelpers } from '@/lib/story-utils/control-signals';
import { StreamingParser } from '@/lib/story-utils/streaming-parser';
import { Message, StoryState, QuickRunStatus, StorySessionSummary } from '@/types/story';

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

// Dependency-free ID generator
const nanoid = () => Math.random().toString(36).substring(2);

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

// Type guard for system instructions
type SystemInstruction = {
  command: 'CREATE_OUTLINE' | 'UPDATE_OUTLINE' | 'NO_OP';
  payload?: any;
};

function isSystemInstruction(obj: any): obj is SystemInstruction {
  return obj && typeof obj.command === 'string';
}


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

  // Autosave whenever key state changes (throttle by microtask to coalesce bursts)
  useEffect(() => {
    const toSave = state;
    Promise.resolve().then(() => saveSession(toSave));
  }, [state.messages, state.outlineObj, state.outlineYaml, state.quickRunResult, state.phase]);

  const callCreate = useCallback(async (summary: string) => {
    log('API Call: /api/story/create', { summary });
    const res = await fetch('/api/story/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    });
    if (!res.ok) throw new Error('Create API failed');
    return await res.json() as { yaml?: string; data?: any };
  }, []);

  const callUpdate = useCallback(async (currentJson: any, guidance: string) => {
    log('API Call: /api/story/update', { currentJson, guidance });
    const res = await fetch('/api/story/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentJson, guidance }),
    });
    if (!res.ok) throw new Error('Update API failed');
    return await res.json() as { yaml?: string; data?: any };
  }, []);

  const callQuickRun = useCallback(async (outline: any) => {
    log('API Call: /api/story/quick-run', outline);
    const res = await fetch('/api/story/quick-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outline }),
    });
    if (!res.ok) throw new Error('Quick run failed');
    const data = await res.json();
    return data?.result;
  }, []);


  const handleSystemInstruction = useCallback(async (instruction: SystemInstruction, opts?: { synthesizeIfEmpty?: boolean }) => {
    log('Handling system instruction', instruction);
    switch (instruction.command) {
      case 'CREATE_OUTLINE':
        updateState({ createPending: true, createError: null });
        try {
          const out = await callCreate(instruction.payload.summary);
          updateState({
            outlineYaml: String(out.yaml || ''),
            outlineObj: out.data || null,
            title: (out?.data?.description ? String(out.data.description).slice(0, 120) : undefined) || undefined,
          });
          // If the visible chat content was empty, synthesize a concise confirmation message
          if (opts?.synthesizeIfEmpty) {
            setState(prev => ({
              ...prev,
              messages: [...prev.messages, { id: nanoid(), role: 'assistant' as const, content: 'Created a draft evaluation outline.' }],
            }));
          }
        } catch (e) {
          log('Error creating outline', e);
          updateState({ createError: 'Failed to create evaluation outline.' });
        } finally {
          updateState({ createPending: false });
        }
        break;

      case 'UPDATE_OUTLINE':
        if (!state.outlineObj) return;
        updateState({ createPending: true });
        try {
          const updated = await callUpdate(state.outlineObj, instruction.payload.guidance);
          const confirmationAndSuggestion = `I have updated the evaluation outline.`;
          setState(prev => ({
            ...prev,
            outlineObj: updated.data || null,
            outlineYaml: String(updated.yaml || ''),
            title: (updated?.data?.description ? String(updated.data.description).slice(0, 120) : prev.title) || prev.title || null,
            messages: [...prev.messages, { id: nanoid(), role: 'assistant' as const, content: confirmationAndSuggestion }],
          }));
        } catch (e) {
          log('Error updating outline', e);
          updateState({ messages: [...state.messages, { id: nanoid(), role: 'assistant' as const, content: 'Sorry - I could not update the evaluation this time.' }] });
        } finally {
          updateState({ createPending: false });
        }
        break;
        
      case 'NO_OP':
        // Do nothing
        break;
    }
  }, [state.outlineObj, state.messages, callCreate, callUpdate, updateState]);


  const handleStream = useCallback(async (context: Message[]) => {
    const messageId = nanoid();
    updateState({ pending: true, activeStream: { messageId, visibleContent: '', systemInstructions: null, streamError: null } });

    try {
      log('Stream: starting /api/story/chat', { contextLen: context.length, hasOutline: Boolean(state.outlineYaml), hasQuickRunResult: Boolean(state.quickRunResult) });
      const res = await fetch('/api/story/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: context, 
          blueprintYaml: state.outlineYaml,
          quickRunResult: state.quickRunResult,
          debugStreamDelayMs: process.env.NODE_ENV === 'development' ? 50 : undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Chat stream API failed');
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = new StreamingParser();

      let done = false;
      let chunkCount = 0;
      let totalBytes = 0;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunk = decoder.decode(value, { stream: true });
        
        if (chunk) {
          chunkCount += 1;
          totalBytes += chunk.length;
          const parsed = parser.ingest(chunk);
          updateState({ activeStream: { messageId, ...parsed } });
          if (parsed.streamError) throw new Error(parsed.streamError);
        }
      }

      const finalParsed = parser.finalize();
    const hadVisible = (finalParsed.visibleContent || '').trim().length > 0;
    const hadError = !!finalParsed.streamError;
      const maybeInstruction = finalParsed.systemInstructions;
    const instruction = isSystemInstruction(maybeInstruction) ? maybeInstruction : null;
    const isNoOpInstruction = instruction?.command === 'NO_OP';
    log('Stream: finalized', { hadVisible, hadError, hasInstruction: Boolean(instruction), instructionCmd: instruction?.command });

    // If there was a stream error, show it to the user
    if (hadError) {
      const errorMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: finalParsed.streamError || 'An error occurred while processing your message.',
      };
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, errorMessage],
        activeStream: null,
        chatError: finalParsed.streamError || 'Stream error',
      }));
      return; // Don't process instructions if there was an error
    }

    if (hadVisible) {
        const sanitizeAgencyClaims = (text: string, instr: SystemInstruction | null) => {
          if (!text) return text;
          const claimRegex = /\b(I('|')?ll|I will|we('|')?ll|we will)\s+(start|set up|setup|run|process|kick\s*off|get (it )?started)/i;
          if (claimRegex.test(text) && (!instr || instr.command === 'NO_OP')) {
            return `${text}\n\nNote: No evaluation has been started.`;
          }
          return text;
        };
        const safeVisible = sanitizeAgencyClaims(finalParsed.visibleContent, instruction);
      const finalMessage: Message = {
        id: messageId,
        role: 'assistant',
          content: safeVisible,
      };
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, finalMessage],
        activeStream: null,
      }));
      } else {
        // No visible content: if there's no instruction OR a NO_OP instruction, append a friendly fallback message.
        const fallbackText = 'I received your message but did not produce a visible reply. Please try rephrasing.';

        if (!instruction || isNoOpInstruction) {
          const finalMessage: Message = {
            id: messageId,
            role: 'assistant',
            content: fallbackText,
          };
          setState(prev => ({
            ...prev,
            messages: [...prev.messages, finalMessage],
            activeStream: null,
          }));
        } else {
          // Non-NO_OP instruction will be handled below; just clear active stream here.
          setState(prev => ({
            ...prev,
            activeStream: null,
          }));
        }
      }

    // Handle instructions after stream is complete. If there was no visible text,
    // request the handler to synthesize a short confirmation message instead.
    if (instruction) {
      await handleSystemInstruction(instruction, { synthesizeIfEmpty: !hadVisible && !isNoOpInstruction });
    }

    } catch (e) {
      log('Error during stream handling', e);
      const errorMsg = { id: nanoid(), role: 'assistant' as const, content: 'Sorry, something went wrong. Please try again.' };
      setState(prev => ({
        ...prev,
        chatError: (e as Error)?.message || 'Sorry, something went wrong.',
        messages: [...prev.messages, errorMsg],
        activeStream: null,
      }));
    } finally {
      updateState({ pending: false });
    }
  }, [state.outlineYaml, handleSystemInstruction]);

  const startChat = useCallback(async (initialStory: string) => {
    log('Action: startChat', { initialStory });
    const seed: Message = { id: nanoid(), role: 'user' as const, content: initialStory.trim() };
    updateState({ messages: [seed], phase: 'chat', chatError: null, title: initialStory.trim().slice(0, 120) });
    await handleStream([seed]);
  }, [handleStream]);

  const sendMessage = useCallback(async (content: string) => {
    log('Action: sendMessage', { content });
    if (state.pending) return;
    const userMsg: Message = { id: nanoid(), role: 'user' as const, content: content.trim() };
    const newMessages = [...state.messages, userMsg];
    updateState({ messages: newMessages, chatError: null });
    await handleStream(newMessages);
  }, [state.messages, state.pending, handleStream]);

  const runQuickTest = useCallback(async () => {
    log('Action: runQuickTest');
    if (!state.outlineObj) return;
    
    updateState({ 
      quickRunPending: true, 
      quickRunError: null,
      quickRunResult: null,
      quickRunId: null,
      quickRunStatus: { status: 'pending', message: 'Initiating evaluation...' },
    });
    
    try {
      const res = await fetch('/api/story/quick-run/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline: state.outlineObj }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start the quick test.');
      }
      
      updateState({ quickRunId: data.runId });

    } catch (e) {
        log('Error in runQuickTest (start)', e);
        updateState({
          quickRunError: 'Failed to start the test. Please try again.',
          quickRunPending: false,
          quickRunStatus: { status: 'error', message: 'Failed to start the test.' },
        });
    }
  }, [state.outlineObj, updateState]);


useEffect(() => {
  const { quickRunId, quickRunStatus } = state;
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
      const newStatus: QuickRunStatus = await res.json();
      
      setState(prev => {
        const nextState = { ...prev, quickRunStatus: newStatus };

        if (newStatus.status === 'complete') {
          nextState.quickRunResult = newStatus.result;
          nextState.quickRunPending = false;
          nextState.quickRunError = null;
        } else if (newStatus.status === 'error') {
          nextState.quickRunError = newStatus.message || 'The test failed.';
          nextState.quickRunPending = false;
        }

        return nextState;
      });

    } catch (e) {
      log('Error during status poll', e);
      setState(prev => ({
        ...prev,
        quickRunStatus: { status: 'error', message: 'Failed to get test status.' },
        quickRunError: 'Could not retrieve test status. Please try again.',
        quickRunPending: false,
      }));
    }
  };

  const intervalId = setInterval(poll, 3000);
  poll(); 

  return () => clearInterval(intervalId);

}, [state.quickRunId, state.quickRunStatus?.status, setState]);


  const clearErrors = useCallback(() => {
    log('Action: clearErrors');
    updateState({ chatError: null, createError: null, quickRunError: null });
  }, [updateState]);

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
