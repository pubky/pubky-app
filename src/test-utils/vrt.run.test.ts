import { describe, expect, it, vi } from 'vitest';
import {
  isInvokedDirectly,
  isRetryableVrtDisconnect,
  readDisconnectRetries,
  runWithDisconnectRetry,
  stripVrtLog,
  vitestArgsFrom,
  type VrtAttemptResult,
} from '@/test-utils/vrt.run';

const PROFILE_TAGGERS = `
✓ renders error logout 495ms
Error: Failed to run the test /work/src/test/vrt/profile/ProfileTaggers.vrt.test.tsx.
Caused by: Error: [vitest] Browser connection was closed while running tests. Was the page closed unexpectedly?
Caused by: Error: [birpc] rpc is closed, cannot call "createTesters"
Serialized Error: { code: 'VITEST_BROWSER_CONNECTION_CLOSED' }
Test Files  14 passed (32)
Tests  186 passed | 1 skipped (187)
Errors  1 error
`;

const INPUT_FIELD = `
Error: Failed to import test file /work/src/test/vrt/components/InputField.vrt.test.tsx
Caused by: TypeError: Failed to fetch dynamically imported module: http://localhost:63315/InputField.vrt.test.tsx?import&browserv=1
Error: Failed to run the test /work/src/test/vrt/components/InputField.vrt.test.tsx.
Caused by: Error: [vitest] Browser connection was closed while running tests. Was the page closed unexpectedly?
Caused by: Error: [birpc] rpc is closed, cannot call "createTesters"
Test Files  1 failed | 23 passed (32)
Tests  239 passed (239)
Errors  1 error
`;

const WEBKIT_MOCK = `
Error: [vitest] There was an error when mocking a module. If you are using "vi.mock" factory, make sure there are no top level variables inside, since this call is hoisted to top of the file.
Caused by: Error: [vitest] Browser connection was closed while running tests. Was the page closed unexpectedly?
Caused by: Error: [birpc] rpc is closed, cannot call "resolveManualMock"
`;

describe('isRetryableVrtDisconnect', () => {
  it('retries the profile-taggers, input-field, and webkit mock shapes from CI', () => {
    expect(isRetryableVrtDisconnect(PROFILE_TAGGERS)).toBe(true);
    expect(isRetryableVrtDisconnect(INPUT_FIELD)).toBe(true);
    expect(isRetryableVrtDisconnect(WEBKIT_MOCK)).toBe(true);
  });

  it('reads a GitHub log line whose ANSI was escaped as caret notation', () => {
    const escaped =
      '^[[31m^[[1mError^[[22m: Failed to run the test /tmp/ProfileTaggers.vrt.test.tsx.\n' +
      '^[[31m^[[1mCaused by: Error^[[22m: [vitest] Browser connection was closed while running tests. Was the page closed unexpectedly?\n' +
      '^[[31m^[[1mCaused by: Error^[[22m: [birpc] rpc is closed, cannot call "createTesters"\n';
    expect(stripVrtLog(escaped)).toContain('Error: Failed to run the test');
    expect(isRetryableVrtDisconnect(escaped)).toBe(true);
  });

  it('reads a real ANSI error line', () => {
    const coloured = `\u001B[31m\u001B[1mError\u001B[22m: Failed to run the test /tmp/ProfileTaggers.vrt.test.tsx.
\u001B[31mCaused by: Error\u001B[22m: [vitest] Browser connection was closed while running tests. Was the page closed unexpectedly?
\u001B[31mCaused by: Error\u001B[22m: [birpc] rpc is closed, cannot call "createTesters"`;
    expect(isRetryableVrtDisconnect(coloured)).toBe(true);
  });

  it('does not retry a screenshot diff, assertion, timeout, or harness error', () => {
    const extras = [
      'AssertionError: Screenshot does not match the stored reference.',
      'No existing reference screenshot found.',
      'Error: Test timed out in 30000ms',
      'Error: The beforeEach phase of "beforeEach" hook timed out after 10000ms.',
      'Error: VRT image failed to load: /logo.svg',
      'Error: VRT fonts were not ready after 20000ms',
      'Error: Markdown editor did not hydrate',
      'TestingLibraryElementError: Unable to find an element',
      '     × renders the landing hero at desktop viewport',
      '✓ vrt (chromium) src/test/vrt/feed/Home.vrt.test.tsx (2 tests | 1 failed) 10ms',
      'Failed Tests 1',
    ];
    for (const extra of extras) {
      expect(isRetryableVrtDisconnect(`${PROFILE_TAGGERS}\n${extra}`)).toBe(false);
    }
  });

  it('does not retry a failed import that is not the closed connection', () => {
    expect(
      isRetryableVrtDisconnect(
        'Error: Failed to import test file /tmp/InputField.vrt.test.tsx\nCaused by: SyntaxError: Unexpected token',
      ),
    ).toBe(false);
    expect(
      isRetryableVrtDisconnect(
        'Error: Failed to import test file /tmp/InputField.vrt.test.tsx\nCaused by: TypeError: Failed to fetch dynamically imported module: http://localhost/x',
      ),
    ).toBe(false);
  });

  it('does not retry when another error sits beside the disconnect', () => {
    expect(isRetryableVrtDisconnect(`${PROFILE_TAGGERS}\nError: boom`)).toBe(false);
    expect(isRetryableVrtDisconnect('Browser connection was closed while running tests')).toBe(false);
  });
});

