import { ParsedStreamResult } from "@/lib/story-utils/streaming-parser";

export type Message = { 
  id: string;
  role: 'user' | 'assistant'; 
  content: string;
  // Additional structured data from the stream
  ctas?: string[];
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
}
