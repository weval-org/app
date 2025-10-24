/**
 * Error reporting infrastructure for the Sandbox
 *
 * Provides:
 * - Unique error IDs for support tracking
 * - Structured error context collection
 * - User-friendly error messages with technical details
 * - Sentry integration
 */

import * as Sentry from '@sentry/nextjs';

/**
 * Error categories for the Sandbox
 */
export enum SandboxErrorCategory {
  AUTH = 'AUTH',
  GITHUB_API = 'GITHUB',
  FILE_OPS = 'FILE',
  EVALUATION = 'EVAL',
  PARSING = 'PARSE',
  NETWORK = 'NET',
  VALIDATION = 'VAL',
  UNKNOWN = 'UNK',
}

/**
 * Generates a unique error ID
 * Format: ERR_<CATEGORY>_<TIMESTAMP>_<RANDOM>
 * Example: ERR_FILE_1234567890_a3f9
 */
export function generateErrorId(category: SandboxErrorCategory = SandboxErrorCategory.UNKNOWN): string {
  const timestamp = Date.now().toString(36); // Base36 for shorter string
  const random = Math.random().toString(36).substring(2, 6);
  return `ERR_${category}_${timestamp}_${random}`.toUpperCase();
}

/**
 * Diagnostic context that can be attached to errors
 */
export interface ErrorContext {
  errorId: string;
  category: SandboxErrorCategory;
  operation?: string;

  // User context
  isLoggedIn?: boolean;
  username?: string;
  forkName?: string;

  // File context
  activeBlueprintPath?: string;
  activeBlueprintName?: string;
  activeBlueprint?: {
    name: string;
    path: string;
    isLocal: boolean;
    branchName?: string;
    hasOpenPr?: boolean;
  };

  // Operation context
  targetFilePath?: string;
  branchName?: string;

  // Error details
  originalError?: Error;
  technicalDetails?: Record<string, any>;

  // Browser context
  userAgent?: string;
  url?: string;
  timestamp?: string;
}

/**
 * User-friendly error report that can be copied
 */
export interface ErrorReport {
  errorId: string;
  userMessage: string;
  technicalMessage: string;
  suggestedActions: string[];
  context: ErrorContext;
  formattedReport: string;
}

/**
 * Creates a structured error report
 */
export function createErrorReport(
  userMessage: string,
  technicalMessage: string,
  context: Partial<ErrorContext>,
  suggestedActions: string[] = []
): ErrorReport {
  const errorId = context.errorId || generateErrorId(context.category);

  const fullContext: ErrorContext = {
    errorId,
    category: context.category || SandboxErrorCategory.UNKNOWN,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    ...context,
  };

  // Format for easy copying
  const formattedReport = formatErrorReport({
    errorId,
    userMessage,
    technicalMessage,
    suggestedActions,
    context: fullContext,
  });

  return {
    errorId,
    userMessage,
    technicalMessage,
    suggestedActions,
    context: fullContext,
    formattedReport,
  };
}

/**
 * Formats an error report for copying to clipboard
 */
