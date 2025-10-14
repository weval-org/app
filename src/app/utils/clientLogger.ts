/**
 * Client-side debug logging utility
 *
 * Only logs in development mode. In production, all log calls are no-ops.
 *
 * @example
 * import { createClientLogger } from '@/app/utils/clientLogger';
 *
 * const debug = createClientLogger('MyComponent');
 * debug.log('User clicked button', { buttonId: 'submit' });
 * debug.time('fetchData');
 * // ... do work
 * debug.timeEnd('fetchData');
 */

const IS_DEV = process.env.NODE_ENV === 'development';

export interface ClientLogger {
  log: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  time: (label: string) => void;
  timeEnd: (label: string) => void;
  group: (label: string) => void;
  groupEnd: () => void;
}

/**
 * Creates a namespaced client-side logger
 * @param namespace - Component or module name for log prefixing
 * @returns ClientLogger with log, warn, error, time, timeEnd, group, groupEnd methods
 */
export function createClientLogger(namespace: string): ClientLogger {
  const prefix = `[${namespace}]`;

  if (!IS_DEV) {
    // No-op functions for production
    const noop = () => {};
    return {
      log: noop,
      warn: noop,
      error: noop,
      time: noop,
      timeEnd: noop,
      group: noop,
      groupEnd: noop,
    };
  }

  return {
    log: (...args: any[]) => console.log(prefix, ...args),
    warn: (...args: any[]) => console.warn(prefix, ...args),
    error: (...args: any[]) => console.error(prefix, ...args),
    time: (label: string) => console.time(`${prefix} ${label}`),
    timeEnd: (label: string) => console.timeEnd(`${prefix} ${label}`),
    group: (label: string) => console.group(`${prefix} ${label}`),
    groupEnd: () => console.groupEnd(),
  };
}
