/**
 * Command-log entries for what the Locks spec stubs, so the runner, the video and the headless output
 * show every stand-in step in order.
 *
 * - Runner and video: each entry is a `[locks-stub]` row in the command log; clicking it prints the
 *   operation, the request and the response in the browser's DevTools console.
 * - Headless: the same lines are buffered and printed in the terminal through the `log` task at each
 *   step marker and after each test (an intercept handler cannot queue a `cy.task` itself).
 *
 * Nothing here runs in the app. Values that would be a credential in a real deployment (the access
 * credential, the auth code and state, any secret, token, signature or private key) are redacted, and
 * guarded bytes are reduced to their length.
 */

export const LOCKS_STUB_LOG_NAME = '[locks-stub]';
const STEP_LOG_NAME = '[locks-step]';
const STEP_COUNT = 6;
const REDACTED = '[redacted]';
const SECRET_FIELD = /secret|token|credential|signature|private|password|^code$|^state$/i;

const pendingLines: string[] = [];

/** Deep copy with every secret-like field replaced and guarded bytes reduced to their length. */
export const redactLocksStubValue = (value: unknown, field = ''): unknown => {
  if (field && SECRET_FIELD.test(field)) return REDACTED;
  if (field === 'bytes' && typeof value === 'string') return `<${value.length} base64 chars>`;
  if (Array.isArray(value)) return value.map((item) => redactLocksStubValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactLocksStubValue(item, key)]));
  }
  return value;
};

/** The URL with every secret-like query parameter redacted (the `/connect` auth `state`). */
export const redactLocksStubUrl = (url: string): string => {
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) {
    if (SECRET_FIELD.test(key)) parsed.searchParams.set(key, REDACTED);
  }
  return decodeURIComponent(parsed.toString());
};

/** `pubkyo1gg…` → `o1gg96ew…`: enough to tell the creator from the reader in a one-line message. */
export const shortPubky = (pubky: string): string => {
  const id = pubky.replace(/^pubky/, '');
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
};

/**
 * One `[locks-stub]` entry: `operation` is the stand-in being exercised, `message` its key parameters
 * and outcome, `details` what DevTools shows when the entry is clicked (redacted before it is stored).
 */
export const logLocksStub = (operation: string, message: string, details: Record<string, unknown> = {}) => {
  const safeDetails = redactLocksStubValue(details) as Record<string, unknown>;
  Cypress.log({
    name: 'locks-stub',
    displayName: LOCKS_STUB_LOG_NAME,
    message: `${operation}: ${message}`,
    consoleProps: () => ({ Operation: operation, ...safeDetails }),
  });
  pendingLines.push(`${LOCKS_STUB_LOG_NAME} ${operation}: ${message}`);
};

/** Prints the buffered `[locks-stub]` lines in the terminal (headless runs and `cypress open` alike). */
export const flushLocksStubLog = () => {
  cy.then(() => {
    const lines = pendingLines.splice(0);
    if (lines.length > 0) cy.task('log', lines.join('\n'), { log: false });
  });
};

/** A step marker in the command log and the terminal, after the stub lines of the step before it. */
export const locksStep = (step: number, text: string) => {
  flushLocksStubLog();
  const line = `Step ${step}/${STEP_COUNT}: ${text}`;
  cy.log(`**${STEP_LOG_NAME} ${line}**`);
  cy.task('log', `${STEP_LOG_NAME} ${line}`, { log: false });
};
