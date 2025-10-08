import { ParsedStreamResult } from "@/lib/story-utils/streaming-parser";

export type Message = { 
  id: string;
  role: 'user' | 'assistant'; 
  content: string;
};

export interface QuickRunStatus {
  status: 'idle' | 'pending' | 'generating_responses' | 'evaluating' | 'complete' | 'error';
  message?: string;
  progress?: {
    completed: number;
    total: number;
  };
  result?: any;
  details?: string;
}

export interface StorySessionSummary {
  id: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface StoryState {
  messages: Message[];
  activeStream: ParsedStreamResult & { messageId: string } | null;
  outlineYaml: string | null;
  outlineObj: any | null;
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
  sessionId?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  title?: string | null;
}
