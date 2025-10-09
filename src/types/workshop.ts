/**
 * Workshop Types
 *
 * Workshops are collaborative, anonymous spaces where multiple participants
 * can build, publish, and run evaluations together.
 */

export interface WorkshopSession {
  sessionId: string;
  workshopId: string;
  displayName: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface PublishedBlueprint {
  workshopId: string;
  sessionId: string;
  hash: string; // Content-addressed hash of blueprint
  authorName: string;
  description: string;
  blueprintYaml: string;
  publishedAt: string;
  promptCount: number;
  modelCount: number;
  runCount: number; // Number of times this blueprint has been run
  visibility: 'workshop' | 'public'; // For future expansion
}

export interface WorkshopRun {
  runId: string;
  workshopId: string;
  sessionId: string;
  blueprintHash: string;
  status: 'pending' | 'generating_responses' | 'evaluating' | 'complete' | 'error';
  message?: string;
  progress?: {
    completed: number;
    total: number;
  };
  startedAt: string;
  completedAt?: string;
  resultUrl?: string;
  triggeredBySessionId: string; // Session that triggered this run
}

export interface WorkshopIndex {
  workshopId: string;
  lastUpdated: string;
  blueprintCount: number;
  participantCount: number; // Unique sessionIds
  totalRuns: number;
  blueprints: PublishedBlueprintSummary[];
}

export interface PublishedBlueprintSummary {
  sessionId: string;
  hash: string;
  authorName: string;
  description: string;
  publishedAt: string;
  promptCount: number;
  runCount: number;
  avgScore?: number | null; // Average hybrid score across runs
}

export interface WorkshopStats {
  workshopId: string;
  participantCount: number;
  blueprintCount: number;
  totalRuns: number;
  activeRuns: number;
  lastActivityAt: string;
}

export interface WorkshopRateLimits {
  publishPerSession: { max: number; window: string };
  runsPerWorkshop: { max: number; window: string };
  publishPerWorkshop: { max: number; window: string };
}
