export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  timestamp?: boolean;
}

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
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
  };

  return {
    debug: (message: string, ...args: any[]) => logAtLevel('debug', message, ...args),
    info: (message: string, ...args: any[]) => logAtLevel('info', message, ...args),
    warn: (message: string, ...args: any[]) => logAtLevel('warn', message, ...args),
    error: (message: string, ...args: any[]) => logAtLevel('error', message, ...args),
  };
} 