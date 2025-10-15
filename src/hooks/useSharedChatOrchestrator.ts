/**
 * Shared Chat Orchestration Logic
 *
 * Contains the common chat, streaming, and API logic used by both
 * Story and Workshop orchestrators. This eliminates ~200 lines of duplication.
 */

import { useCallback, useEffect } from 'react';
import { StreamingParser } from '@/lib/story-utils/streaming-parser';
import { QuickRunStatus } from '@/types/story';

// System instruction type
export type SystemInstruction = {
  command: 'CREATE_OUTLINE' | 'UPDATE_OUTLINE' | 'NO_OP';
  payload?: any;
};

export function isSystemInstruction(obj: any): obj is SystemInstruction {
  if (!obj || typeof obj.command !== 'string') return false;
  return ['CREATE_OUTLINE', 'UPDATE_OUTLINE', 'NO_OP'].includes(obj.command);
}

// ID generator
export const nanoid = () => Math.random().toString(36).substring(2);

// Generic message type (works for both Story and Workshop)
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

// Configuration for the shared orchestrator
export interface SharedChatOrchestratorConfig {
  // UI context to send to the chat API
  uiContext: {
    pageName: string;
    pageUrl: string;
    availableActions: string[];
  };

  // Optional logging function
  log?: (label: string, ...data: any[]) => void;

  // Current state values
  outlineYaml: string | null;
  outlineObj: any | null;
  quickRunResult: any | null;
  quickRunId: string | null;
  quickRunStatus: QuickRunStatus;

  // State setters
  setCreatePending: (pending: boolean) => void;
  setCreateError: (error: string | null) => void;
  setOutlineYaml: (yaml: string) => void;
  setOutlineObj: (obj: any) => void;
  setPending: (pending: boolean) => void;
  setActiveStream: (stream: any) => void;
  setChatError: (error: string | null) => void;
  setQuickRunPending: (pending: boolean) => void;
  setQuickRunError: (error: string | null) => void;
  setQuickRunResult: (result: any) => void;
  setQuickRunId: (id: string | null) => void;
  setQuickRunStatus: (status: QuickRunStatus) => void;

