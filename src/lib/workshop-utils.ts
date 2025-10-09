/**
 * Workshop Utilities
 *
 * Core utilities for workshop ID generation, session management, and PIN recovery.
 */

import { v4 as uuidv4 } from 'uuid';
import type { WorkshopSession } from '@/types/workshop';

// Word lists for memorable workshop IDs
const ADJECTIVES = [
  'crimson', 'azure', 'golden', 'silver', 'emerald',
  'violet', 'amber', 'coral', 'jade', 'ruby',
  'sapphire', 'topaz', 'pearl', 'onyx', 'crystal',
  'midnight', 'dawn', 'dusk', 'twilight', 'aurora',
  'stellar', 'lunar', 'solar', 'cosmic', 'nebula',
  'forest', 'ocean', 'mountain', 'river', 'canyon',
  'thunder', 'lightning', 'storm', 'breeze', 'frost',
  'velvet', 'silk', 'marble', 'granite', 'diamond',
];

const NOUNS = [
  'elephant', 'tiger', 'eagle', 'dolphin', 'phoenix',
  'dragon', 'falcon', 'panther', 'wolf', 'bear',
  'lion', 'hawk', 'raven', 'owl', 'fox',
  'whale', 'shark', 'octopus', 'turtle', 'penguin',
  'summit', 'valley', 'glacier', 'waterfall', 'meadow',
  'forest', 'desert', 'tundra', 'prairie', 'savanna',
  'nebula', 'comet', 'meteor', 'quasar', 'pulsar',
  'crystal', 'prism', 'mirror', 'beacon', 'compass',
];

/**
 * Generate a memorable workshop ID in format: adjective-noun-###
 * Example: "crimson-elephant-742"
 */
export function generateWorkshopId(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const number = Math.floor(Math.random() * 1000);

  return `${adjective}-${noun}-${number}`;
}

/**
 * Validate workshop ID format
 */
export function isValidWorkshopId(id: string): boolean {
  // Format: word-word-number
  const pattern = /^[a-z]+-[a-z]+-\d{1,3}$/;
  return pattern.test(id);
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new workshop session (client-side only, no server registration)
 */
export function createWorkshopSession(
  workshopId: string,
  displayName: string | null = null
): WorkshopSession {
  const now = new Date().toISOString();

  return {
    sessionId: generateSessionId(),
    workshopId,
    displayName,
    createdAt: now,
    lastActiveAt: now,
  };
}

/**
 * Get workshop session from localStorage
 */
export function getWorkshopSession(workshopId: string): WorkshopSession | null {
  if (typeof window === 'undefined') return null;

  const key = `workshop_${workshopId}_session`;
  const stored = localStorage.getItem(key);

  if (!stored) return null;

  try {
    return JSON.parse(stored) as WorkshopSession;
  } catch {
    return null;
  }
}

/**
 * Save workshop session to localStorage
 */
export function saveWorkshopSession(session: WorkshopSession): void {
  if (typeof window === 'undefined') return;

  const key = `workshop_${session.workshopId}_session`;
  localStorage.setItem(key, JSON.stringify(session));
}

/**
 * Update last active timestamp for session
 */
export function touchWorkshopSession(workshopId: string): void {
  const session = getWorkshopSession(workshopId);
  if (!session) return;

  session.lastActiveAt = new Date().toISOString();
  saveWorkshopSession(session);
}

/**
 * Get or create workshop session
 */
export function ensureWorkshopSession(
  workshopId: string,
  displayName: string | null = null
): WorkshopSession {
  let session = getWorkshopSession(workshopId);

  if (!session) {
    session = createWorkshopSession(workshopId, displayName);
    saveWorkshopSession(session);
  }

  touchWorkshopSession(workshopId);

  return session;
}

/**
 * Get display name from localStorage (persists across workshops)
 */
export function getStoredDisplayName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('workshop_display_name');
}

/**
 * Save display name to localStorage
 */
export function saveDisplayName(name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('workshop_display_name', name);
}

/**
 * Clear workshop session from localStorage
 */
export function clearWorkshopSession(workshopId: string): void {
  if (typeof window === 'undefined') return;
  const key = `workshop_${workshopId}_session`;
  localStorage.removeItem(key);
}

/**
 * Format workshop ID for display (capitalize, add spaces)
 * Example: "crimson-elephant-742" → "Crimson Elephant 742"
 */
export function formatWorkshopId(id: string): string {
  return id
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Workshop state for localStorage persistence
 */
export interface WorkshopState {
  workshopId: string;
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
  outlineObj: any | null;
  outlineYaml: string | null;
  phase: 'intro' | 'chat';
  quickRunResult: any | null;
  updatedAt: string;
}

/**
 * Save workshop state to localStorage
 */
export function saveWorkshopState(workshopId: string, state: Partial<WorkshopState>): void {
  if (typeof window === 'undefined') return;

  // Don't save if there's no meaningful content
  const hasContent = (state.messages && state.messages.length > 0) || state.outlineObj;
  if (!hasContent) return;

  try {
    const key = `workshop_${workshopId}_state`;
    const now = new Date().toISOString();
    const fullState: WorkshopState = {
      workshopId,
      messages: state.messages || [],
      outlineObj: state.outlineObj || null,
      outlineYaml: state.outlineYaml || null,
      phase: state.phase || 'intro',
      quickRunResult: state.quickRunResult || null,
      updatedAt: now,
    };
    localStorage.setItem(key, JSON.stringify(fullState));
  } catch (error) {
    console.warn('Failed to save workshop state:', error);
  }
}

/**
 * Get workshop state from localStorage
 */
export function getWorkshopState(workshopId: string): WorkshopState | null {
  if (typeof window === 'undefined') return null;

  const key = `workshop_${workshopId}_state`;
  const stored = localStorage.getItem(key);

  if (!stored) return null;

  try {
    return JSON.parse(stored) as WorkshopState;
  } catch {
    return null;
  }
}

/**
 * Clear workshop state from localStorage
 */
export function clearWorkshopState(workshopId: string): void {
  if (typeof window === 'undefined') return;
  const key = `workshop_${workshopId}_state`;
  localStorage.removeItem(key);
}

/**
 * Get S3 paths for workshop resources
 */
export const WorkshopPaths = {
  weval: (workshopId: string, wevalId: string) =>
    `live/workshop/wevals/${workshopId}/${wevalId}.json`,
};
