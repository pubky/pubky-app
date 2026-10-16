import { renderToString } from 'react-dom/server';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHOP_CAPABILITIES } from '@/config/auth';
import { AuthController } from '@/controllers/auth/auth';
import { ShopEmbedController } from '@/controllers/shop-embed/shop-embed';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import {
  readServerConfig,
  resetRuntimeConfigForTests,
  RUNTIME_CONFIG_WINDOW_KEY,
} from '@/libs/runtime-config/runtime-config';
import { RouteGuardProvider } from '@/providers/RouteGuardProvider/RouteGuardProvider';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { useSignInStore } from '@/stores/signIn/signIn.store';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';
import { ShopEmbed } from './ShopEmbed';

vi.mock('@/controllers/shop-embed/shop-embed', () => ({
  ShopEmbedController: { fetchAvailability: vi.fn().mockResolvedValue(true) },
}));

const navigation = vi.hoisted(() => ({ pathname: '/shop', search: '', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
}));
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    hasCapabilities: vi.fn(),
    logout: vi.fn(),
    restorePersistedSession: vi.fn().mockResolvedValue(false),
    cancelActiveAuthFlow: vi.fn(),
  },
}));
vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({ useMobileAuth: vi.fn() }));
vi.mock('@/hooks/useRestoreLocksAuth/useRestoreLocksAuth', () => ({ useRestoreLocksAuth: () => {} }));
vi.mock('@/coordinators/auth/auth', () => ({
  AuthCoordinator: { getInstance: () => ({ start: vi.fn(), stop: vi.fn() }) },
}));
// The shell's independent feed/profile queries are covered by ContentLayout tests.
vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

