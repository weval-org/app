/**
 * Custom hook for Story orchestration logic
 * Separates business logic from UI components
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { ControlSignalHelpers } from '@/lib/story-utils/control-signals';
import { StreamingParser } from '@/lib/story-utils/streaming-parser';
import { Message, StoryState, QuickRunStatus } from '@/types/story';

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
  sendCta: (ctaText: string) => Promise<void>;
  runQuickTest: () => Promise<void>;
  clearErrors: () => void;
  resetChat: () => void;
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
    updateState({ pending: true, activeStream: { messageId, visibleContent: '', ctas: [], systemInstructions: null, streamError: null } });

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
      const maybeInstruction = finalParsed.systemInstructions;
    const instruction = isSystemInstruction(maybeInstruction) ? maybeInstruction : null;
    const isNoOpInstruction = instruction?.command === 'NO_OP';
    const ctaCount = finalParsed.ctas?.length || 0;
    log('Stream: finalized', { hadVisible, ctaCount, hasInstruction: Boolean(instruction), instructionCmd: instruction?.command });

    if (hadVisible) {
        const sanitizeAgencyClaims = (text: string, instr: SystemInstruction | null) => {
          if (!text) return text;
          const claimRegex = /\b(I('|’)?ll|I will|we('|’)?ll|we will)\s+(start|set up|setup|run|process|kick\s*off|get (it )?started)/i;
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
        ctas: finalParsed.ctas.length > 0 ? finalParsed.ctas : undefined,
      };
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, finalMessage],
        activeStream: null,
      }));
      } else {
        // No visible content: if there are CTAs but no text, still show a minimal bubble so CTAs render.
        // If there are no CTAs and either no instruction OR a NO_OP instruction, append a friendly fallback line.
        const hasCtas = ctaCount > 0;
        const fallbackText = hasCtas
          ? 'Here are some options you can try:'
          : 'I received your message but did not produce a visible reply. Please try rephrasing.';

        if (!instruction || isNoOpInstruction) {
          const finalMessage: Message = {
            id: messageId,
            role: 'assistant',
            content: fallbackText,
            ctas: hasCtas ? finalParsed.ctas : undefined,
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
    updateState({ messages: [seed], phase: 'chat', chatError: null });
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


const sendCta = useCallback(async (ctaText: string) => {
  log('Action: sendCta', { ctaText });
  if (/run a quick test/i.test(ctaText)) {
    await runQuickTest();
  } else {
    await sendMessage(ctaText);
  }
}, [sendMessage, runQuickTest]);

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
    sendCta,
    runQuickTest,
    clearErrors,
    resetChat,
  };
}
