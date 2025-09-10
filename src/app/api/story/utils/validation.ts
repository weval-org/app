/**
 * Input validation and sanitization for Story feature
 * Prevents XSS and validates user inputs
 */

import { z } from 'zod';

// Constants for validation
export const LIMITS = {
  MAX_MESSAGE_LENGTH: 10000,
  MAX_STORY_LENGTH: 20000,
  MAX_GUIDANCE_LENGTH: 2000,
  MIN_MESSAGE_LENGTH: 1,
  MAX_MESSAGES_IN_CONTEXT: 50,
} as const;

// Zod schemas for runtime validation
export const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(LIMITS.MIN_MESSAGE_LENGTH).max(LIMITS.MAX_MESSAGE_LENGTH),
});

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(LIMITS.MAX_MESSAGES_IN_CONTEXT),
  blueprintYaml: z.string().optional(),
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
    .replace(/<(?!\/?(cta|ready_to_begin|update_eval|quick_result|JSON|BLUEPRINT_YAML|CURRENT_JSON|GUIDANCE)\b)[^>]*>/gi, '')
    // Trim whitespace and limit length
    .trim()
    .slice(0, LIMITS.MAX_MESSAGE_LENGTH);
}

/**
 * Validate and sanitize a message array
 */
export function validateAndSanitizeMessages(messages: any[]): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(messages)) return [];
  
  return messages
    .slice(-LIMITS.MAX_MESSAGES_IN_CONTEXT) // Prevent memory issues
    .map(m => {
      if (!m || typeof m !== 'object') return null;
      const role = m.role === 'user' || m.role === 'assistant' ? m.role : null;
      const content = typeof m.content === 'string' ? sanitizeUserInput(m.content) : '';
      return role && content.length >= LIMITS.MIN_MESSAGE_LENGTH ? { role, content } : null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);
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
