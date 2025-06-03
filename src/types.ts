export interface MessageWithFields {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  [key: string]: any;
}

export interface AIChatHandle {
  addMessage: (role: string, content: string, submit?: boolean) => void;
  clearMessages: () => void;
}

export interface PersonalityEvaluation {
  modelName: string
  evaluation: string
  embedding?: number[]
  response?: string
}

export interface ResultWithEmbedding {
  promptId: string
  prompt: {
    prompt: string
    system?: string
    description: string
  }
  response: string
  evaluations: PersonalityEvaluation[]
  combinedEmbedding: number[] | null
}

export interface StoredPersonalityTest {
  modelId: string
  timestamp: string
  results: ResultWithEmbedding[]
  combinedPersonalityVector: number[] | null
  path?: string
}

export interface LogEntry {
  timestamp: string
  message: string
  type: 'info' | 'error' | 'success' | 'warning'
  promptId?: string
  evaluatorId?: string
} 