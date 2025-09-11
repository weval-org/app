/**
 * Input validation and sanitization for Story feature
 * Prevents XSS and validates user inputs
 */

import { z } from 'zod';
import { ConversationMessage } from '@/types/shared';

// Constants for validation
export const LIMITS = {
  MAX_MESSAGE_LENGTH: 10000,
  MAX_STORY_LENGTH: 20000,
  MAX_GUIDANCE_LENGTH: 2000,
  MIN_MESSAGE_LENGTH: 1,
  MAX_MESSAGES_IN_CONTEXT: 50,
} as const;

// Zod schemas for runtime validation
const messageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  ctas: z.array(z.string()).optional(),
});

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1),
  blueprintYaml: z.string().nullable().optional(),
  quickRunResult: z.any().nullable().optional(), // Allow this new field
});

export const createRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(LIMITS.MAX_MESSAGES_IN_CONTEXT),
});

export const updateRequestSchema = z.object({
  currentJson: z.object({}).passthrough(), // Allow any object structure
  guidance: z.string().min(1).max(LIMITS.MAX_GUIDANCE_LENGTH),
});

export const quickRunRequestSchema = z.object({
  outline: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    prompts: z.array(z.object({
      id: z.string(),
      promptText: z.string(),
      points: z.any(), // Can be array or nested array
    })).min(1).max(5),
  }),
});

/**
 * Sanitize user input to prevent XSS and other security issues
 */
export function sanitizeUserInput(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    // Remove potential script injections
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers like onclick="..."
    // Preserve legitimate tags used by our system but escape dangerous ones
    .replace(/<(?!\/?(cta)\b)[^>]*>/gi, '')
    // Trim whitespace and limit length
    .trim()
    .slice(0, LIMITS.MAX_MESSAGE_LENGTH);
}

/**
 * Validate and sanitize a message array
 */
export function validateAndSanitizeMessages(messages: unknown[]): ConversationMessage[] {
  if (!Array.isArray(messages)) return [];
  
  return messages
    .slice(-LIMITS.MAX_MESSAGES_IN_CONTEXT) // Prevent memory issues
    .map(m => {
      if (!m || typeof m !== 'object') return null;
      const message = m as { role?: unknown; content?: unknown };
      const role = message.role === 'user' || message.role === 'assistant' ? message.role : null;
      const content = typeof message.content === 'string' ? sanitizeUserInput(message.content) : '';
      
      if (role && content.length >= LIMITS.MIN_MESSAGE_LENGTH) {
        return { role, content } as ConversationMessage;
      }
      return null;
    })
    .filter((m): m is ConversationMessage => m !== null);
}

/**
 * Validate that a blueprint object has required structure
 */
export function validateBlueprintStructure(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  
  // Must have prompts array
  if (!Array.isArray(obj.prompts) || obj.prompts.length === 0) return false;
  
  // Each prompt must have id and promptText
  return obj.prompts.every((p: any) => 
    p && 
    typeof p === 'object' && 
    typeof p.id === 'string' && 
    p.id.trim().length > 0 &&
    typeof p.promptText === 'string' && 
    p.promptText.trim().length > 0
  );
}

/**
 * Sanitize CTA text to prevent injection
 */
export function sanitizeCtaText(text: string): string {
  if (typeof text !== 'string') return '';
  
  return text
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .trim()
    .slice(0, 100); // CTAs should be short
}
