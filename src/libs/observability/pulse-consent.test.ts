import { gunzipSync } from 'node:zlib';
import { Pulse } from '@synonymdev/pubky-pulse-web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beforeSendPulse, initializePulseConsent, initPulse } from './pulse';
import {
  getPulseConsent,
  getPulseConsentSaveFailed,
  PULSE_CONSENT_GRANTED_AT_KEY,
  PULSE_CONSENT_KEY,
  setPulseConsent,
} from './pulse-consent';

const config = vi.hoisted(() => ({ key: 'pulse_client_test' as string | undefined, testnet: false }));
vi.mock('@/libs/env/env', () => ({ Env: { NODE_ENV: 'production', NEXT_PUBLIC_APP_VERSION: 'test' } }));
// getTestnet is overridden too: the real one reads PUBKY_RUNTIME_TESTNET, which src/config/test.ts sets.
vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>()),
  getPulseClientKey: () => config.key,
  getPulseEndpoint: () => 'http://localhost:4007/pulse',
  getDeployEnv: () => 'staging',
  getTestnet: () => config.testnet,
}));

let unsubscribe: (() => void) | undefined;
const requests = vi.fn<typeof fetch>();

function sentPayloads(): string {
  return requests.mock.calls
    .map(([, init]) => init?.body)
    .map((body) => (typeof body === 'string' ? body : gunzipSync(body as Uint8Array).toString()))
    .join('\n');
}

function storedKeys(store: Storage): string[] {
  return Array.from({ length: store.length }, (_, index) => store.key(index) ?? '');
}

function sdkKeys(store: Storage): string[] {
  return storedKeys(store).filter((key) => key.startsWith('pulse.'));
}

/** Accepting stamps a strictly increasing time, so a same-millisecond re-acceptance still reads as newer. */
function nextGeneration(after: string | null = localStorage.getItem(PULSE_CONSENT_GRANTED_AT_KEY)): string {
  const previous = Number(after);
  return String(Math.max(Date.now(), Number.isSafeInteger(previous) ? previous + 1 : 0));
}

/**
 * jsdom has a single realm, so another tab is simulated by writing exactly the keys it would write.
 * setPulseConsent() cannot stand in: it would share this realm's in-memory refusal fallback.
 */
function otherTabAccepts(after?: string | null): void {
  // Stamp first: no tab may ever read 'accepted' beside an older acceptance time.
  localStorage.setItem(PULSE_CONSENT_GRANTED_AT_KEY, nextGeneration(after));
  localStorage.setItem(PULSE_CONSENT_KEY, 'accepted');
}

/** Only the refusal reaches this tab, so nothing was deleted for it and its own cleanup has to show. */
function otherTabDeclines(): void {
  localStorage.setItem(PULSE_CONSENT_KEY, 'declined');
}

/**
 * A real withdrawal elsewhere: that tab runs the same gate, so its browser-wide Pulse.reset() also
 * deletes the `pulse.` localStorage every tab shares. Its own sessionStorage goes with it, which in
 * jsdom's single realm would be this tab's — the one store another tab can never reach — so it stays.
 */
function otherTabWithdraws(): void {
  otherTabDeclines();
  for (const key of sdkKeys(localStorage)) localStorage.removeItem(key);
}

/** The anonymous browser another tab started after re-accepting; this browser's only shared ID. */
const OTHER_TAB_ANONYMOUS_ID = 'pulse_anon_00000000-0000-4000-8000-0000000000aa';

/** Another tab starts over under the current consent, so the shared ID is one this tab never held. */
function otherTabStartsOver(): void {
  localStorage.setItem('pulse.anonymous_id', OTHER_TAB_ANONYMOUS_ID);
}

/**
 * An event another tab recorded under the current consent and could not deliver, parked in the offline
 * queue every tab shares. Whichever tab flushes next drains it; a browser-wide reset deletes it.
 */
function otherTabParks(message: string): void {
  localStorage.setItem(
    'pulse.offline_queue',
    JSON.stringify([
      {
        client_event_id: '00000000-0000-4000-8000-0000000000ab',
        session_id: '00000000-0000-4000-8000-0000000000ac',
        user_id: OTHER_TAB_ANONYMOUS_ID,
        level: 'error',
        message,
        environment: 'web',
        sdk_name: 'pubky-pulse-web',
        sdk_version: '0.9.0',
        is_dev: true,
        timestamp: new Date().toISOString(),
      },
    ]),
  );
}

