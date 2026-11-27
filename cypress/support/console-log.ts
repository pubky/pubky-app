/**
 * Keeps the app's console errors and warnings for each test and writes them to `cypress.log` when the
 * test fails, so a failure that shows no error on screen (a feed that never leaves its skeleton) still
 * records what the app reported. CI uploads that file as the `cypress-log-*` artifact.
 */

const MAX_LINES = 600;
const MAX_LINE_LENGTH = 2_000;

let lines: string[] = [];

// The app's errors come from the page's window, where `instanceof Error` of the spec's window does not hold
const isErrorLike = (arg: unknown): arg is Error =>
  typeof arg === 'object' && arg !== null && typeof Reflect.get(arg, 'message') === 'string' && 'stack' in arg;

const formatArg = (arg: unknown): string => {
  if (isErrorLike(arg)) {
    // An AppError's own fields (code, operation, context) say which read failed
    const fields = Object.fromEntries(Object.entries(arg).filter(([key]) => key !== 'cause' && key !== 'stack'));
    let detail = '';
    try {
      detail = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
    } catch {
      detail = '';
    }
    return `${arg.name}: ${arg.message}${detail}`;
  }
  if (typeof arg === 'string') return arg;
  try {
    // A details object usually holds the error under a key
    return JSON.stringify(arg, (_key, value: unknown) => (isErrorLike(value) ? formatArg(value) : value));
  } catch {
    return String(arg);
  }
};

const record = (level: string, args: unknown[]) => {
  const line = `${new Date().toISOString()} [${level}] ${args.map(formatArg).join(' ')}`;
  lines.push(line.slice(0, MAX_LINE_LENGTH));
  if (lines.length > MAX_LINES) lines.shift();
};

Cypress.on('window:before:load', (win) => {
  record('page-load', []);
  const appConsole = win.console;
  const error = appConsole.error.bind(appConsole);
  const warn = appConsole.warn.bind(appConsole);
  const groupCollapsed = appConsole.groupCollapsed.bind(appConsole);
  const groupEnd = appConsole.groupEnd.bind(appConsole);
  const log = appConsole.log.bind(appConsole);
  // Groups open inside an error or warning entry, where the Logger prints the entry's details with console.log
  let entryDepth = 0;

  appConsole.error = (...args: unknown[]) => {
    record('error', args);
    error(...args);
  };
  appConsole.warn = (...args: unknown[]) => {
    record('warn', args);
    warn(...args);
  };
  // The app's Logger opens a styled group per entry: `'%c[ERROR]%c %s', style, style, title`.
  appConsole.groupCollapsed = (...args: unknown[]) => {
    const label = typeof args[0] === 'string' ? args[0] : '';
    const level = /\[(ERROR|WARN)\]/.exec(label)?.[1];
    if (level) {
      record(level.toLowerCase(), args.slice(3));
      entryDepth = 1;
    } else if (entryDepth > 0) {
      entryDepth += 1;
    }
    groupCollapsed(...args);
  };
  appConsole.groupEnd = () => {
    if (entryDepth > 0) entryDepth -= 1;
    groupEnd();
  };
  appConsole.log = (...args: unknown[]) => {
    // The entry's time and its styled stack trace add nothing to the line
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (entryDepth > 0 && !first.startsWith('Time: ') && !first.startsWith('%c')) record('detail', args);
    log(...args);
  };
  win.addEventListener('unhandledrejection', (event) => record('unhandled-rejection', [event.reason]));
  win.addEventListener('error', (event) => record('uncaught', [event.error ?? event.message]));
});

beforeEach(() => {
  lines = [];
});

afterEach(function () {
  const test = this.currentTest;
  if (test?.state !== 'failed') return;
  const message = lines.length > 0 ? lines.join('\n') : '(no console errors or warnings)';
  cy.task('logToFile', { testName: test.fullTitle(), message: `${message}\n` }, { log: false });
});
