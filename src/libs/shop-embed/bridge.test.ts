import { describe, expect, it } from 'vitest';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';
import {
  getShopSessionSnapshot,
  isShopMessageSource,
  isShopReauthorization,
  parseShopRequest,
  shopFramePath,
  shopHostPath,
  shopSignInPath,
  shopSignInReturn,
} from './bridge';

const envelope = { channel: 'pubky-shop-session', version: 1 };

describe('Shop session bridge', () => {
  it.each(['ready', 'request-login', 'request-capabilities', 'request-logout'])(
    'accepts %s without child authority',
    (type) => {
      expect(parseShopRequest({ ...envelope, type })).toEqual({ ...envelope, type });
      expect(parseShopRequest({ ...envelope, type, pubky: 'another-account' })).toBeNull();
      expect(parseShopRequest({ ...envelope, type, scopes: ['/:rw'] })).toBeNull();
    },
  );
  it.each([
    null,
    [],
    {},
    { ...envelope, version: 2, type: 'ready' },
    { ...envelope, channel: 'other', type: 'ready' },
    { ...envelope, type: 'session' },
    { ...envelope, type: 'navigate', path: 123 },
  ])('rejects malformed or unsupported messages: %j', (message) => {
    expect(parseShopRequest(message)).toBeNull();
  });
  it('checks both exact origin and exact child WindowProxy', () => {
    const child = document.createElement('iframe');
    document.body.appendChild(child);
    const source = child.contentWindow!;
    expect(
      isShopMessageSource(
        new MessageEvent('message', { origin: window.location.origin, source }),
        source,
        window.location.origin,
      ),
    ).toBe(true);
    expect(
      isShopMessageSource(
        new MessageEvent('message', { origin: 'https://elsewhere.test', source }),
        source,
        window.location.origin,
      ),
    ).toBe(false);
    expect(
      isShopMessageSource(
        new MessageEvent('message', { origin: window.location.origin, source: window }),
        source,
        window.location.origin,
      ),
    ).toBe(false);
    expect(
      isShopMessageSource(
        new MessageEvent('message', { origin: window.location.origin }),
        null,
        window.location.origin,
      ),
    ).toBe(false);
    child.remove();
  });
  const ready = {
    ...authInitialState,
    hasHydrated: true,
    generation: 'app-generation',
    currentUserPubky: 'account',
    sessionReference: mockGrantReference(),
    session: mockSession(),
    restoreStatus: 'ready' as const,
  };
  it('projects only public active-reference metadata', () => {
    expect(getShopSessionSnapshot(ready)).toEqual({
      generation: 'app-generation',
      shopCleanupEpoch: '',
      status: 'ready',
      pubky: 'account',
      sessionStoreId: 'test-grant',
      grantId: 'test-grant',
      clientId: ready.sessionReference.clientId,
    });
  });
  it.each(['temporary-error', 'reauth-required', 'restoring'] as const)(
    'preserves authority through %s without declaring sign-out',
    (restoreStatus) => {
      expect(getShopSessionSnapshot({ ...ready, session: null, restoreStatus })).toMatchObject({
        status: restoreStatus,
        generation: ready.generation,
        sessionStoreId: 'test-grant',
        pubky: 'account',
      });
    },
  );
  it('does not expose readiness before hydration, during account preparation, or during logout', () => {
    for (const changes of [
      { hasHydrated: false },
      { needsAccountSync: true },
      { isLoggingOut: true },
      { session: null },
    ]) {
      expect(getShopSessionSnapshot({ ...ready, ...changes }).status).toBe('restoring');
    }
    expect(
      getShopSessionSnapshot({ ...authInitialState, hasHydrated: true, generation: 'signed-out-generation' }),
    ).toEqual({
      generation: 'signed-out-generation',
      shopCleanupEpoch: '',
      status: 'signed-out',
      pubky: null,
      sessionStoreId: null,
      grantId: null,
      clientId: null,
    });
  });
});

