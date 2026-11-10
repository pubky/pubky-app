/**
 * Keeps the app's console errors and warnings for each test and writes them to `cypress.log` when the
 * test fails, so a failure that shows no error on screen (a feed that never leaves its skeleton) still
 * records what the app reported. CI uploads that file as the `cypress-log-*` artifact.
 */

const MAX_LINES = 300;
const MAX_LINE_LENGTH = 2_000;

let lines: string[] = [];

const formatArg = (arg: unknown): string => {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
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
    if (level) record(level.toLowerCase(), args.slice(3));
    groupCollapsed(...args);
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