function formatErrorReport(report: Omit<ErrorReport, 'formattedReport'>): string {
  const lines: string[] = [
    '═══════════════════════════════════════',
    '   WEVAL SANDBOX ERROR REPORT',
    '═══════════════════════════════════════',
    '',
    `Error ID: ${report.errorId}`,
    `Category: ${report.context.category}`,
    `Timestamp: ${report.context.timestamp}`,
    '',
    '─── User-Friendly Message ───',
    report.userMessage,
    '',
  ];

  if (report.suggestedActions.length > 0) {
    lines.push('─── Suggested Actions ───');
    report.suggestedActions.forEach((action, idx) => {
      lines.push(`${idx + 1}. ${action}`);
    });
    lines.push('');
  }

  lines.push('─── Technical Details ───');
  lines.push(report.technicalMessage);
  lines.push('');

  if (report.context.operation) {
    lines.push(`Operation: ${report.context.operation}`);
  }

  if (report.context.isLoggedIn !== undefined) {
    lines.push(`Logged In: ${report.context.isLoggedIn ? 'Yes' : 'No'}`);
    if (report.context.username) {
      lines.push(`Username: ${report.context.username}`);
    }
    if (report.context.forkName) {
      lines.push(`Fork: ${report.context.forkName}`);
    }
  }

  if (report.context.activeBlueprint) {
    lines.push('');
    lines.push('─── Active Blueprint ───');
    lines.push(`Name: ${report.context.activeBlueprint.name}`);
    lines.push(`Path: ${report.context.activeBlueprint.path}`);
    lines.push(`Type: ${report.context.activeBlueprint.isLocal ? 'Local' : 'GitHub'}`);
    if (report.context.activeBlueprint.branchName) {
      lines.push(`Branch: ${report.context.activeBlueprint.branchName}`);
    }
    if (report.context.activeBlueprint.hasOpenPr) {
      lines.push(`Has Open PR: Yes`);
    }
  }

  if (report.context.technicalDetails) {
    lines.push('');
    lines.push('─── Additional Technical Info ───');
    lines.push(JSON.stringify(report.context.technicalDetails, null, 2));
  }

  if (report.context.originalError) {
    lines.push('');
    lines.push('─── Stack Trace ───');
    lines.push(report.context.originalError.stack || report.context.originalError.toString());
  }

  lines.push('');
  lines.push('─── Environment ───');
  if (report.context.userAgent) {
    lines.push(`User Agent: ${report.context.userAgent}`);
  }
  if (report.context.url) {
    lines.push(`URL: ${report.context.url}`);
  }

  lines.push('');
  lines.push('═══════════════════════════════════════');
  lines.push('Please email this report to: support@weval.ai');
  lines.push('═══════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Reports an error to Sentry with full context
 */
export function reportErrorToSentry(report: ErrorReport): void {
  try {
    const error = report.context.originalError || new Error(report.technicalMessage);

    Sentry.captureException(error, {
      tags: {
        errorId: report.errorId,
        category: report.context.category,
        operation: report.context.operation,
        component: 'sandbox',
      },
      contexts: {
        sandbox: {
          errorId: report.errorId,
          userMessage: report.userMessage,
          operation: report.context.operation,
        },
        user_context: {
          isLoggedIn: report.context.isLoggedIn,
          username: report.context.username,
          forkName: report.context.forkName,
        },
        file_context: report.context.activeBlueprint,
      },
      extra: {
        technicalDetails: report.context.technicalDetails,
        suggestedActions: report.suggestedActions,
      },
    });
  } catch (e) {
    // Silent fail - don't break the app if Sentry fails
    console.error('[ErrorReporting] Failed to send to Sentry:', e);
  }
}

/**
 * Stores error in sessionStorage for debugging
 */
export function storeErrorInSession(report: ErrorReport): void {
  try {
    const key = 'sandbox_errors';
    const stored = sessionStorage.getItem(key);
    const errors = stored ? JSON.parse(stored) : [];

    // Keep only last 20 errors
    errors.push({
      errorId: report.errorId,
      timestamp: report.context.timestamp,
      category: report.context.category,
      userMessage: report.userMessage,
      operation: report.context.operation,
    });

    if (errors.length > 20) {
      errors.shift();
    }

    sessionStorage.setItem(key, JSON.stringify(errors));
  } catch (e) {
    // Silent fail - storage might be full or disabled
    console.warn('[ErrorReporting] Could not store error in session:', e);
  }
}

/**
 * Main error reporting function
 *
 * Use this to report all Sandbox errors with proper context
 */
export function reportSandboxError(
  userMessage: string,
  technicalMessage: string,
  context: Partial<ErrorContext>,
  suggestedActions: string[] = []
): ErrorReport {
  const report = createErrorReport(userMessage, technicalMessage, context, suggestedActions);

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.group(`🚨 Sandbox Error: ${report.errorId}`);
    console.error('User Message:', report.userMessage);
    console.error('Technical Message:', report.technicalMessage);
    console.error('Context:', report.context);
    if (report.suggestedActions.length > 0) {
      console.info('Suggested Actions:', report.suggestedActions);
    }
    console.groupEnd();
  }

  // Send to Sentry
  reportErrorToSentry(report);

  // Store in session for debugging
  storeErrorInSession(report);

  return report;
}

/**
 * Copies error report to clipboard
 */
export async function copyErrorReportToClipboard(report: ErrorReport): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(report.formattedReport);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = report.formattedReport;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    }
  } catch (e) {
    console.error('[ErrorReporting] Failed to copy to clipboard:', e);
    return false;
  }
}

/**
 * Pre-configured error reporters for common scenarios
 */
