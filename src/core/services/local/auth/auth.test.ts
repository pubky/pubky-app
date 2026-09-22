import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedAuth } from '@/libs/auth/session.types';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { LocalAuthService } from './auth';

const record: PersistedAuth = {
  currentUserPubky: 'alice',
  hasProfile: true,
  sessionReference: { kind: 'cookie', sessionExport: 'cookie' },
  generation: 'new',
  retiringSession: null,
};
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, callback: () => void) => callback() },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
});
describe('durable authentication transitions', () => {
  it('checks cancellation inside the lock before changing the durable record', async () => {
    let release!: () => void;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, callback: () => void) =>
          new Promise<void>((resolve, reject) => {
            release = () => {
              try {
                callback();
                resolve();
              } catch (error) {
                reject(error);
              }
            };
          }),
      },
    });
    let active = true;
    const transition = LocalAuthService.commit(record, '', () => active);
    const rejected = expect(transition).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    active = false;
    release();
    await rejected;
    expect(localStorage.getItem(AUTH_PERSIST_KEY)).toBeNull();
    // A subsequent explicit transition still works after cancellation.
    const retry = LocalAuthService.commit(record, '');
    release();
    await retry;
    expect(LocalAuthService.read()?.generation).toBe('new');
  });
  it('does not replace a newer generation', async () => {
    await LocalAuthService.commit(record, '');
    await expect(LocalAuthService.commit({ ...record, generation: 'stale' }, '')).rejects.toMatchObject({
      name: 'AuthFlowCanceled',
    });
    expect(LocalAuthService.read()?.generation).toBe('new');
  });
  it('normalizes malformed record errors without attaching credential data', () => {
    localStorage.setItem(AUTH_PERSIST_KEY, '{private-material');
    try {
      LocalAuthService.read();
      expect.fail('Must reject');
    } catch (error) {
      expect(error).toMatchObject({ code: 'QUERY_FAILED' });
      expect(JSON.stringify(error)).not.toContain('private-material');
    }
  });
});

describe('explicit logout recovery', () => {
  it('replaces a corrupt reference with a durable signed-out record', async () => {
    localStorage.setItem(AUTH_PERSIST_KEY, '{broken');
    const signedOut = { ...record, currentUserPubky: null, sessionReference: null, hasProfile: null };
    await LocalAuthService.commit(signedOut, '');
    expect(LocalAuthService.read()?.sessionReference).toBeNull();
  });
  it('requires Web Locks for new adoption while still allowing explicit logout', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    await expect(LocalAuthService.commit(record, '')).rejects.toMatchObject({ code: 'INIT_FAILED' });
    await LocalAuthService.commit({ ...record, currentUserPubky: null, sessionReference: null, hasProfile: null }, '');
    expect(LocalAuthService.read()?.sessionReference).toBeNull();
  });
});
