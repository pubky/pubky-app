import { gunzipSync } from 'node:zlib';
import { Pulse } from '@synonymdev/pubky-pulse-web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beforeSendPulse, initializePulseConsent, initPulse } from './pulse';
import { getPulseConsent, PULSE_CONSENT_KEY, setPulseConsent } from './pulse-consent';

const config = vi.hoisted(() => ({ key: 'pulse_client_test' as string | undefined }));
vi.mock('@/libs/env/env', () => ({ Env: { NODE_ENV: 'production', NEXT_PUBLIC_APP_VERSION: 'test' } }));
vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>()),
  getPulseClientKey: () => config.key,
  getPulseEndpoint: () => 'http://localhost:4007/pulse',
  getDeployEnv: () => 'staging',
}));

let unsubscribe: (() => void) | undefined;
const requests = vi.fn<typeof fetch>();

function sentPayloads(): string {
  return requests.mock.calls
    .map(([, init]) => init?.body)
    .map((body) => (typeof body === 'string' ? body : gunzipSync(body as Uint8Array).toString()))
    .join('\n');
}

function sdkKeys(store: Storage): string[] {
  return Array.from({ length: store.length }, (_, index) => store.key(index) ?? '').filter((key) =>
    key.startsWith('pulse.'),
  );
}

beforeEach(() => {
  config.key = 'pulse_client_test';
  localStorage.clear();
  sessionStorage.clear();
  // Reset the in-memory refusal fallback using the public choice API.
  setPulseConsent(true);
  localStorage.removeItem(PULSE_CONSENT_KEY);
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

  it('starts only after acceptance and stops without flushing on withdrawal', async () => {
    unsubscribe = initializePulseConsent();
    setPulseConsent(true);
    expect(localStorage.getItem('pulse.anonymous_id')).toMatch(/^pulse_anon_/);
    Pulse.captureException(new Error('Consented error'));
    await Pulse.flush();
    expect(requests).toHaveBeenCalled();
    expect(sentPayloads()).toContain('Consented error');
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
});
