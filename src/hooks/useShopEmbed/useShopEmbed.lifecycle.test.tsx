import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { AuthController } from '@/controllers/auth/auth';
import * as databaseHelpers from '@/database/franky/franky.helpers';
import {
  readServerConfig,
  resetRuntimeConfigForTests,
  RUNTIME_CONFIG_WINDOW_KEY,
} from '@/libs/runtime-config/runtime-config';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { mockSession } from '@/test-utils/pubky';
import { useShopEmbed } from './useShopEmbed';

vi.mock('@/controllers/shop-embed/shop-embed', () => ({
  ShopEmbedController: { fetchAvailability: vi.fn().mockResolvedValue(true) },
}));

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/shop',
  useSearchParams: () => new URLSearchParams(),
}));
function Harness() {
  const { iframe, initialSrc } = useShopEmbed();
  return initialSrc ? <iframe ref={iframe} title="Shop" src={initialSrc} /> : null;
}
function requestLogout() {
  const frame = screen.getByTitle<HTMLIFrameElement>('Shop');
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        source: frame.contentWindow,
        data: { channel: 'pubky-shop-session', version: 1, type: 'request-logout' },
      }),
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/shop');
  window[RUNTIME_CONFIG_WINDOW_KEY] = readServerConfig();
  resetRuntimeConfigForTests();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, options: LockOptions | (() => unknown), run?: () => unknown) =>
        typeof options === 'function' ? options() : run!(),
    },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  vi.spyOn(databaseHelpers, 'clearDatabase').mockResolvedValue(undefined);
  vi.spyOn(HomeserverService, 'logoutLegacyCookie').mockResolvedValue(undefined);
  vi.spyOn(HomeserverService, 'logout').mockResolvedValue(undefined);
  useAuthStore.setState({
    ...authInitialState,
    hasHydrated: true,
    generation: 'login',
    currentUserPubky: 'alice',
    session: mockSession(),
    restoreStatus: 'ready',
    shopCleanupEpoch: 'login',
  });
  useOnboardingStore.setState({ secretKey: 'test-recovery-key', mnemonic: 'test recovery words', hasHydrated: true });
  localStorage.setItem(
    AUTH_PERSIST_KEY,
    JSON.stringify({
      version: 3,
      state: {
        generation: 'login',
        shopCleanupEpoch: 'login',
        currentUserPubky: 'alice',
        hasProfile: true,
        sessionReference: null,
      },
    }),
  );
  localStorage.setItem('pubky.marketplace.session.v1', 'shop-credential');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window[RUNTIME_CONFIG_WINDOW_KEY];
  resetRuntimeConfigForTests();
  useOnboardingStore.getState().reset();
  useAuthStore.setState(authInitialState);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
});

describe('embedded backup and real App logout boundary', () => {
  it('keeps recovery secrets and Shop credentials until actual logout, even after the iframe unmounts', async () => {
    const logout = vi.spyOn(AuthController, 'logout'); // Real controller, application and Shop cleanup service.
    const { unmount } = render(<Harness />);
    requestLogout();
    expect(navigation.push).toHaveBeenCalledWith('/logout');
    expect(logout).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().secretKey).toBe('test-recovery-key');
    expect(AuthApplication.readPersistedAuth()?.shopCleanupEpoch).toBe('login');
    expect(localStorage.getItem('pubky.marketplace.session.v1')).toBe('shop-credential');
    unmount();
    // The existing logout confirmation calls this same real controller after the backup decision.
    await AuthController.logout();
    expect(useOnboardingStore.getState().secretKey).toBeNull();
    expect(useAuthStore.getState().currentUserPubky).toBeNull();
    const signedOut = AuthApplication.readPersistedAuth()!;
    expect(signedOut.shopCleanupEpoch).toBe(signedOut.generation);
    expect(signedOut.shopCleanupEpoch).not.toBe('login');
    expect(localStorage.getItem('pubky.marketplace.session.v1')).toBeNull();
    // Returning as the same account cannot reuse Shop's previous cleanup acknowledgment.
    await AuthApplication.commitPersistedAuth(
      { ...signedOut, currentUserPubky: 'alice', generation: 'same-account-return' },
      signedOut.generation,
    );
    expect(AuthApplication.readPersistedAuth()?.shopCleanupEpoch).toBe('same-account-return');
  });
  it('finishes initiated cleanup after its requesting iframe unmounts', async () => {
    useOnboardingStore.getState().clearSecrets();
    const logout = vi.spyOn(AuthController, 'logout');
    const { unmount } = render(<Harness />);
    requestLogout();
    expect(logout).toHaveBeenCalledOnce();
    unmount();
    await logout.mock.results[0].value;
    expect(localStorage.getItem('pubky.marketplace.session.v1')).toBeNull();
    expect(AuthApplication.readPersistedAuth()?.currentUserPubky).toBeNull();
  });
});
