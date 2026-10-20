import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_PERSIST_KEY, LEGACY_AUTH_PERSIST_KEY, PREVIOUS_AUTH_PERSIST_KEY } from '@/stores/persistedKeys';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, callback: () => unknown) => callback() },
  });
});

describe('initial auth hydration recovery', () => {
  it.each([
    [PREVIOUS_AUTH_PERSIST_KEY, '{broken'],
    [AUTH_PERSIST_KEY, '{broken'],
    [AUTH_PERSIST_KEY, JSON.stringify({ version: 3, state: { currentUserPubky: 'user' } })],
  ])('finishes hydration and exposes recovery for unreadable %s', async (key, raw) => {
    localStorage.setItem(key, raw);
    const { useAuthStore } = await import('./auth.store');
    await vi.waitFor(() => expect(useAuthStore.getState().hasHydrated).toBe(true));
    expect(useAuthStore.getState()).toMatchObject({ restoreStatus: 'temporary-error', isRestoringSession: false });
    expect(localStorage.getItem(key)).toBe(raw);
  });

  it('accepts a legacy identity whose profile state was never saved', async () => {
    localStorage.setItem(
      LEGACY_AUTH_PERSIST_KEY,
      JSON.stringify({
        state: {
          currentUserPubky: 'old-user',
          sessionExport: 'old-cookie',
        },
      }),
    );
    const { useAuthStore } = await import('./auth.store');
    await vi.waitFor(() => expect(useAuthStore.getState().hasHydrated).toBe(true));
    expect(useAuthStore.getState()).toMatchObject({
      currentUserPubky: 'old-user',
      hasProfile: null,
      restoreStatus: 'reauth-required',
      session: null,
    });
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).toContain('old-cookie');
  });
});

it('regression: blocked localStorage getter exposes recovery', async () => {
  vi.resetModules();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    },
  });
  try {
    const { useAuthStore: initialStore } = await import('./auth.store');
    await vi.waitFor(() => expect(initialStore.getState().hasHydrated).toBe(true));
    expect(initialStore.getState()).toMatchObject({ hasHydrated: true, restoreStatus: 'temporary-error' });
    expect(initialStore.persist).toBeDefined();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', descriptor);
  }
});