/** jsdom never fires storage events for its own writes; a real second tab's write would. */
function deliverStorageEvent(key: string): void {
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

/** The page goes away: its listeners die and the client is dropped, while both storage areas survive. */
function leavePage(): void {
  unsubscribe?.();
  unsubscribe = undefined;
  Pulse.init({ enabled: false });
}

/** The tab comes back to the storage a previous page left behind: a fresh page installs the gate again. */
function returnToPage(): void {
  unsubscribe = initializePulseConsent();
}

beforeEach(() => {
  config.key = 'pulse_client_test';
  config.testnet = false;
  localStorage.clear();
  sessionStorage.clear();
  // Reset the in-memory refusal fallback using the public choice API.
  setPulseConsent(true);
  localStorage.removeItem(PULSE_CONSENT_KEY);
  localStorage.removeItem(PULSE_CONSENT_GRANTED_AT_KEY);
  requests.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', requests);
});
afterEach(() => {
  unsubscribe?.();
  Pulse.init({ enabled: false });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('consent gate with the real Pulse SDK', () => {
  it.each([null, 'declined', 'invalid'])(
    'does not initialize, write an ID or send before acceptance (%s)',
    async (choice) => {
      if (choice !== null) localStorage.setItem(PULSE_CONSENT_KEY, choice);
      const init = vi.spyOn(Pulse, 'init');
      unsubscribe = initializePulseConsent();
      initPulse();
      Pulse.captureException(new Error('Before consent'));
      await Pulse.flush();
      expect(init).not.toHaveBeenCalled();
      expect(localStorage.getItem('pulse.anonymous_id')).toBeNull();
      expect(sessionStorage.length).toBe(0);
      expect(requests).not.toHaveBeenCalled();
    },
  );

  it('stores nothing but the refusal when consent is declined', () => {
    setPulseConsent(false);
    // Declining must leave no acceptance time behind: a visitor who never said yes stores only the refusal.
    expect(localStorage.getItem(PULSE_CONSENT_GRANTED_AT_KEY)).toBeNull();
    expect(storedKeys(localStorage)).toEqual([PULSE_CONSENT_KEY]);
    expect(storedKeys(sessionStorage)).toEqual([]);
  });

  it.each([undefined, '', '   '])(
    'never starts with an absent/blank key, even with saved consent (%s)',
    async (key) => {
      config.key = key;
      localStorage.setItem(PULSE_CONSENT_KEY, 'accepted');
      unsubscribe = initializePulseConsent();
      await Pulse.flush();
      expect(getPulseConsent()).toBe('unavailable');
      expect(localStorage.getItem('pulse.anonymous_id')).toBeNull();
      expect(requests).not.toHaveBeenCalled();
    },
  );

  it('collects nothing on a testnet deploy, the gate Sentry already applies', async () => {
    config.testnet = true;
    localStorage.setItem(PULSE_CONSENT_KEY, 'accepted');
    unsubscribe = initializePulseConsent();
    initPulse();
    Pulse.captureException(new Error('On testnet'));
    await Pulse.flush();
    expect(getPulseConsent()).toBe('unavailable');
    expect(requests).not.toHaveBeenCalled();
    expect(sdkKeys(localStorage)).toEqual([]);
    expect(sdkKeys(sessionStorage)).toEqual([]);
  });

  it('deletes the state an earlier load stored once the deploy is a testnet', () => {
    otherTabAccepts();
    unsubscribe = initializePulseConsent();
    expect(localStorage.getItem('pulse.anonymous_id')).not.toBeNull();
    config.testnet = true;
    window.dispatchEvent(new Event('focus'));
    expect(Pulse.currentUserId).toBeUndefined();
    expect(sdkKeys(localStorage)).toEqual([]);
    expect(sdkKeys(sessionStorage)).toEqual([]);
  });

  it('starts only after acceptance and stops without flushing on withdrawal', async () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    expect(localStorage.getItem('pulse.anonymous_id')).toMatch(/^pulse_anon_/);
    Pulse.captureException(new Error('Consented error'));
    await Pulse.flush();
    expect(requests).toHaveBeenCalled();
    expect(sentPayloads()).toContain('Consented error');
    // The events init() records synchronously must survive the gate: the marker naming this tab's consent
    // is written before init, so the session start is never dropped as state predating the current choice.
    expect(sentPayloads()).toContain('sdk:session_started');
    requests.mockClear();
    Pulse.captureException(new Error('Pending before withdrawal'));
    setPulseConsent(false);
    Pulse.captureException(new Error('After withdrawal'));
    window.dispatchEvent(new Event('pagehide'));
    await Pulse.flush();
    expect(Pulse.currentUserId).toBeUndefined();
    expect(requests).not.toHaveBeenCalled();
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('declined');
    // Withdrawal deletes what the banner asked consent to store, not only the consent choice.
    expect(localStorage.getItem('pulse.anonymous_id')).toBeNull();
    expect(sdkKeys(localStorage)).toEqual([]);
    expect(sdkKeys(sessionStorage)).toEqual([]);
    // Nothing per-tab survives either: the marker naming the consent this tab started under goes too.
    expect(sessionStorage.length).toBe(0);
    // The acceptance time is kept, not deleted: it is not an identifier, and a tab that slept through the
    // withdrawal needs it to tell that its own Pulse state predates the current choice.
    expect(localStorage.getItem(PULSE_CONSENT_GRANTED_AT_KEY) ?? '').toMatch(/^\d+$/);
  });

  it('starts over as a new anonymous browser after re-acceptance without replaying withdrawn events', async () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    const firstId = Pulse.currentUserId;
    expect(firstId).toMatch(/^pulse_anon_/);
    Pulse.captureException(new Error('Pending before withdrawal'));
    setPulseConsent(false);
    setPulseConsent(true);
    expect(Pulse.currentUserId).toMatch(/^pulse_anon_/);
    expect(Pulse.currentUserId).not.toBe(firstId);
    Pulse.captureException(new Error('After re-acceptance'));
    await Pulse.flush();
    expect(sentPayloads()).toContain('After re-acceptance');
    expect(sentPayloads()).not.toContain('Pending before withdrawal');
  });

  it('honors saved consent and a withdrawal from another tab', async () => {
    localStorage.setItem(PULSE_CONSENT_KEY, 'accepted');
    unsubscribe = initializePulseConsent();
    expect(Pulse.currentUserId).toMatch(/^pulse_anon_/);
    localStorage.setItem(PULSE_CONSENT_KEY, 'declined');
    window.dispatchEvent(new StorageEvent('storage', { key: PULSE_CONSENT_KEY }));
    await Pulse.flush();
    expect(Pulse.currentUserId).toBeUndefined();
    expect(requests).not.toHaveBeenCalled();
    expect(sdkKeys(localStorage)).toEqual([]);
    expect(sdkKeys(sessionStorage)).toEqual([]);
  });

  it('fails closed when storage cannot be read or a choice cannot be saved', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked');
    });
    unsubscribe = initializePulseConsent();
    expect(Pulse.currentUserId).toBeUndefined();
    read.mockRestore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked');
    });
    expect(setPulseConsent(true)).toBe(false);
    expect(Pulse.currentUserId).toBeUndefined();
    expect(getPulseConsent()).toBe('declined');
  });

  it('drops events if consent changed before a storage event is delivered', () => {
    expect(beforeSendPulse({ message: 'Not consented' } as Parameters<typeof beforeSendPulse>[0], {})).toBeNull();
  });

  it('resets a tab that slept through a withdrawal and re-acceptance in another tab', async () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    const firstId = Pulse.currentUserId;
    const firstSession = sessionStorage.getItem('pulse.session_id') ?? '';
    expect(firstId).toMatch(/^pulse_anon_/);
    expect(firstSession).toMatch(/.+/);
    Pulse.captureException(new Error('Pending before withdrawal'));
    // Both writes land while this tab is suspended, so re-reading the choice only ever shows 'accepted'.
    otherTabWithdraws();
    otherTabAccepts();
    deliverStorageEvent(PULSE_CONSENT_KEY);
    await Pulse.flush();
    expect(Pulse.currentUserId).toMatch(/^pulse_anon_/);
    expect(Pulse.currentUserId).not.toBe(firstId);
    expect(sessionStorage.getItem('pulse.session_id')).not.toBe(firstSession);
    expect(sentPayloads()).not.toContain('Pending before withdrawal');
    expect(sentPayloads()).not.toContain(firstSession);
  });

  it.each(['pageshow', 'focus'])('resets on %s when no storage event was delivered', async (eventName) => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    const firstId = Pulse.currentUserId;
    const firstSession = sessionStorage.getItem('pulse.session_id') ?? '';
    expect(firstSession).toMatch(/.+/);
    Pulse.captureException(new Error('Pending before withdrawal'));
    otherTabWithdraws();
    otherTabAccepts();
    // A bfcache restore or a refocus replays no storage event for writes made while the tab was away.
    window.dispatchEvent(new Event(eventName));
    await Pulse.flush();
    expect(Pulse.currentUserId).toMatch(/^pulse_anon_/);
    expect(Pulse.currentUserId).not.toBe(firstId);
    expect(sessionStorage.getItem('pulse.session_id')).not.toBe(firstSession);
    expect(sentPayloads()).not.toContain('Pending before withdrawal');
    expect(sentPayloads()).not.toContain(firstSession);
  });

  it.each([
    [
      'a fresh page',
      () => {
        leavePage();
        returnToPage();
      },
    ],
    ['the live client', () => window.dispatchEvent(new Event('focus'))],
  ])("keeps another tab's current-consent events when reconciling on %s", async (_where, reconcile) => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    const staleSession = sessionStorage.getItem('pulse.session_id') ?? '';
    expect(staleSession).toMatch(/.+/);
    Pulse.captureException(new Error('Recorded under the old consent'));
    // All of this lands while this tab is suspended: another tab withdraws, accepts again, starts over
    // as a new anonymous browser and parks an event it could not deliver in the shared offline queue.
    otherTabWithdraws();
    otherTabAccepts();
    otherTabStartsOver();
    otherTabParks('Parked under the current consent');
    requests.mockClear();
    reconcile();
    await Pulse.flush();
    // Cleaning up this tab must not take the state the freshly consented tabs share: their event is
    // still deliverable, and this tab joins the anonymous browser they are already using.
    expect(sentPayloads()).toContain('Parked under the current consent');
    expect(localStorage.getItem('pulse.anonymous_id')).toBe(OTHER_TAB_ANONYMOUS_ID);
    expect(Pulse.currentUserId).toBe(OTHER_TAB_ANONYMOUS_ID);
    // Nothing this tab held under the old consent crosses: not its session, not what it recorded.
    expect(sessionStorage.getItem('pulse.session_id')).not.toBe(staleSession);
    expect(sentPayloads()).not.toContain(staleSession);
    expect(sentPayloads()).not.toContain('Recorded under the old consent');
  });

  it("delivers another tab's parked events when a brand new tab starts under the same consent", async () => {
    otherTabAccepts();
    otherTabStartsOver();
    otherTabParks('Parked under the current consent');
    // The control for the test above: a tab with no state of its own reconciles nothing and deletes nothing.
    unsubscribe = initializePulseConsent();
    await Pulse.flush();
    expect(localStorage.getItem('pulse.anonymous_id')).toBe(OTHER_TAB_ANONYMOUS_ID);
    expect(sentPayloads()).toContain('Parked under the current consent');
  });

  it('deletes the session a previous page stored when the tab returns after withdrawal', async () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    expect(sessionStorage.getItem('pulse.session_id')).toMatch(/.+/);
    leavePage();
    // Only this tab holds its session, so no other tab can delete it on the withdrawal.
    otherTabDeclines();
    returnToPage();
    await Pulse.flush();
    expect(Pulse.currentUserId).toBeUndefined();
    expect(sdkKeys(sessionStorage)).toEqual([]);
    expect(sdkKeys(localStorage)).toEqual([]);
  });

  it('does not resume the old session when the tab returns after withdrawal and re-acceptance', async () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    const firstId = Pulse.currentUserId;
    const firstSession = sessionStorage.getItem('pulse.session_id') ?? '';
    expect(firstSession).toMatch(/.+/);
    leavePage();
    otherTabWithdraws();
    otherTabAccepts();
    // Startup sees 'accepted', so the withdrawal is invisible unless the stale state announces itself.
    returnToPage();
    requests.mockClear();
    Pulse.captureException(new Error('After re-acceptance'));
    await Pulse.flush();
    expect(Pulse.currentUserId).toMatch(/^pulse_anon_/);
    expect(Pulse.currentUserId).not.toBe(firstId);
    expect(sessionStorage.getItem('pulse.session_id')).not.toBe(firstSession);
    expect(sentPayloads()).not.toContain(firstSession);
  });

  it('resets after storage was cleared and consent given again while the tab slept', async () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    const firstId = Pulse.currentUserId;
    const clearedGeneration = localStorage.getItem(PULSE_CONSENT_GRANTED_AT_KEY);
    // Site data cleared elsewhere: the shared keys are gone while this tab still holds the old identity.
    localStorage.clear();
    otherTabAccepts(clearedGeneration);
    window.dispatchEvent(new Event('pageshow'));
    await Pulse.flush();
    expect(Pulse.currentUserId).toMatch(/^pulse_anon_/);
    expect(Pulse.currentUserId).not.toBe(firstId);
  });

  it('resets when a withdrawal could not be saved and consent was later given again', async () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    const firstId = Pulse.currentUserId;
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked');
    });
    // The withdrawal fails closed in memory only; nothing about it can be read back later.
    expect(setPulseConsent(false)).toBe(false);
    expect(getPulseConsent()).toBe('declined');
    blocked.mockRestore();
    otherTabAccepts();
    deliverStorageEvent(PULSE_CONSENT_KEY);
    await Pulse.flush();
    expect(Pulse.currentUserId).toMatch(/^pulse_anon_/);
    expect(Pulse.currentUserId).not.toBe(firstId);
  });

  it('stops reporting a failed write once another tab stores a choice', () => {
    unsubscribe = initializePulseConsent();
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked');
    });
    expect(setPulseConsent(true)).toBe(false);
    expect(getPulseConsentSaveFailed()).toBe(true);
    blocked.mockRestore();
    otherTabAccepts();
    deliverStorageEvent(PULSE_CONSENT_KEY);
    expect(getPulseConsentSaveFailed()).toBe(false);
  });

  it('resyncs when only the acceptance time changed', async () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    const firstId = Pulse.currentUserId;
    const firstSession = sessionStorage.getItem('pulse.session_id') ?? '';
    // A repeated Accept in another tab rewrites the same 'accepted' value, for which browsers fire no
    // storage event, so the acceptance time is the only change this tab can be told about.
    localStorage.setItem(PULSE_CONSENT_GRANTED_AT_KEY, nextGeneration());
    deliverStorageEvent(PULSE_CONSENT_GRANTED_AT_KEY);
    await Pulse.flush();
    // This tab starts over, but nothing was withdrawn: no deletion was promised, the shared anonymous
    // browser is still the consented one every other tab is using, and it stays.
    expect(Pulse.currentUserId).toBe(firstId);
    expect(sessionStorage.getItem('pulse.session_id')).not.toBe(firstSession);
  });

  it('drops events recorded after a missed withdrawal until the tab resyncs', async () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    requests.mockClear();
    otherTabWithdraws();
    otherTabAccepts();
    // No event has reached this tab yet: the gate that runs as an event is recorded has to hold the line.
    Pulse.captureException(new Error('Recorded while stale'));
    await Pulse.flush();
    expect(sentPayloads()).not.toContain('Recorded while stale');
  });

  it('keeps the shared anonymous ID when a new tab opens under the same consent', () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    const firstId = Pulse.currentUserId;
    expect(firstId).toMatch(/^pulse_anon_/);
    leavePage();
    // A brand new tab has an empty session store and must never wipe the browser-wide anonymous ID.
    sessionStorage.clear();
    returnToPage();
    expect(Pulse.currentUserId).toBe(firstId);
    expect(localStorage.getItem('pulse.anonymous_id')).toBe(firstId);
  });

  it('resumes the tab session across a reload under the same consent', () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    const firstSession = sessionStorage.getItem('pulse.session_id') ?? '';
    expect(firstSession).toMatch(/.+/);
    leavePage();
    returnToPage();
    expect(sessionStorage.getItem('pulse.session_id')).toBe(firstSession);
  });

  it('does not start when the tab cannot record which consent it started under', async () => {
    const setItem = Storage.prototype.setItem;
    // Only the per-tab store is blocked, so the provenance of this tab's Pulse state cannot be recorded.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === sessionStorage) throw new DOMException('Blocked');
      setItem.call(this, key, value);
    });
    localStorage.setItem(PULSE_CONSENT_GRANTED_AT_KEY, nextGeneration());
    localStorage.setItem(PULSE_CONSENT_KEY, 'accepted');
    unsubscribe = initializePulseConsent();
    await Pulse.flush();
    expect(localStorage.getItem('pulse.anonymous_id')).toBeNull();
    expect(Pulse.currentUserId).toBeUndefined();
  });

  it('retries on the next sync when init fails instead of reporting Pulse as running', async () => {
    // Pulse.init reports a refused or failed start through its result instead of throwing. A key the SDK
    // rejects forces that path here; outside this mock the runtime-config schema would reject it first.
    config.key = 'not_a_pulse_client_key';
    otherTabAccepts();
    unsubscribe = initializePulseConsent();
    await Pulse.flush();
    expect(Pulse.currentUserId).toBeUndefined();
    expect(requests).not.toHaveBeenCalled();
    config.key = 'pulse_client_test';
    window.dispatchEvent(new Event('focus'));
    expect(Pulse.currentUserId).toMatch(/^pulse_anon_/);
  });
});
