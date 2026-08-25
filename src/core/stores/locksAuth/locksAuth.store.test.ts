import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { LOCKS_AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { asOpaque } from '@/test-utils/type-assertions';
import { useLocksAuthStore } from './locksAuth.store';
import { locksAuthInitialState } from './locksAuth.types';

const fakeSession = asOpaque<LocksSdkSession>({ id: 'locks-session' });

describe('useLocksAuthStore', () => {
  beforeEach(() => {
    useLocksAuthStore.setState(locksAuthInitialState);
    localStorage.removeItem(LOCKS_AUTH_PERSIST_KEY);
  });

  it('is unauthenticated with no secret initially', () => {
    const state = useLocksAuthStore.getState();
    expect(state.selectIsLocksAuthenticated()).toBe(false);
    expect(state.selectLocksSessionSecret()).toBeNull();
  });

  it('init stores the session + secret and marks authenticated', () => {
    useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
    const state = useLocksAuthStore.getState();
    expect(state.selectIsLocksAuthenticated()).toBe(true);
    expect(state.selectLocksSession()).toBe(fakeSession);
    expect(state.selectLocksSessionSecret()).toBe('secret-abc');
  });

  it('persists only the secret and restores hydration state on rehydrate', async () => {
    useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });

    const persisted = JSON.parse(localStorage.getItem(LOCKS_AUTH_PERSIST_KEY) ?? '{}') as {
      state?: Record<string, unknown>;
    };
    expect(persisted.state).toMatchObject({ locksSessionSecret: 'secret-abc', hasHydrated: false });
    expect(persisted.state).not.toHaveProperty('session');

    useLocksAuthStore.setState(locksAuthInitialState);
    localStorage.setItem(
      LOCKS_AUTH_PERSIST_KEY,
      JSON.stringify({ state: { locksSessionSecret: 'secret-abc', hasHydrated: false }, version: 0 }),
    );
    await useLocksAuthStore.persist.rehydrate();

    const state = useLocksAuthStore.getState();
    expect(state.selectLocksSession()).toBeNull();
    expect(state.selectLocksSessionSecret()).toBe('secret-abc');
    expect(state.hasHydrated).toBe(true);
  });

  it('setSession sets the live session while keeping the persisted secret', () => {
    useLocksAuthStore.getState().init({ session: null, secret: 'secret-abc' });
    expect(useLocksAuthStore.getState().selectIsLocksAuthenticated()).toBe(false); // secret only, no live session

    useLocksAuthStore.getState().setSession(fakeSession);
    const state = useLocksAuthStore.getState();
    expect(state.selectLocksSession()).toBe(fakeSession);
    expect(state.selectLocksSessionSecret()).toBe('secret-abc');
  });

  it('init clears a Paykit connection left over from the previous session', () => {
    useLocksAuthStore.getState().setPaykitConnected(true);

    useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });

    expect(useLocksAuthStore.getState().selectIsPaykitConnected()).toBe(false);
  });

  it('keeps the Paykit connection out of storage', () => {
    useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
    useLocksAuthStore.getState().setPaykitConnected(true);

    const persisted = JSON.parse(localStorage.getItem(LOCKS_AUTH_PERSIST_KEY) ?? '{}') as {
      state?: Record<string, unknown>;
    };
    expect(persisted.state).not.toHaveProperty('paykitConnected');
  });

  it('reset clears the session and secret', () => {
    useLocksAuthStore.getState().init({ session: fakeSession, secret: 'secret-abc' });
    useLocksAuthStore.getState().setPaykitConnected(true);
    useLocksAuthStore.getState().reset();
    const state = useLocksAuthStore.getState();
    expect(state.selectIsLocksAuthenticated()).toBe(false);
    expect(state.selectLocksSessionSecret()).toBeNull();
    expect(state.selectIsPaykitConnected()).toBe(false);
  });
});
