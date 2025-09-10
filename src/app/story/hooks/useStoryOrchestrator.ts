/**
 * Custom hook for Story orchestration logic
 * Separates business logic from UI components
 */

import { useCallback, useState } from 'react';
import { ControlSignalHelpers } from '@/app/api/story/utils/control-signals';

// A logging utility to provide observability during development
const log = (label: string, ...data: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    // Using console.group for better organization of logs
    if (data) {
      console.log(`[Story Orchestrator] ${label}`, data.map(d => JSON.stringify(d)));
    } else {
      console.log(`[Story Orchestrator] ${label}`);
    }
  }
};

export type Message = { role: 'user' | 'assistant'; content: string };

export interface StoryState {
  messages: Message[];
  outlineYaml: string | null;
  outlineObj: any | null;
  phase: 'intro' | 'chat';
  pending: boolean;
  createPending: boolean;
  quickRunPending: boolean;
  chatError: string | null;
  createError: string | null;
  quickRunError: string | null;
}

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
  outlineYaml: null,
  outlineObj: null,
  phase: 'intro',
  pending: false,
  createPending: false,
  quickRunPending: false,
  chatError: null,
  createError: null,
  quickRunError: null,
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

  const proactivelySuggestQuickTest = useCallback(() => {
    const suggestion = `If you are happy with this outline, I can run a quick test now. ${ControlSignalHelpers.wrapCta('Run a quick test')}`;
    // Use functional update to prevent race conditions with other state updates
    setState(prevState => {
      const newMessages = [...prevState.messages, { role: 'assistant' as const, content: suggestion }];
      log('Proactively suggesting quick test', { newMessages });
      return { ...prevState, messages: newMessages };
    });
  }, []);

  const callChat = useCallback(async (msgs: Message[], hiddenYaml?: string | null) => {
    log('API Call: /api/story/chat', { messages: msgs, blueprintYaml: hiddenYaml || undefined });
    const res = await fetch('/api/story/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs, blueprintYaml: hiddenYaml || undefined }),
    });
    if (!res.ok) {
      log('API Error: /api/story/chat', res);
      throw new Error('Chat API failed');
    }
    const data = await res.json();
    log('API Response: /api/story/chat', data);
    return String(data.reply || '');
  }, []);

  const callCreate = useCallback(async (msgs: Message[]) => {
    log('API Call: /api/story/create', msgs);
    const res = await fetch('/api/story/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs }),
    });
    if (!res.ok) {
      log('API Error: /api/story/create', res);
      throw new Error('Create API failed');
    }
    const result = await res.json() as { yaml?: string; sanitized?: boolean; data?: any };
    log('API Response: /api/story/create', result);
    return result;
  }, []);

  const callUpdate = useCallback(async (currentJson: any, guidance: string) => {
    log('API Call: /api/story/update', { currentJson, guidance });
    const res = await fetch('/api/story/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentJson, guidance }),
    });
    if (!res.ok) {
      log('API Error: /api/story/update', res);
      throw new Error('Update API failed');
    }
    const result = await res.json() as { yaml?: string; data?: any };
    log('API Response: /api/story/update', result);
    return result;
  }, []);

  const callQuickRun = useCallback(async (outline: any) => {
    log('API Call: /api/story/quick-run', outline);
    const res = await fetch('/api/story/quick-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outline }),
    });
    if (!res.ok) {
      log('API Error: /api/story/quick-run', res);
      throw new Error('Quick run failed');
    }
    const data = await res.json();
    log('API Response: /api/story/quick-run', data);
    return data?.result;
  }, []);

  const handleReply = useCallback(async (reply: string, context: Message[]) => {
    log('Handling reply', { reply, context });

    const hasReady = ControlSignalHelpers.hasReadySignal(reply);
    const hasUpdate = ControlSignalHelpers.hasUpdateSignal(reply);

    // FIX: Use the 'context' which has the latest user message, instead of stale 'state.messages'.
    // This prevents the race condition that was causing the user's first message to disappear.
    updateState({ messages: [...context, { role: 'assistant' as const, content: reply }] });

    if (hasReady) {
      log('Reply has READY signal. Creating outline...');
      updateState({ createPending: true, createError: null });
      try {
        const out = await callCreate([...context, { role: 'assistant' as const, content: reply }]);
        updateState({
          outlineYaml: String(out.yaml || ''),
          outlineObj: out.data || null,
          createError: null,
        });
        proactivelySuggestQuickTest();
      } catch (e) {
        log('Error creating outline', e);
        updateState({ createError: 'Failed to create evaluation outline.' });
      } finally {
        updateState({ createPending: false });
      }
    } else if (hasUpdate && state.outlineObj) {
      log('Reply has UPDATE signal. Updating outline...');
      updateState({ createPending: true });
      try {
        const guidance = ControlSignalHelpers.cleanText(reply);
        const updated = await callUpdate(state.outlineObj, guidance);
        updateState({
          outlineObj: updated.data || null,
          outlineYaml: String(updated.yaml || ''),
        });
        const newMessages = [...state.messages, { role: 'assistant' as const, content: 'I have updated the evaluation outline.' }];
        updateState({ messages: newMessages });
        proactivelySuggestQuickTest();
      } catch (e) {
        log('Error updating outline', e);
        updateState({ messages: [...state.messages, { role: 'assistant' as const, content: 'Sorry - I could not update the evaluation this time.' }] });
      } finally {
        updateState({ createPending: false });
      }
    } else {
      // Fallback auto-creation after 2 user turns
      const userTurns = context.filter(m => m.role === 'user').length;
      if (userTurns >= 2 && !state.outlineYaml && !state.createPending) {
        log('Auto-creating outline after >= 2 user turns.');
        const notice = "Okay, I will start drafting a couple of simple prompts based on what you have shared.";
        
        // FIX: Use the 'context' to avoid overwriting messages from a stale state reference.
        updateState({ messages: [...context, { role: 'assistant' as const, content: notice }], createPending: true });
        
        try {
          const out = await callCreate([...context, { role: 'assistant' as const, content: notice }]);
          updateState({
            outlineYaml: String(out.yaml || ''),
            outlineObj: out.data || null,
            createError: null,
          });
          // Ensure the proactive suggestion is called in this path as well.
          proactivelySuggestQuickTest();
        } catch (e) {
          log('Error during auto-creation', e);
          updateState({ createError: 'Failed to create evaluation outline.' });
        } finally {
          updateState({ createPending: false });
        }
      }
    }
  }, [state, callCreate, callUpdate, updateState, proactivelySuggestQuickTest]);

  const startChat = useCallback(async (initialStory: string) => {
    log('Action: startChat', { initialStory });
    updateState({ pending: true, chatError: null, phase: 'chat' });
    try {
      const seed: Message[] = [{ role: 'user' as const, content: initialStory.trim() }];
      updateState({ messages: seed, phase: 'chat' });
      const reply = await callChat(seed, state.outlineYaml);
      await handleReply(reply, seed);
    } catch (e) {
      log('Error in startChat', e);
      updateState({
        chatError: 'Sorry, something went wrong starting the chat.',
        messages: [...state.messages, { role: 'assistant' as const, content: 'Sorry, something went wrong starting the chat.' }]
      });
    } finally {
      updateState({ pending: false });
    }
  }, [state.outlineYaml, callChat, handleReply, updateState]);

  const sendMessage = useCallback(async (content: string) => {
    log('Action: sendMessage', { content });
    const userMsg: Message = { role: 'user', content: content.trim() };
    const newMessages = [...state.messages, userMsg];
    updateState({ messages: newMessages, pending: true, chatError: null });
    try {
      const reply = await callChat(newMessages, state.outlineYaml);
      await handleReply(reply, newMessages);
    } catch (e) {
      log('Error in sendMessage', e);
      updateState({
        chatError: 'Sorry, something went wrong sending your message.',
        messages: [...state.messages, { role: 'assistant' as const, content: 'Sorry, something went wrong sending your message.' }]
      });
    } finally {
      updateState({ pending: false });
    }
  }, [state.messages, state.outlineYaml, callChat, handleReply, updateState]);

  const sendCta = useCallback(async (ctaText: string) => {
    log('Action: sendCta', { ctaText });
    await sendMessage(ctaText);
  }, [sendMessage]);

  const runQuickTest = useCallback(async () => {
    log('Action: runQuickTest');
    if (!state.outlineObj) {
      log('Aborting runQuickTest: no outline object found.');
      return;
    }
    
      updateState({ 
        quickRunPending: true, 
        quickRunError: null,
        messages: [...state.messages, { role: 'assistant' as const, content: 'Great - I will run a quick test now. It should only take a moment.' }]
      });
    
    try {
      const result = await callQuickRun(state.outlineObj);
      if (result) {
        const payload = ControlSignalHelpers.wrapQuickResult(result);
        const newMessages: Message[] = [
          ...state.messages,
          { role: 'assistant' as const, content: 'Here are the quick results. We can refine from here.' },
          { role: 'assistant' as const, content: payload }
        ];
        updateState({ messages: newMessages });
        
        // Follow-up from orchestrator
        const contextForFollowUp: Message[] = [
          // FIX: Add the full conversation context for a better follow-up.
          ...newMessages.slice(-5), // Take last 5 messages for context
        ];
        const follow = await callChat(contextForFollowUp, state.outlineYaml);
        updateState({ messages: [...newMessages, { role: 'assistant' as const, content: follow }] });
      }
    } catch (e) {
        log('Error in runQuickTest', e);
        updateState({
          quickRunError: 'Quick test failed. Please try again.',
          messages: [...state.messages, { role: 'assistant', content: `Sorry - the quick test failed. Want to try again? ${ControlSignalHelpers.wrapCta('Run a quick test')}` }]
        });
    } finally {
      updateState({ quickRunPending: false });
    }
  }, [state.outlineObj, state.messages, state.outlineYaml, callQuickRun, callChat, updateState]);

  const clearErrors = useCallback(() => {
    log('Action: clearErrors');
    updateState({ chatError: null, createError: null, quickRunError: null });
  }, [updateState]);

  const resetChat = useCallback(() => {
    log('Action: resetChat');
    setState(initialState);
  }, []);

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
