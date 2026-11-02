/**
 * Runs the VRT Vitest project and retries a dropped browser connection.
 *
 * Vitest keeps one WebSocket to the Playwright page for the whole run. When
 * that socket closes it aborts every file still queued and exits
 * `VITEST_BROWSER_CONNECTION_CLOSED` ("Browser connection was closed while
 * running tests"), even if every test that finished had passed. CI has hit
 * this on macOS and Linux, on Chromium and WebKit, part-way through different
 * files, and a rerun of the same commit passed.
 *
 * The saved logs do not contain Vite's "optimized dependencies changed.
 * reloading" warning (Vitest prints that whenever a mid-run pre-bundle reload
 * happens), and they do not contain Vitest's "page crashed" message. The
 * wrapper therefore does not guess a browser flag. It reruns only when the
 * log is that disconnect and nothing else failed. A screenshot diff, an
 * assertion, a timeout, or a harness image/font error still fails on the
 * first attempt.
 *
 * `npm run test:vrt` with no arguments runs every browser (`--project vrt`).
 * Extra arguments are forwarded to `vitest run`, and `--project vrt` is
 * prepended when the caller did not choose a project, so
 * `npm run test:vrt -- --update` cannot spill into the unit project.
 */
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_DISCONNECT_RETRIES = 1;
const MAX_DISCONNECT_RETRIES = 2;

const ANSI_ESCAPE = /\u001B\[[0-9;]*[A-Za-z]/g;
// `gh run view --log` writes ESC as caret notation (`^[[31m`), not as ESC.
const ANSI_CARET = /\^\[\[[0-9;]*[A-Za-z]/g;

const DISCONNECT_SIGNATURE = /VITEST_BROWSER_CONNECTION_CLOSED|Browser connection was closed while running tests/;

const ERROR_LINE = /^[ \t]*(?:Caused by: )?(?:AssertionError|Error|ReferenceError|SyntaxError|TypeError):[^\n]*/gm;

const DISCONNECT_ERROR_LINE =
  /Browser connection was closed while running tests|\[birpc\] rpc is closed|There was an error when mocking a module|Failed to run the test |Failed to import test file |Failed to fetch dynamically imported module/;

// A test, screenshot, timeout, or harness failure anywhere in the log. These
// are not the socket drop, even when the socket drops afterwards.
const REAL_FAILURE_PATTERNS: readonly RegExp[] = [
  /Screenshot does not match the stored reference/,
  /No existing reference screenshot found/,
  /timed out in \d+ms/,
  /hook timed out/,
  /TestingLibraryElementError/,
  /Unable to find an element/,
  /VRT fonts were not ready/,
  /VRT image failed to load/,
  /VRT image loaded without pixels/,
  /VRT image failed to decode/,
  /Failed to preload VRT image/,
  /Failed to decode preloaded VRT image/,
  /Markdown editor did not hydrate/,
  /Failed Tests \d+/,
  /\(\d+ tests? \| \d+ failed\b/,
  /(?:^|\n)[ \t]*×/,
];

export interface VrtAttemptResult {
  code: number | null;
  output: string;
  cancelled?: boolean;
}

export function stripVrtLog(log: string): string {
  return log.replace(ANSI_ESCAPE, '').replace(ANSI_CARET, '');
}

/**
 * True when the run died because the browser socket closed and the log does
 * not also contain a test, screenshot, timeout, or harness failure.
 */
export function isRetryableVrtDisconnect(log: string): boolean {
  const plain = stripVrtLog(log);
  if (!DISCONNECT_SIGNATURE.test(plain)) return false;
  if (REAL_FAILURE_PATTERNS.some((pattern) => pattern.test(plain))) return false;

  const errorLines = plain.match(ERROR_LINE) ?? [];
  if (errorLines.length === 0) return false;
  return errorLines.every((line) => DISCONNECT_ERROR_LINE.test(line));
}

/** How many extra attempts to make after the first. `0` disables the retry. */
export function readDisconnectRetries(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VRT_BROWSER_DISCONNECT_RETRIES;
  if (raw === undefined || raw === '') return DEFAULT_DISCONNECT_RETRIES;
  if (!/^\d+$/.test(raw)) return DEFAULT_DISCONNECT_RETRIES;
  return Math.min(Number(raw), MAX_DISCONNECT_RETRIES);
}

export function vitestArgsFrom(argv: readonly string[]): string[] {
  if (argv.length === 0) return ['--project', 'vrt'];
  const namesProject = argv.some((arg) => arg === '--project' || arg === '-p' || arg.startsWith('--project='));
  if (namesProject) return [...argv];
  return ['--project', 'vrt', ...argv];
}

export function isInvokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

export async function runWithDisconnectRetry(
  runOnce: () => Promise<VrtAttemptResult>,
  options: { retries: number; warn?: (message: string) => void },
): Promise<number> {
  const warn = options.warn ?? ((message: string) => console.error(message));
  const retries = Math.max(0, options.retries);
  const attempts = retries + 1;
  let code = 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await runOnce();
    code = result.code ?? 1;
    if (result.cancelled || code === 0) return code;
    if (attempt === attempts || !isRetryableVrtDisconnect(result.output)) return code;
    warn(
      `VRT: the browser connection closed (VITEST_BROWSER_CONNECTION_CLOSED) and the log has no assertion, timeout, or screenshot diff. Retrying the run (attempt ${attempt + 1} of ${attempts}).`,
    );
  }

  return code;
}

function resolveVitestEntry(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
}

function runVitest(args: readonly string[]): Promise<VrtAttemptResult> {
  const child = spawn(process.execPath, [resolveVitestEntry(), 'run', ...args], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });
  const chunks: Buffer[] = [];
  let settled = false;
  let cancelled = false;

  return new Promise((resolve) => {
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      resolve({ code, output: Buffer.concat(chunks).toString('utf8'), cancelled });
    };
    const onSignal = () => {
      cancelled = true;
      child.kill('SIGTERM');
    };
    const collect = (stream: NodeJS.ReadableStream | null, dest: NodeJS.WriteStream) => {
      stream?.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        dest.write(chunk);
      });
    };

    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    collect(child.stdout, process.stdout);
    collect(child.stderr, process.stderr);
    child.on('error', () => finish(1));
    child.on('close', (code) => finish(code));
  });
}

async function main(): Promise<number> {
  const args = vitestArgsFrom(process.argv.slice(2));
  return runWithDisconnectRetry(() => runVitest(args), { retries: readDisconnectRetries() });
}

if (isInvokedDirectly()) {
  void main().then(
    (code) => {
      process.exit(code);
    },
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