  // Message manipulation
  addMessage: (message: ChatMessage) => void;
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

export function useSharedChatOrchestrator(config: SharedChatOrchestratorConfig) {
  const { log = () => {}, uiContext } = config;

  /**
   * API Helpers
   */
  const callCreate = useCallback(async (summary: string) => {
    log('API Call: /api/story/create', { summary });
    const res = await fetch('/api/story/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    });
    if (!res.ok) throw new Error('Create API failed');
    return await res.json() as { yaml?: string; data?: any };
  }, [log]);

  const callUpdate = useCallback(async (currentJson: any, guidance: string) => {
    log('API Call: /api/story/update', { currentJson, guidance });
    const res = await fetch('/api/story/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentJson, guidance }),
    });
    if (!res.ok) throw new Error('Update API failed');
    return await res.json() as { yaml?: string; data?: any };
  }, [log]);

  /**
   * Handle system instructions from AI
   */
  const handleSystemInstruction = useCallback(async (
    instruction: SystemInstruction,
    opts?: { synthesizeIfEmpty?: boolean }
  ) => {
    log('Handling system instruction', instruction);

    switch (instruction.command) {
      case 'CREATE_OUTLINE':
        config.setCreatePending(true);
        config.setCreateError(null);
        try {
          const out = await callCreate(instruction.payload.summary);
          config.setOutlineYaml(String(out.yaml || ''));
          config.setOutlineObj(out.data || null);

          // If the visible chat content was empty, synthesize a confirmation message
          if (opts?.synthesizeIfEmpty) {
            config.addMessage({
              id: nanoid(),
              role: 'assistant',
              content: 'Created a draft evaluation outline.'
            });
          }
        } catch (e) {
          console.error('Error creating outline', e);
          config.setCreateError('Failed to create evaluation outline.');
        } finally {
          config.setCreatePending(false);
        }
        break;

      case 'UPDATE_OUTLINE':
        if (!config.outlineObj) return;
        config.setCreatePending(true);
        try {
          const updated = await callUpdate(config.outlineObj, instruction.payload.guidance);
          config.setOutlineObj(updated.data || null);
          config.setOutlineYaml(String(updated.yaml || ''));
          config.addMessage({
            id: nanoid(),
            role: 'assistant',
            content: 'I have updated the evaluation outline.'
          });
        } catch (e) {
          console.error('Error updating outline', e);
          config.addMessage({
            id: nanoid(),
            role: 'assistant',
            content: 'Sorry - I could not update the evaluation this time.'
          });
        } finally {
          config.setCreatePending(false);
        }
        break;

      case 'NO_OP':
        // Do nothing
        break;
    }
  }, [
    config.outlineObj,
    config.setCreatePending,
    config.setCreateError,
    config.setOutlineYaml,
    config.setOutlineObj,
    config.addMessage,
    callCreate,
    callUpdate,
    log
  ]);

  /**
   * Handle streaming response
   */
  const handleStream = useCallback(async (context: ChatMessage[]) => {
    const messageId = nanoid();
    config.setPending(true);
    config.setActiveStream({
      messageId,
      visibleContent: '',
      systemInstructions: null,
      streamError: null
    });

    try {
      log('Stream: starting /api/story/chat', {
        contextLen: context.length,
        hasOutline: Boolean(config.outlineYaml),
        hasQuickRunResult: Boolean(config.quickRunResult)
      });

      const res = await fetch('/api/story/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: context,
          blueprintYaml: config.outlineYaml,
          quickRunResult: config.quickRunResult,
          uiContext,
          debugStreamDelayMs: process.env.NODE_ENV === 'development' ? 50 : undefined,
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
          config.setActiveStream({ messageId, ...parsed });
          if (parsed.streamError) throw new Error(parsed.streamError);
        }
      }

      const finalParsed = parser.finalize();
      const hadVisible = (finalParsed.visibleContent || '').trim().length > 0;
      const hadError = !!finalParsed.streamError;
      const maybeInstruction = finalParsed.systemInstructions;
      const instruction = isSystemInstruction(maybeInstruction) ? maybeInstruction : null;
      const isNoOpInstruction = instruction?.command === 'NO_OP';

      log('Stream: finalized', {
        hadVisible,
        hadError,
        hasInstruction: Boolean(instruction),
        instructionCmd: instruction?.command
      });

      // If there was a stream error, show it to the user
      if (hadError) {
        const errorMessage: ChatMessage = {
          id: messageId,
          role: 'assistant',
          content: finalParsed.streamError || 'An error occurred while processing your message.',
        };
        config.setMessages(prev => [...prev, errorMessage]);
        config.setActiveStream(null);
        config.setChatError(finalParsed.streamError || 'Stream error');
        return; // Don't process instructions if there was an error
      }

      if (hadVisible) {
        const finalMessage: ChatMessage = {
          id: messageId,
          role: 'assistant',
          content: finalParsed.visibleContent,
        };
        config.setMessages(prev => [...prev, finalMessage]);
        config.setActiveStream(null);
      } else {
        // No visible content
        const fallbackText = 'I received your message but did not produce a visible reply. Please try rephrasing.';

        if (!instruction || isNoOpInstruction) {
          const finalMessage: ChatMessage = {
            id: messageId,
            role: 'assistant',
            content: fallbackText,
          };
          config.setMessages(prev => [...prev, finalMessage]);
          config.setActiveStream(null);
        } else {
          config.setActiveStream(null);
        }
      }

      // Handle instructions after stream is complete
      if (instruction) {
        await handleSystemInstruction(instruction, {
          synthesizeIfEmpty: !hadVisible && !isNoOpInstruction
        });
      }

    } catch (e: any) {
      console.error('Error during stream handling', e);
      const errorMsg: ChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.'
      };
      config.setMessages(prev => [...prev, errorMsg]);
      config.setActiveStream(null);
      config.setChatError(e.message);
    } finally {
      config.setPending(false);
    }
  }, [
    config.outlineYaml,
    config.quickRunResult,
    config.setPending,
    config.setActiveStream,
    config.setMessages,
    config.setChatError,
    handleSystemInstruction,
    uiContext,
    log
  ]);

  /**
   * Poll for quick run status
   */
  useEffect(() => {
    const inProgress = ['pending', 'generating_responses', 'evaluating'].includes(
      config.quickRunStatus?.status
    );

    if (!config.quickRunId || !inProgress) {
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/story/quick-run/status/${config.quickRunId}`);
        if (res.status === 202 || res.status === 404) {
          return;
        }
        if (!res.ok) {
          throw new Error(`Status check failed with status ${res.status}`);
        }
        const newStatus: QuickRunStatus = await res.json();

        config.setQuickRunStatus(newStatus);

        if (newStatus.status === 'complete') {
          config.setQuickRunResult(newStatus.result || null);
          config.setQuickRunPending(false);
          config.setQuickRunError(null);
        } else if (newStatus.status === 'error') {
          config.setQuickRunError(newStatus.message || 'The test failed.');
          config.setQuickRunPending(false);
        }

      } catch (e) {
        log('Error during status poll', e);
        config.setQuickRunStatus({
          status: 'error',
          message: 'Failed to get test status.'
        });
        config.setQuickRunError('Could not retrieve test status. Please try again.');
        config.setQuickRunPending(false);
      }
    };

    poll();
    const intervalId = setInterval(poll, 3000);

    return () => clearInterval(intervalId);
  }, [
    config.quickRunId,
    config.quickRunStatus?.status,
    config.setQuickRunStatus,
    config.setQuickRunResult,
    config.setQuickRunPending,
    config.setQuickRunError,
    log
  ]);

  /**
   * Run quick test
   */
  const runQuickTest = useCallback(async () => {
    log('Action: runQuickTest');
    if (!config.outlineObj) return;

    config.setQuickRunPending(true);
    config.setQuickRunError(null);
    config.setQuickRunResult(null);
    config.setQuickRunId(null);
    config.setQuickRunStatus({ status: 'pending', message: 'Initiating evaluation...' });

    try {
      const res = await fetch('/api/story/quick-run/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline: config.outlineObj }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start the quick test.');
      }

      config.setQuickRunId(data.runId);

    } catch (e: any) {
      log('Error in runQuickTest (start)', e);
      config.setQuickRunError('Failed to start the test. Please try again.');
      config.setQuickRunPending(false);
      config.setQuickRunStatus({ status: 'error', message: 'Failed to start the test.' });
    }
  }, [
    config.outlineObj,
    config.setQuickRunPending,
    config.setQuickRunError,
    config.setQuickRunResult,
    config.setQuickRunId,
    config.setQuickRunStatus,
    log
  ]);

  /**
   * Clear errors
   */
  const clearErrors = useCallback(() => {
    log('Action: clearErrors');
    config.setChatError(null);
    config.setCreateError(null);
    config.setQuickRunError(null);
  }, [config.setChatError, config.setCreateError, config.setQuickRunError, log]);

  return {
    handleStream,
    handleSystemInstruction,
    runQuickTest,
    clearErrors,
  };
}
