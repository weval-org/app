/**
 * Custom hook for Story orchestration logic
 * Separates business logic from UI components
 */

import { useCallback, useState } from 'react';
import { ControlSignalHelpers } from '@/app/api/story/utils/control-signals';

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
  suggestQuickTest: () => void;
  clearErrors: () => void;
}

export function useStoryOrchestrator(): StoryState & StoryActions {
  const [state, setState] = useState<StoryState>({
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
  });

  const updateState = useCallback((updates: Partial<StoryState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const callChat = useCallback(async (msgs: Message[], hiddenYaml?: string | null) => {
    const res = await fetch('/api/story/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs, blueprintYaml: hiddenYaml || undefined }),
    });
    if (!res.ok) throw new Error('Chat API failed');
    const data = await res.json();
    return String(data.reply || '');
  }, []);

  const callCreate = useCallback(async (msgs: Message[]) => {
    const res = await fetch('/api/story/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs }),
    });
    if (!res.ok) throw new Error('Create API failed');
    return await res.json() as { yaml?: string; sanitized?: boolean; data?: any };
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

  const callQuickRun = useCallback(async (outline: any) => {
    const res = await fetch('/api/story/quick-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outline }),
    });
    if (!res.ok) throw new Error('Quick run failed');
    const data = await res.json();
    return data?.result;
  }, []);

  const handleReply = useCallback(async (reply: string, context: Message[]) => {
    const hasReady = ControlSignalHelpers.hasReadySignal(reply);
    const hasUpdate = ControlSignalHelpers.hasUpdateSignal(reply);

    updateState({ messages: [...state.messages, { role: 'assistant', content: reply }] });

    if (hasReady) {
      updateState({ createPending: true, createError: null });
      try {
        const out = await callCreate([...context, { role: 'assistant', content: reply }]);
        updateState({
          outlineYaml: String(out.yaml || ''),
          outlineObj: out.data || null,
          createError: null,
        });
      } catch (e) {
        updateState({ createError: 'Failed to create evaluation outline.' });
      } finally {
        updateState({ createPending: false });
      }
    } else if (hasUpdate && state.outlineObj) {
      updateState({ createPending: true });
      try {
        const guidance = ControlSignalHelpers.cleanText(reply);
        const updated = await callUpdate(state.outlineObj, guidance);
        updateState({
          outlineObj: updated.data || null,
          outlineYaml: String(updated.yaml || ''),
        });
        updateState({ messages: [...state.messages, { role: 'assistant', content: 'I have updated the evaluation outline.' }] });
      } catch (e) {
        updateState({ messages: [...state.messages, { role: 'assistant', content: 'Sorry - I could not update the evaluation this time.' }] });
      } finally {
        updateState({ createPending: false });
      }
    } else {
      // Fallback auto-creation after 2 user turns
      const userTurns = context.filter(m => m.role === 'user').length;
      if (userTurns >= 2 && !state.outlineYaml && !state.createPending) {
        const notice = "Okay, I will start drafting a couple of simple prompts based on what you have shared.";
        updateState({ messages: [...state.messages, { role: 'assistant', content: notice }], createPending: true });
        try {
          const out = await callCreate([...context, { role: 'assistant', content: notice }]);
          updateState({
            outlineYaml: String(out.yaml || ''),
            outlineObj: out.data || null,
            createError: null,
          });
        } catch (e) {
          updateState({ createError: 'Failed to create evaluation outline.' });
        } finally {
          updateState({ createPending: false });
        }
      }
    }
  }, [state, callCreate, callUpdate, updateState]);

  const startChat = useCallback(async (initialStory: string) => {
    updateState({ pending: true, chatError: null });
    try {
      const seed: Message[] = [{ role: 'user', content: initialStory.trim() }];
      updateState({ messages: seed, phase: 'chat' });
      const reply = await callChat(seed, state.outlineYaml);
      await handleReply(reply, seed);
    } catch (e) {
      updateState({
        chatError: 'Sorry, something went wrong starting the chat.',
        messages: [...state.messages, { role: 'assistant', content: 'Sorry, something went wrong starting the chat.' }]
      });
    } finally {
      updateState({ pending: false });
    }
  }, [state.outlineYaml, callChat, handleReply, updateState]);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: Message = { role: 'user', content: content.trim() };
    updateState({ messages: [...state.messages, userMsg], pending: true, chatError: null });
    try {
      const reply = await callChat([...state.messages, userMsg], state.outlineYaml);
      await handleReply(reply, [...state.messages, userMsg]);
    } catch (e) {
      updateState({
        chatError: 'Sorry, something went wrong sending your message.',
        messages: [...state.messages, { role: 'assistant', content: 'Sorry, something went wrong sending your message.' }]
      });
    } finally {
      updateState({ pending: false });
    }
  }, [state.messages, state.outlineYaml, callChat, handleReply, updateState]);

  const sendCta = useCallback(async (ctaText: string) => {
    await sendMessage(ctaText);
  }, [sendMessage]);

  const runQuickTest = useCallback(async () => {
    if (!state.outlineObj) return;
    
      updateState({ 
        quickRunPending: true, 
        quickRunError: null,
        messages: [...state.messages, { role: 'assistant', content: 'Great - I will run a quick test now. It should only take a moment.' }]
      });
    
    try {
      const result = await callQuickRun(state.outlineObj);
      if (result) {
        const payload = ControlSignalHelpers.wrapQuickResult(result);
        const newMessages: Message[] = [
          ...state.messages,
          { role: 'assistant', content: 'Here are the quick results. We can refine from here.' },
          { role: 'assistant', content: payload }
        ];
        updateState({ messages: newMessages });
        
        // Follow-up from orchestrator
        const follow = await callChat([
          { role: 'assistant', content: 'Here are the quick results.' },
          { role: 'assistant', content: payload }
        ], state.outlineYaml);
        updateState({ messages: [...newMessages, { role: 'assistant', content: follow }] });
      }
    } catch (e) {
        updateState({
          quickRunError: 'Quick test failed. Please try again.',
          messages: [...state.messages, { role: 'assistant', content: `Sorry - the quick test failed. Want to try again? ${ControlSignalHelpers.wrapCta('Run a quick test')}` }]
        });
    } finally {
      updateState({ quickRunPending: false });
    }
  }, [state.outlineObj, state.messages, state.outlineYaml, callQuickRun, callChat, updateState]);

  const suggestQuickTest = useCallback(() => {
    updateState({ 
      messages: [...state.messages, { role: 'assistant', content: `If you are happy with this outline, I can run a quick test now. ${ControlSignalHelpers.wrapCta('Run a quick test')}` }] 
    });
  }, [state.messages, updateState]);

  const clearErrors = useCallback(() => {
    updateState({ chatError: null, createError: null, quickRunError: null });
  }, [updateState]);

  return {
    ...state,
    startChat,
    sendMessage,
    sendCta,
    runQuickTest,
    suggestQuickTest,
    clearErrors,
  };
}
