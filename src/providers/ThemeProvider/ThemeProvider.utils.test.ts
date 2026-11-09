import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SIGNED_OUT_ROUTES } from '@/app/routes';
import { THEME_STORAGE_KEY } from '@/config/theme';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { getSignedOutThemeScript, isSignedOutBeforeHydration } from './ThemeProvider.utils';

const SESSION_REFERENCE = {
  kind: 'grant',
  sessionStoreId: 'store-1',
  clientId: 'client-1',
  grantId: 'grant-1',
  grantExpiresAt: 1,
  tokenExpiresAt: 1,
};

function storeAuth(sessionReference: typeof SESSION_REFERENCE | null) {
  localStorage.setItem(
    AUTH_PERSIST_KEY,
    JSON.stringify({ version: 3, state: { currentUserPubky: 'pubky-1', sessionReference, hasProfile: true } }),
  );
}

function runScriptAt(pathname: string) {
  window.history.pushState({}, '', pathname);
  new Function(getSignedOutThemeScript())();
}

describe('isSignedOutBeforeHydration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each(SIGNED_OUT_ROUTES)('treats %s as signed out even with a stored session', (route) => {
    storeAuth(SESSION_REFERENCE);

    expect(isSignedOutBeforeHydration(route, SIGNED_OUT_ROUTES, AUTH_PERSIST_KEY)).toBe(true);
  });

  it('treats a stored session reference as signed in elsewhere', () => {
    storeAuth(SESSION_REFERENCE);

    expect(isSignedOutBeforeHydration('/home', SIGNED_OUT_ROUTES, AUTH_PERSIST_KEY)).toBe(false);
  });

  it('treats a missing auth record as signed out', () => {
    expect(isSignedOutBeforeHydration('/home', SIGNED_OUT_ROUTES, AUTH_PERSIST_KEY)).toBe(true);
  });

  it('treats a stored pubky without a session reference as signed out', () => {
    storeAuth(null);

    expect(isSignedOutBeforeHydration('/hot', SIGNED_OUT_ROUTES, AUTH_PERSIST_KEY)).toBe(true);
  });

  it('treats an unreadable auth record as signed out', () => {
    localStorage.setItem(AUTH_PERSIST_KEY, '{not json');

    expect(isSignedOutBeforeHydration('/home', SIGNED_OUT_ROUTES, AUTH_PERSIST_KEY)).toBe(true);
  });
});

describe('getSignedOutThemeScript', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    root.className = 'light';
  });

  afterEach(() => {
    root.className = '';
    window.history.pushState({}, '', '/');
  });

  it('swaps a stored light preference for dark when no one is signed in', () => {
    runScriptAt('/home');

    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('light')).toBe(false);
  });

  it.each(['/', '/sign-in', '/logout', '/onboarding/install', '/onboarding/follow'])(
    'renders %s dark even for a signed-in member',
    (pathname) => {
      storeAuth(SESSION_REFERENCE);

      runScriptAt(pathname);

      expect(root.className).toBe('dark');
    },
  );

  it('keeps the light preference for a signed-in member outside the signed-out pages', () => {
    storeAuth(SESSION_REFERENCE);

    runScriptAt('/settings/appearance');

    expect(root.className).toBe('light');
  });

  it('never writes or clears the stored preference', () => {
    runScriptAt('/');

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('declares no globals', () => {
    runScriptAt('/home');

    expect('root' in window).toBe(false);
  });
});
