import type { LogLevel } from './logger.type';

export class Logger {
  private constructor() {}

  private static isDebugMode = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';
  private static isTestEnvironment = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  private static isInitialized = false;

  private static readonly COLORS = {
    debug: '#B388FF',
    info: '#00BCD4',
    warn: '#FFC107',
    error: '#FF5252',
    stack: '#A9A9A9', // Neutral gray that works well on both themes
  } as const;

  private static formatTimestamp(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');

    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  private static initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  static shouldLog(level: LogLevel): boolean {
    if (this.isTestEnvironment) return false; // Don't log during tests unless explicitly enabled

    if (level === 'error') return true; // Always log errors in non-test environments
    if (level === 'warn') return true; // Always log warnings in non-test environments
    if (typeof window === 'undefined') return false; // Suppress debug/info on server and during SSR/SSG
    return this.isDebugMode; // Only log debug and info in debug mode
  }

  private static formatTitle(firstArg: unknown): string {
    if (firstArg === undefined || firstArg === null) return 'No message provided';
    return typeof firstArg === 'string' ? firstArg : JSON.stringify(firstArg);
  }

  private static getStack(): string | undefined {
    return new Error().stack
      ?.split('\n')
      .slice(3) // Remove the Error, getStack() and log method calls
      .map((line) => line.trim())
      .join('\n');
  }

  private static log(
    level: keyof typeof Logger.COLORS,
    args: unknown[],
    fallbackFn: (...args: unknown[]) => void,
  ): void {
    if (args.length === 0) return;
    if (!this.shouldLog(level as LogLevel)) return;
    if (level === 'error') this.initialize();

    // Server/runtime-safe path: use plain console output, no browser grouping/styles.
    if (typeof window === 'undefined') {
      fallbackFn('[' + level.toUpperCase() + ']', ...args);
      return;
    }

    try {
      const stack = this.getStack();
      const timestamp = this.formatTimestamp(new Date());
      const [title, ...rest] = args;

      console.groupCollapsed(
        '%c[' + level.toUpperCase() + ']%c %s',
        `color: ${this.COLORS[level]}; font-weight: bold`,
        'color: inherit; font-weight: normal',
        this.formatTitle(title),
      );
      console.log(`Time: ${timestamp}`);

      if (rest.length > 0) {
        console.groupCollapsed('Details');
        rest.forEach((arg) => {
          if (arg !== undefined && arg !== null) {
            console.log(arg);
          }
        });
        console.groupEnd();
      }

      if (stack) {
        console.groupCollapsed('Stack Trace');
        console.log('%c' + stack, `color: ${this.COLORS.stack}; font-family: monospace`);
        console.groupEnd();
      }
      console.groupEnd();
    } catch {
      // Fallback to simple logging if something goes wrong
      fallbackFn('[' + level.toUpperCase() + ']', ...args);
    }
  }

  static debug(...args: unknown[]): void {
    this.log('debug', args, console.debug);
  }

  static info(...args: unknown[]): void {
    this.log('info', args, console.info);
  }

  static warn(...args: unknown[]): void {
    this.log('warn', args, console.warn);
  }

  static error(...args: unknown[]): void {
    this.log('error', args, console.error);
  }
}
