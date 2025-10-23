import * as Sentry from '@sentry/node';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  timestamp?: boolean;
  /** Enable Sentry integration for breadcrumbs and error tracking */
  sentryEnabled?: boolean;
}

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  success(message: string, ...args: any[]): void;
}

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const defaultLogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

export async function getLogger(namespace: string, options: LoggerOptions = {}): Promise<Logger> {
  const chalk = (await import('chalk')).default;
  const {
    level = defaultLogLevel,
    prefix = namespace,
    timestamp = true,
    sentryEnabled = !!process.env.SENTRY_DSN, // Auto-enable if DSN is configured
  } = options;

  const logAtLevel = (messageLevel: LogLevel, message: string, ...args: any[]) => {
    if (levelPriority[messageLevel] < levelPriority[level]) {
      return;
    }

    const time = timestamp ? `[${new Date().toISOString()}]` : '';
    const prefixStr = prefix ? `[${prefix}]` : '';

    let logFn;
    let colorFn;

    switch (messageLevel) {
      case 'debug':
        logFn = console.debug;
        colorFn = chalk.gray;
        break;
      case 'info':
        logFn = console.info;
        colorFn = chalk.blue;
        break;
      case 'warn':
        logFn = console.warn;
        colorFn = chalk.yellow;
        break;
      case 'error':
        logFn = console.error;
        colorFn = chalk.red;
        break;
    }

    const formattedArgs = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
    );

    logFn(colorFn(`${time} ${prefixStr} ${message}`), ...formattedArgs);

    // Add Sentry breadcrumb if enabled
    if (sentryEnabled) {
      try {
        const breadcrumbData: Record<string, any> = { namespace };

        // Add structured data from args
        if (args.length > 0) {
          args.forEach((arg, idx) => {
            if (typeof arg === 'object' && arg !== null) {
              breadcrumbData[`data_${idx}`] = arg;
            } else {
              breadcrumbData[`arg_${idx}`] = arg;
            }
          });
        }

        Sentry.addBreadcrumb({
          message: `[${namespace}] ${message}`,
          level: messageLevel === 'warn' ? 'warning' : messageLevel,
          category: namespace,
          data: breadcrumbData,
          timestamp: Date.now() / 1000,
        });

        // For errors, also capture as Sentry exception if it's an Error object
        if (messageLevel === 'error' && args.length > 0) {
          const potentialError = args.find(arg => arg instanceof Error);
          if (potentialError) {
            Sentry.captureException(potentialError, {
              contexts: {
                logger: {
                  namespace,
                  message,
                  additionalData: args.filter(arg => !(arg instanceof Error)),
                },
              },
            });
          }
        }
      } catch (sentryError) {
        // Silent fail - don't break logging if Sentry fails
        console.debug('[Logger] Sentry integration error:', sentryError);
      }
    }
  };

  return {
    debug: (message: string, ...args: any[]) => logAtLevel('debug', message, ...args),
    info: (message: string, ...args: any[]) => logAtLevel('info', message, ...args),
    warn: (message: string, ...args: any[]) => logAtLevel('warn', message, ...args),
    error: (message: string, ...args: any[]) => logAtLevel('error', message, ...args),
    success: (message: string, ...args: any[]) => logAtLevel('info', message, ...args),
  };
} 