function send(
  frame: HTMLIFrameElement,
  data: object,
  origin = window.location.origin,
  source: Window | null = frame.contentWindow,
) {
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', { origin, source, data: { channel: 'pubky-shop-session', version: 1, ...data } }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ShopEmbedController.fetchAvailability).mockReset().mockResolvedValue(true);
  window.history.replaceState(null, '', '/shop');
  navigation.pathname = '/shop';
  navigation.search = '';
  useAuthStore.setState({ ...authInitialState, hasHydrated: true, generation: 'initial' });
  useOnboardingStore.setState({ hasHydrated: true, secretKey: null });
  useSignInStore.getState().reset();
  vi.mocked(AuthController.hasCapabilities).mockReturnValue(false);
  vi.mocked(AuthController.logout).mockResolvedValue();
  vi.mocked(useMobileAuth).mockReturnValue({
    url: '',
    isLoading: false,
    isExpired: false,
    fetchUrl: vi.fn(),
    copyAuthUrl: vi.fn(),
    isOpeningRing: false,
    isOpeningBitkit: false,
    onAuthorizeBitkitClick: vi.fn(),
    onAuthorizeClick: vi.fn(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  useAuthStore.setState(authInitialState);
  delete window[RUNTIME_CONFIG_WINDOW_KEY];
  resetRuntimeConfigForTests();
});

function mount() {
  const result = render(<ShopEmbed />);
  const frame = screen.getByTitle<HTMLIFrameElement>('Pubky Shop');
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  return { ...result, frame, post };
}

describe('ShopEmbed', () => {
  it('keeps the loaded iframe and its checkout form after one failed readiness check', async () => {
    vi.useFakeTimers();
    const { frame } = mount();
    await act(async () => {});
    fireEvent.load(frame);
    frame.contentDocument!.append(frame.contentDocument!.createElement('html'));
    frame.contentDocument!.documentElement.append(frame.contentDocument!.createElement('body'));
    const address = frame.contentDocument!.createElement('input');
    address.value = 'Checkout address in progress';
    frame.contentDocument!.body.append(address);

    vi.mocked(ShopEmbedController.fetchAvailability).mockResolvedValueOnce(false);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByTitle('Pubky Shop')).toBe(frame);
    expect(frame.contentDocument!.querySelector('input')).toBe(address);
    expect(address.value).toBe('Checkout address in progress');
    expect(screen.queryByText('Shop unavailable')).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByTitle('Pubky Shop')).toBe(frame);
    expect(address.value).toBe('Checkout address in progress');
  });
  it('recovers an outage into the latest checkout URL without losing the App session', async () => {
    vi.useFakeTimers();
    const session = mockSession();
    const reference = mockGrantReference();
    useAuthStore.setState({ currentUserPubky: 'user', session, sessionReference: reference, restoreStatus: 'ready' });
    vi.mocked(ShopEmbedController.fetchAvailability).mockResolvedValue(false);
    const { frame, rerender } = mount();
    await act(async () => {});
    expect(screen.getByText('Shop unavailable')).toBeInTheDocument();
    expect(screen.queryByTitle('Pubky Shop')).not.toBeInTheDocument();
    expect(useAuthStore.getState().session).toBe(session);
    expect(useAuthStore.getState().sessionReference).toBe(reference);

    navigation.pathname = '/shop/marketplace/listing/abc';
    navigation.search = 'checkout=1';
    window.history.replaceState(null, '', `${navigation.pathname}?${navigation.search}#payment`);
    rerender(<ShopEmbed />);
    vi.mocked(ShopEmbedController.fetchAvailability).mockResolvedValue(true);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    const recovered = screen.getByTitle<HTMLIFrameElement>('Pubky Shop');
    expect(recovered).not.toBe(frame);
    expect(recovered).toHaveAttribute('src', '/shop-embed/marketplace/listing/abc?checkout=1#payment');
    const post = vi.spyOn(recovered.contentWindow!, 'postMessage');
    fireEvent.load(recovered);
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshot: expect.objectContaining({ status: 'ready', pubky: 'user' }) }),
      window.location.origin,
    );
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByTitle('Pubky Shop')).toBe(recovered);
    expect(useAuthStore.getState().session).toBe(session);
    expect(useAuthStore.getState().sessionReference).toBe(reference);
    expect(AuthController.logout).not.toHaveBeenCalled();
    expect(AuthController.restorePersistedSession).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
  });
  it('waits for the browser URL before emitting an iframe on the server', () => {
    expect(renderToString(<ShopEmbed />)).not.toContain('<iframe');
  });
  it('includes the initial query and fragment in the first frame source', () => {
    navigation.pathname = '/shop/marketplace/listing/abc';
    navigation.search = 'q=a%20b&checkout=1';
    window.history.replaceState(null, '', `${navigation.pathname}?${navigation.search}#payment`);
    const { frame } = mount();
    expect(frame).toHaveAttribute('src', '/shop-embed/marketplace/listing/abc?q=a%20b&checkout=1#payment');
  });
  it('opens the marketplace when the initial outer path is unsupported', () => {
    window.history.replaceState(null, '', '/shop/%2f%2fexample.test');
    render(<ShopEmbed />);
    expect(screen.getByTitle('Pubky Shop')).toHaveAttribute('src', '/shop-embed/marketplace');
  });
  it('synchronizes later outer paths and hash changes without remounting or changing the initial source', () => {
    const { frame, rerender } = mount();
    const replace = vi.fn();
    vi.spyOn(frame, 'contentWindow', 'get').mockReturnValue(
      asOpaque<Window>({ location: asOpaque<Location>({ replace }), postMessage: vi.fn() }),
    );
    navigation.pathname = '/shop/marketplace/listing/abc';
    navigation.search = 'checkout=1';
    window.history.replaceState(null, '', `${navigation.pathname}?${navigation.search}#payment`);
    rerender(<ShopEmbed />);
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      new URL('/shop-embed/marketplace/listing/abc?checkout=1#payment', window.location.origin).href,
    );
    replace.mockClear();
    window.history.replaceState(null, '', `${navigation.pathname}?${navigation.search}#complete`);
    act(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      new URL('/shop-embed/marketplace/listing/abc?checkout=1#complete', window.location.origin).href,
    );
    expect(screen.getByTitle('Pubky Shop')).toBe(frame);
    expect(frame).toHaveAttribute('src', '/shop-embed/marketplace');
  });
  it('loads the same-origin mount and waits for an explicit login request', () => {
    const { frame, post } = mount();
    expect(frame).toHaveAttribute('src', '/shop-embed/marketplace');
    // PayPal redirects the top frame after an awaited response, when activation has expired.
    expect(frame).not.toHaveAttribute('sandbox');
    expect(frame).toHaveAttribute('allow', 'clipboard-write');
    expect(useAuthStore.getState().showSignInDialog).toBe(false);
    send(frame, { type: 'ready' });
    expect(post).toHaveBeenLastCalledWith(
      {
        channel: 'pubky-shop-session',
        version: 1,
        type: 'session',
        snapshot: {
          generation: 'initial',
          shopCleanupEpoch: '',
          status: 'signed-out',
          pubky: null,
          sessionStoreId: null,
          grantId: null,
          clientId: null,
        },
      },
      window.location.origin,
    );
    expect(useAuthStore.getState().showSignInDialog).toBe(false);
    send(frame, { type: 'request-login' });
    expect(navigation.push).toHaveBeenCalledWith('/sign-in?returnTo=%2Fshop&shopReauth=initial');
  });
  it('retains the checkout URL for the explicit App login', () => {
    navigation.pathname = '/shop/marketplace/listing/abc';
    window.history.replaceState(null, '', '/shop/marketplace/listing/abc?checkout=1#payment');
    const { frame } = mount();
    send(frame, { type: 'request-login' });
    expect(navigation.push).toHaveBeenCalledWith(
      '/sign-in?returnTo=%2Fshop%2Fmarketplace%2Flisting%2Fabc%3Fcheckout%3D1%23payment&shopReauth=initial',
    );
  });
  it('commits child navigation and Back synchronously without leaving an asynchronous router replacement', () => {
    const { frame } = mount();
    send(frame, { type: 'navigate', path: '/shop-embed/marketplace/listing/abc?checkout=1#payment' });
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      '/shop/marketplace/listing/abc?checkout=1#payment',
    );
    send(frame, { type: 'navigate', path: '/shop-embed/marketplace' });
    expect(window.location.pathname).toBe('/shop');
    expect(navigation.replace).not.toHaveBeenCalled();
  });
  it('republishes on frame load and retries temporary host restoration only on explicit request', async () => {
    useAuthStore.setState({ restoreStatus: 'temporary-error' });
    const { frame, post } = mount();
    fireEvent.load(frame);
    expect(post).toHaveBeenCalled();
    expect(AuthController.restorePersistedSession).not.toHaveBeenCalled();
    send(frame, { type: 'ready' });
    expect(AuthController.restorePersistedSession).not.toHaveBeenCalled();
    send(frame, { type: 'request-retry' });
    await act(async () => {});
    expect(AuthController.restorePersistedSession).toHaveBeenCalledOnce();
    expect(navigation.push).not.toHaveBeenCalled();
  });
  it('preserves an unbacked-up onboarding key and goes through the backup-aware logout page', () => {
    useOnboardingStore.setState({ secretKey: 'unbacked-up-test-key' });
    const { frame } = mount();
    send(frame, { type: 'request-logout' });
    expect(AuthController.logout).not.toHaveBeenCalled();
    expect(navigation.push).toHaveBeenCalledWith('/logout');
    expect(useOnboardingStore.getState().secretKey).not.toBeNull();
  });
  it('keeps the same frame mounted after child and outer route updates', () => {
    const { frame, rerender } = mount();
    send(frame, { type: 'navigate', path: '/shop-embed/marketplace/listing/abc' });
    navigation.pathname = '/shop/marketplace/listing/abc';
    window.history.replaceState(null, '', navigation.pathname);
    rerender(<ShopEmbed />);
    expect(screen.getByTitle('Pubky Shop')).toBe(frame);
    expect(frame).toHaveAttribute('src', '/shop-embed/marketplace');
    navigation.pathname = '/shop';
    window.history.replaceState(null, '', navigation.pathname);
    rerender(<ShopEmbed />);
    expect(screen.getByTitle('Pubky Shop')).toBe(frame);
  });
  it('rejects wrong origins, other frames, unsupported versions and child scope selection', () => {
    const { frame, post } = mount();
    send(frame, { type: 'request-login' }, 'https://external.test');
    send(frame, { type: 'request-login' }, window.location.origin, window);
    send(frame, { type: 'request-login', version: 2 });
    send(frame, { type: 'request-capabilities', scopes: ['/:rw'] });
    expect(useAuthStore.getState().showSignInDialog).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(useMobileAuth).not.toHaveBeenCalled();
  });
  it('publishes account switches and temporary failures and unsubscribes on unmount', () => {
    const { post, unmount } = mount();
    act(() =>
      useAuthStore.setState({
        currentUserPubky: 'new-user',
        generation: 'next',
        session: mockSession(),
        sessionReference: mockGrantReference('new-grant'),
        restoreStatus: 'ready',
      }),
    );
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          status: 'ready',
          pubky: 'new-user',
          generation: 'next',
          sessionStoreId: 'new-grant',
        }),
      }),
      window.location.origin,
    );
    act(() => useAuthStore.setState({ restoreStatus: 'temporary-error', session: null }));
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          status: 'temporary-error',
          pubky: 'new-user',
          sessionStoreId: 'new-grant',
        }),
      }),
      window.location.origin,
    );
    unmount();
    post.mockClear();
    act(() => useAuthStore.setState({ generation: 'another-tab' }));
    expect(post).not.toHaveBeenCalled();
  });
  it('opens the existing permission approval panel only on request and cancels on dismissal', () => {
    useAuthStore.setState({
      currentUserPubky: 'user',
      session: mockSession(),
      sessionReference: mockGrantReference(),
      restoreStatus: 'ready',
    });
    const { frame } = mount();
    expect(useMobileAuth).not.toHaveBeenCalled();
    send(frame, { type: 'request-capabilities' });
    expect(screen.getByRole('dialog')).toHaveTextContent('Use Pubky Ring or Bitkit');
    expect(useMobileAuth).toHaveBeenCalledWith({ type: 'upgrade', requiredCapabilities: SHOP_CAPABILITIES });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(AuthController.cancelActiveAuthFlow).toHaveBeenCalledOnce();
  });
  it('routes revoked-grant requests back to sign-in and routes logout through App', () => {
    useAuthStore.setState({ currentUserPubky: 'user', restoreStatus: 'reauth-required' });
    const { frame } = mount();
    send(frame, { type: 'request-capabilities' });
    expect(navigation.push).toHaveBeenCalledWith('/sign-in?returnTo=%2Fshop&shopReauth=initial');
    send(frame, { type: 'request-logout' });
    expect(AuthController.logout).toHaveBeenCalledOnce();
  });
  it('offers Passport or recovery approval without discarding the current grant', () => {
    const session = mockSession();
    const reference = mockGrantReference();
    useAuthStore.setState({ currentUserPubky: 'user', session, sessionReference: reference, restoreStatus: 'ready' });
    useSignInStore.setState({ authUrlResolved: true });
    const { frame } = mount();
    send(frame, { type: 'request-capabilities' });
    fireEvent.click(screen.getByRole('button', { name: 'Use Passport or recovery key' }));
    expect(navigation.push).toHaveBeenCalledWith('/sign-in?returnTo=%2Fshop&shopReauth=initial');
    expect(AuthController.cancelActiveAuthFlow).toHaveBeenCalledOnce();
    expect(AuthController.logout).not.toHaveBeenCalled();
    expect(useAuthStore.getState().session).toBe(session);
    expect(useAuthStore.getState().sessionReference).toBe(reference);
    expect(useSignInStore.getState().authUrlResolved).toBe(false);
  });
  it('keeps explicit reauthorization open under the real App guard until a replacement grant is adopted', () => {
    window[RUNTIME_CONFIG_WINDOW_KEY] = readServerConfig();
    resetRuntimeConfigForTests();
    const session = mockSession();
    useAuthStore.setState({
      currentUserPubky: 'user',
      session,
      sessionReference: mockGrantReference(),
      restoreStatus: 'ready',
      hasProfile: true,
    });
    const { frame, rerender } = mount();
    send(frame, { type: 'request-login' });
    const path = navigation.push.mock.lastCall?.[0];
    expect(path).toBe('/sign-in?returnTo=%2Fshop&shopReauth=initial');
    navigation.pathname = '/sign-in';
    navigation.search = new URL(path, window.location.origin).search;
    navigation.push.mockClear();
    // Next renders the target pathname/query before committing the browser's history.
    // A render-time window.location read still sees /shop and would redirect back immediately.
    expect(window.location.pathname).toBe('/shop');
    rerender(
      <RouteGuardProvider>
        <div>Approve a replacement grant</div>
      </RouteGuardProvider>,
    );
    expect(screen.getByText('Approve a replacement grant')).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(useAuthStore.getState().session).toBe(session);
    window.history.replaceState(null, '', path);
    act(() => useAuthStore.setState({ generation: 'approved', session: mockSession() }));
    expect(navigation.push).toHaveBeenCalledWith('/shop');
    expect(AuthController.logout).not.toHaveBeenCalled();
  });
  it('updates the wrapper URL without adding a second history entry or accepting external redirects', () => {
    const { frame } = mount();
    send(frame, { type: 'navigate', path: '/shop-embed/settings/payments?paid=true#return' });
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      '/shop/settings/payments?paid=true#return',
    );
    navigation.replace.mockClear();
    send(frame, { type: 'navigate', path: 'https://attacker.test' });
    send(frame, { type: 'navigate', path: '/shop-embed/../settings' });
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/shop/settings/payments');
  });
});
