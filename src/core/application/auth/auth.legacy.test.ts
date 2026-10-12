import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthStorage } from '@/libs/auth/persistence';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalAuthService } from '@/services/local/auth/auth';
import {
  AUTH_MIGRATION_KEY,
  AUTH_PERSIST_KEY,
  LEGACY_AUTH_PERSIST_KEY,
  PREVIOUS_AUTH_PERSIST_KEY,
} from '@/stores/persistedKeys';
import { mockGrantReference } from '@/test-utils/pubky';
import { AuthApplication } from './auth';

const legacy = (sessionExport = 'legacy-cookie') =>
  JSON.stringify({ state: { currentUserPubky: 'alice', hasProfile: true, sessionExport } });

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, callback: () => unknown) => callback() },
  });
  vi.spyOn(HomeserverService, 'revokeLegacyCookieSession').mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
});

describe('previous cookie session retirement', () => {
  it('retains v1 metadata until remote revocation succeeds, without exposing it to auth state', async () => {
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, legacy());
    const migrated = await createAuthStorage(localStorage).getItem(AUTH_PERSIST_KEY);
    expect(migrated).not.toContain('legacy-cookie');
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).toBe(legacy());
    await AuthApplication.revokeLegacyCookieSessions();
    expect(HomeserverService.revokeLegacyCookieSession).toHaveBeenCalledWith('legacy-cookie');
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).toBeNull();
    expect(LocalAuthService.read()?.currentUserPubky).toBe('alice');
  });
  it('retires both v2 cookie records and preserves a valid v3 grant', async () => {
    const grant = mockGrantReference();
    localStorage.setItem(
      PREVIOUS_AUTH_PERSIST_KEY,
      JSON.stringify({
        state: {
          currentUserPubky: 'alice',
          hasProfile: true,
          generation: 'previous',
          sessionReference: grant,
          retiringSession: { kind: 'cookie', sessionExport: 'retiring-cookie' },
        },
      }),
    );
    await createAuthStorage(localStorage).getItem(AUTH_PERSIST_KEY);
    await AuthApplication.revokeLegacyCookieSessions();
    expect(HomeserverService.revokeLegacyCookieSession).toHaveBeenCalledExactlyOnceWith('retiring-cookie');
    expect(LocalAuthService.read()?.sessionReference).toEqual(grant);
    expect(localStorage.getItem(PREVIOUS_AUTH_PERSIST_KEY)).toBeNull();
  });
  it('retains metadata across logout when offline and retries later', async () => {
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, legacy());
    const storage = createAuthStorage(localStorage);
    await storage.getItem(AUTH_PERSIST_KEY);
    await storage.removeItem(AUTH_PERSIST_KEY);
    vi.mocked(HomeserverService.revokeLegacyCookieSession).mockRejectedValueOnce(new Error('Offline'));
    await expect(AuthApplication.revokeLegacyCookieSessions()).rejects.toThrow('Offline');
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).toBe(legacy());
    expect(await storage.getItem(AUTH_PERSIST_KEY)).toBeNull();
    await AuthApplication.revokeLegacyCookieSessions();
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).toBeNull();
  });
  it('does not erase an old tab replacement after delayed revocation', async () => {
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, legacy());
    localStorage.setItem(AUTH_MIGRATION_KEY, '1');
    vi.mocked(HomeserverService.revokeLegacyCookieSession).mockImplementation(async () => {
      localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, legacy('replacement'));
    });
    await AuthApplication.revokeLegacyCookieSessions();
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).toBe(legacy('replacement'));
  });
  it('keeps an unmigrated public identity when Web Locks are unavailable', async () => {
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, legacy());
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    await AuthApplication.revokeLegacyCookieSessions();
    expect(LocalAuthService.read()?.currentUserPubky).toBe('alice');
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).toBe(legacy());
  });
  it('ignores malformed metadata and grant references', async () => {
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, '{broken');
    localStorage.setItem(
      PREVIOUS_AUTH_PERSIST_KEY,
      JSON.stringify({ state: { sessionReference: mockGrantReference() } }),
    );
    await AuthApplication.revokeLegacyCookieSessions();
    expect(HomeserverService.revokeLegacyCookieSession).not.toHaveBeenCalled();
  });
});