describe('readDisconnectRetries', () => {
  function withRetries(value: string | undefined): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (value === undefined) delete env.VRT_BROWSER_DISCONNECT_RETRIES;
    else env.VRT_BROWSER_DISCONNECT_RETRIES = value;
    return env;
  }

  it('defaults to one retry and caps the override', () => {
    expect(readDisconnectRetries(withRetries(undefined))).toBe(1);
    expect(readDisconnectRetries(withRetries(''))).toBe(1);
    expect(readDisconnectRetries(withRetries('0'))).toBe(0);
    expect(readDisconnectRetries(withRetries('2'))).toBe(2);
    expect(readDisconnectRetries(withRetries('9'))).toBe(2);
    expect(readDisconnectRetries(withRetries('nope'))).toBe(1);
    expect(readDisconnectRetries(withRetries('-1'))).toBe(1);
  });
});

describe('vitestArgsFrom', () => {
  it('keeps the VRT project when the caller does not name one', () => {
    expect(vitestArgsFrom([])).toEqual(['--project', 'vrt']);
    expect(vitestArgsFrom(['--update'])).toEqual(['--project', 'vrt', '--update']);
    expect(vitestArgsFrom(['--project', 'vrt (chromium)'])).toEqual(['--project', 'vrt (chromium)']);
    expect(vitestArgsFrom(['--project=vrt (chromium)'])).toEqual(['--project=vrt (chromium)']);
  });
});

describe('runWithDisconnectRetry', () => {
  it('returns the first success without a second attempt', async () => {
    const runOnce = vi.fn<() => Promise<VrtAttemptResult>>().mockResolvedValue({ code: 0, output: '' });
    const warn = vi.fn<(message: string) => void>();
    await expect(runWithDisconnectRetry(runOnce, { retries: 1, warn })).resolves.toBe(0);
    expect(runOnce).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it('retries a disconnect once and keeps the second result', async () => {
    const runOnce = vi
      .fn<() => Promise<VrtAttemptResult>>()
      .mockResolvedValueOnce({ code: 1, output: PROFILE_TAGGERS })
      .mockResolvedValueOnce({ code: 0, output: 'passed' });
    const warn = vi.fn<(message: string) => void>();
    await expect(runWithDisconnectRetry(runOnce, { retries: 1, warn })).resolves.toBe(0);
    expect(runOnce).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain('Retrying the run (attempt 2 of 2)');
  });

  it('stops after the bounded retry when the socket drops again', async () => {
    const runOnce = vi.fn<() => Promise<VrtAttemptResult>>().mockResolvedValue({ code: 1, output: PROFILE_TAGGERS });
    await expect(runWithDisconnectRetry(runOnce, { retries: 1, warn: () => undefined })).resolves.toBe(1);
    expect(runOnce).toHaveBeenCalledTimes(2);
  });

  it('does not retry a screenshot diff or a cancelled run', async () => {
    const diff = vi.fn<() => Promise<VrtAttemptResult>>().mockResolvedValue({
      code: 1,
      output: `${PROFILE_TAGGERS}\nAssertionError: Screenshot does not match the stored reference.`,
    });
    await expect(runWithDisconnectRetry(diff, { retries: 1, warn: () => undefined })).resolves.toBe(1);
    expect(diff).toHaveBeenCalledOnce();

    const cancelled = vi.fn<() => Promise<VrtAttemptResult>>().mockResolvedValue({
      code: null,
      output: PROFILE_TAGGERS,
      cancelled: true,
    });
    await expect(runWithDisconnectRetry(cancelled, { retries: 1, warn: () => undefined })).resolves.toBe(1);
    expect(cancelled).toHaveBeenCalledOnce();
  });
});

describe('isInvokedDirectly', () => {
  it('is false when the file is imported by the unit runner', () => {
    expect(isInvokedDirectly()).toBe(false);
  });
});
