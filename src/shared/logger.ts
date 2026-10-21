export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized ?? String(value);
  } catch {
    return '[unserialisable]';
  }
}

function formatContext(context: Record<string, unknown>): string {
  const entries = Object.entries(context).map(([key, value]) => `${key}=${formatValue(value)}`);
  return entries.join(' ');
}

function formatMessage(message: string, context?: Record<string, unknown>): string {
  if (!context || Object.keys(context).length === 0) {
    return message;
  }
  const formatted = formatContext(context);
  return formatted.length > 0 ? `${message} ${formatted}` : message;
}

export class ConsoleLogger implements Logger {
  private readonly level: LogLevel;
  private readonly sink: NodeJS.WritableStream;

  constructor(level: LogLevel = 'info', sink: NodeJS.WritableStream = process.stderr) {
    this.level = level;
    this.sink = sink;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write('error', message, context);
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return;
    }
    this.sink.write(`[${level}] ${formatMessage(message, context)}\n`);
  }
}

export class NullLogger implements Logger {
  debug(): void {
    return;
  }

  info(): void {
    return;
  }

  warn(): void {
    return;
  }

  error(): void {
    return;
  }
}

export function createLogger(options?: { level?: LogLevel; sink?: NodeJS.WritableStream }): Logger {
  return new ConsoleLogger(options?.level ?? 'info', options?.sink ?? process.stderr);
}