describe('Shop mount navigation', () => {
  it.each([
    ['/shop', '/shop-embed/marketplace'],
    ['/shop/', '/shop-embed/marketplace'],
    ['/shop/marketplace/listing/abc?checkout=1#payment', '/shop-embed/marketplace/listing/abc?checkout=1#payment'],
    ['/shop/settings?tab=paykit', '/shop-embed/settings?tab=paykit'],
    ['/shop/marketplace/a%20b', '/shop-embed/marketplace/a%20b'],
  ])('maps outer %s to inner %s', (outer, inner) => {
    expect(shopFramePath(outer)).toBe(inner);
  });
  it('preserves search and fragment when mapping a child return', () => {
    expect(shopHostPath('/shop-embed/marketplace?payment=ok#done')).toBe('/shop?payment=ok#done');
    expect(shopHostPath('/shop-embed/settings/payments')).toBe('/shop/settings/payments');
  });
  it.each([
    'https://attacker.test/shop-embed',
    '//attacker.test/shop-embed',
    '/shop-embedder/x',
    '/shop-embed/../settings',
    '/shop-embed/%2e%2e/settings',
    '/shop-embed/%252e%252e/settings',
    '/shop-embed/%2f%2fattacker.test',
    '/shop-embed/\\attacker.test',
    '/shop-embed/api/auth',
    '/shop-embed/_next/static/x',
    '/shop-embed/\nfoo',
    '/shop-embed/%00foo',
    '/shop-embed/%zz',
  ])('rejects unsafe child navigation: %s', (path) => {
    expect(shopHostPath(path)).toBeNull();
  });
  it.each(['/settings', '/shopper', '/shop/../settings', '//attacker.test/shop'])(
    'rejects unsafe outer navigation: %s',
    (path) => {
      expect(shopFramePath(path)).toBeNull();
    },
  );
});

describe('Shop sign-in return', () => {
  it('keeps an explicit reauthorization intent only for the current host grant', () => {
    const path = '/shop/marketplace/listing/abc?checkout=1#payment';
    const signIn = shopSignInPath(path, 'old-grant');
    expect(signIn).not.toBeNull();
    const search = new URL(signIn!, 'https://app.test').search;
    expect(shopSignInReturn(search)).toBe(path);
    expect(isShopReauthorization(search, 'old-grant')).toBe(true);
    expect(isShopReauthorization(search, 'new-grant')).toBe(false);
    expect(isShopReauthorization('?returnTo=%2Fshop', '')).toBe(false);
    expect(isShopReauthorization('?returnTo=https%3A%2F%2Fevil.test%2Fshop&shopReauth=old-grant', 'old-grant')).toBe(
      false,
    );
    expect(shopSignInPath('/settings', 'old-grant')).toBeNull();
  });
  it('round trips a checkout path with search and hash', () => {
    const path = '/shop/marketplace/listing/abc?checkout=1#payment';
    expect(shopSignInReturn(`?${new URLSearchParams({ returnTo: path })}`)).toBe(path);
  });
  it.each([
    'https://attacker.test/shop',
    '//attacker.test/shop',
    '/settings',
    '/shop/../settings',
    '/shop/api/auth',
    '/shop/_next/x',
  ])('rejects %s as a return URL', (path) => {
    expect(shopSignInReturn(`?${new URLSearchParams({ returnTo: path })}`)).toBeNull();
  });
});

describe('outer document paths', () => {
  it.each(['/shop/api/session', '/shop/_next/static/a.js', '/shop/%61pi/session', '/shop/%5fnext/static/a.js'])(
    'rejects non-document navigation %s in both directions',
    (path) => {
      expect(shopFramePath(path)).toBeNull();
      expect(shopHostPath(path.replace('/shop', '/shop-embed'))).toBeNull();
    },
  );
});

describe('Shop terminal and provisional auth state', () => {
  it.each(['temporary-error', 'reauth-required'] as const)(
    'exposes %s even when account sync is unfinished',
    (restoreStatus) => {
      expect(
        getShopSessionSnapshot({
          ...authInitialState,
          hasHydrated: true,
          currentUserPubky: 'alice',
          sessionReference: mockGrantReference(),
          needsAccountSync: true,
          restoreStatus,
        }).status,
      ).toBe(restoreStatus);
    },
  );
  it('keeps an abandoned signup browsable without publishing its provisional identity', () => {
    expect(
      getShopSessionSnapshot({ ...authInitialState, hasHydrated: true, currentUserPubky: 'provisional' }),
    ).toMatchObject({ status: 'signed-out', pubky: null });
  });
});
