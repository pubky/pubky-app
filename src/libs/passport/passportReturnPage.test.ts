import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PASSPORT_RETURN_MESSAGE_TYPE, PASSPORT_RETURN_PATH, PASSPORT_RETURN_QUERY } from '@/config/passport';
import { parsePassportReturnMessage } from './passport';

/**
 * `public/passport/return.html` is a static file (no Next route, no app shell) whose inline script
 * mirrors the config constants by hand. These tests load the real file, run its script against a
 * fake `window` and parse its markup, so a drift between the page and `src/config/passport.ts` /
 * `parsePassportReturnMessage` fails here.
 */

const APP_ORIGIN = 'https://app.example.com';
const ATTEMPT_ID = 'attempt-1234';
const PAGE_HTML = readFileSync(join(process.cwd(), 'public', PASSPORT_RETURN_PATH), 'utf8');
const PAGE_SCRIPT = /<script>([\s\S]*?)<\/script>/.exec(PAGE_HTML)?.[1] ?? '';

type FakeOpener = { closed: boolean; postMessage: ReturnType<typeof vi.fn> };

type FakeWindow = {
  location: { search: string; origin: string };
  opener: FakeOpener | null;
  close: ReturnType<typeof vi.fn>;
  setTimeout: (callback: () => void, delay: number) => number;
};

function runPageScript(search: string, opener: FakeOpener | null) {
  const deferred: Array<() => void> = [];
  const fakeWindow: FakeWindow = {
    location: { search, origin: APP_ORIGIN },
    opener,
    close: vi.fn(),
    setTimeout: (callback) => {
      deferred.push(callback);
      return deferred.length;
    },
  };
  // The page script only touches `window.*` and the global `URLSearchParams`.
  new Function('window', PAGE_SCRIPT)(fakeWindow);
  return { fakeWindow, runDeferred: () => deferred.forEach((callback) => callback()) };
}

describe('public/passport/return.html', () => {
  it('serves the path the x-callback URLs point at and renders a visible return link', () => {
    expect(PASSPORT_RETURN_PATH.endsWith('.html')).toBe(true);
    expect(PAGE_SCRIPT.length).toBeGreaterThan(0);

    const document = new DOMParser().parseFromString(PAGE_HTML, 'text/html');
    const link = document.querySelector('[data-testid="passport-return-link"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/');
    expect(link?.textContent).toBe('Return to Pubky');
  });

  it('relays a valid outcome to the opener on the app origin, then closes on the next tick', () => {
    const opener: FakeOpener = { closed: false, postMessage: vi.fn() };
    const { fakeWindow, runDeferred } = runPageScript(
      `?${PASSPORT_RETURN_QUERY.attempt}=${ATTEMPT_ID}&${PASSPORT_RETURN_QUERY.outcome}=success`,
      opener,
    );

    expect(opener.postMessage).toHaveBeenCalledTimes(1);
    const [data, targetOrigin] = opener.postMessage.mock.calls[0] as [unknown, string];
    expect(targetOrigin).toBe(APP_ORIGIN);
    expect(data).toEqual({ type: PASSPORT_RETURN_MESSAGE_TYPE, attemptId: ATTEMPT_ID, outcome: 'success' });

    // The message must be exactly what the opener's validator accepts for this attempt and popup.
    const popup = {};
    expect(
      parsePassportReturnMessage({ origin: APP_ORIGIN, source: popup, data }, popup, APP_ORIGIN, ATTEMPT_ID),
    ).toEqual({ attemptId: ATTEMPT_ID, outcome: 'success' });

    // Closing is deferred so the opener sees the message before `popup.closed`.
    expect(fakeWindow.close).not.toHaveBeenCalled();
    runDeferred();
    expect(fakeWindow.close).toHaveBeenCalledTimes(1);
  });

  it.each(['?attempt=a', '?outcome=success', `?attempt=${ATTEMPT_ID}&outcome=signed-in`, '?attempt=&outcome=success'])(
    'does not post or close for the malformed query %s',
    (search) => {
      const opener: FakeOpener = { closed: false, postMessage: vi.fn() };
      const { fakeWindow, runDeferred } = runPageScript(search, opener);

      runDeferred();
      expect(opener.postMessage).not.toHaveBeenCalled();
      expect(fakeWindow.close).not.toHaveBeenCalled();
    },
  );

  it('does nothing when there is no opener or the opener is closed', () => {
    const withoutOpener = runPageScript(`?attempt=${ATTEMPT_ID}&outcome=cancel`, null);
    withoutOpener.runDeferred();
    expect(withoutOpener.fakeWindow.close).not.toHaveBeenCalled();

    const closedOpener: FakeOpener = { closed: true, postMessage: vi.fn() };
    const withClosedOpener = runPageScript(`?attempt=${ATTEMPT_ID}&outcome=error`, closedOpener);
    withClosedOpener.runDeferred();
    expect(closedOpener.postMessage).not.toHaveBeenCalled();
    expect(withClosedOpener.fakeWindow.close).not.toHaveBeenCalled();
  });

  it('does not close when posting to the opener throws', () => {
    const opener: FakeOpener = {
      closed: false,
      postMessage: vi.fn(() => {
        throw new Error('detached');
      }),
    };
    const { fakeWindow, runDeferred } = runPageScript(`?attempt=${ATTEMPT_ID}&outcome=success`, opener);

    runDeferred();
    expect(fakeWindow.close).not.toHaveBeenCalled();
  });
});