export const SandboxErrorReporters = {
  auth: {
    notLoggedIn: (operation: string) => reportSandboxError(
      'You need to be logged in to perform this action',
      `Authentication required for operation: ${operation}`,
      {
        category: SandboxErrorCategory.AUTH,
        operation,
        isLoggedIn: false,
      },
      [
        'Click "Login with GitHub" in the sidebar',
        'Refresh the page and try again',
      ]
    ),

    sessionExpired: (operation: string) => reportSandboxError(
      'Your session has expired',
      `Session expired during operation: ${operation}`,
      {
        category: SandboxErrorCategory.AUTH,
        operation,
      },
      [
        'Log out and log back in',
        'Refresh the page',
      ]
    ),
  },

  github: {
    apiFailure: (operation: string, error: Error, details?: Record<string, any>) => reportSandboxError(
      'Failed to communicate with GitHub',
      `GitHub API error during ${operation}: ${error.message}`,
      {
        category: SandboxErrorCategory.GITHUB_API,
        operation,
        originalError: error,
        technicalDetails: details,
      },
      [
        'Check your internet connection',
        'Verify your GitHub authentication is still valid',
        'Try refreshing the page',
        'If the issue persists, GitHub might be experiencing issues',
      ]
    ),

    forkNotFound: (forkName: string) => reportSandboxError(
      'Your GitHub fork could not be found',
      `Fork not found: ${forkName}`,
      {
        category: SandboxErrorCategory.GITHUB_API,
        operation: 'fetch_fork',
        forkName,
      },
      [
        'Verify your fork exists on GitHub',
        'Try creating a new fork from the setup wizard',
        'Log out and log back in',
      ]
    ),
  },

  file: {
    loadFailure: (filePath: string, error: Error, context?: Partial<ErrorContext>) => reportSandboxError(
      'Failed to load file',
      `Could not load file at ${filePath}: ${error.message}`,
      {
        category: SandboxErrorCategory.FILE_OPS,
        operation: 'load_file',
        targetFilePath: filePath,
        originalError: error,
        ...context,
      },
      [
        'Check that the file exists on GitHub',
        'Verify you have access to the repository',
        'Try refreshing the file list',
      ]
    ),

    saveFailure: (filePath: string, error: Error, context?: Partial<ErrorContext>) => reportSandboxError(
      'Failed to save file',
      `Could not save file at ${filePath}: ${error.message}`,
      {
        category: SandboxErrorCategory.FILE_OPS,
        operation: 'save_file',
        targetFilePath: filePath,
        originalError: error,
        ...context,
      },
      [
        'Check your internet connection',
        'Verify you have write access to the repository',
        'Try saving again',
        'Your local changes are preserved - you can copy the content and retry',
      ]
    ),

    deleteFailure: (filePath: string, error: Error) => reportSandboxError(
      'Failed to delete file',
      `Could not delete file at ${filePath}: ${error.message}`,
      {
        category: SandboxErrorCategory.FILE_OPS,
        operation: 'delete_file',
        targetFilePath: filePath,
        originalError: error,
      },
      [
        'Refresh the file list to see current state',
        'Try deleting again',
        'Check GitHub directly to see if the file was actually deleted',
      ]
    ),
  },

  evaluation: {
    startFailure: (error: Error, blueprintName?: string) => reportSandboxError(
      'Failed to start evaluation',
      `Could not start evaluation: ${error.message}`,
      {
        category: SandboxErrorCategory.EVALUATION,
        operation: 'start_evaluation',
        originalError: error,
        activeBlueprintName: blueprintName,
      },
      [
        'Check that your blueprint is valid',
        'Try running the evaluation again',
        'If the issue persists, there may be a temporary service issue',
      ]
    ),

    pollingFailure: (runId: string, error: Error) => reportSandboxError(
      'Lost connection to evaluation',
      `Failed to poll evaluation status for run ${runId}: ${error.message}`,
      {
        category: SandboxErrorCategory.EVALUATION,
        operation: 'poll_evaluation',
        originalError: error,
        technicalDetails: { runId },
      },
      [
        'Check your internet connection',
        'The evaluation may still be running - check back later',
        'Try refreshing the page',
      ]
    ),
  },

  parsing: {
    yamlInvalid: (error: Error, yamlContent?: string) => reportSandboxError(
      'Invalid YAML syntax',
      `YAML parsing error: ${error.message}`,
      {
        category: SandboxErrorCategory.PARSING,
        operation: 'parse_yaml',
        originalError: error,
        technicalDetails: yamlContent ? { contentLength: yamlContent.length } : undefined,
      },
      [
        'Check for syntax errors in your YAML',
        'Ensure proper indentation (use spaces, not tabs)',
        'Verify all strings are properly quoted',
        'Switch to Form view to edit with validation',
      ]
    ),
  },
};
