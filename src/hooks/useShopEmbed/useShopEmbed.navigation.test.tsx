import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import { Suspense, use, useEffect, useState } from 'react';
import type * as NextActionQueue from 'next/dist/client/components/app-router-instance';
import * as reducerTypes from 'next/dist/client/components/router-reducer/router-reducer-types';
import {
  ACTION_NAVIGATE,
  ACTION_RESTORE,
  type AppRouterState,
  type NavigateAction,
  type ReducerState,
  type RestoreAction,
} from 'next/dist/client/components/router-reducer/router-reducer-types';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link } from '@/atoms/Link/Link';
import { AuthController } from '@/controllers/auth/auth';
import { useShopNavigation } from '@/hooks/useShopNavigation/useShopNavigation';
import { isShopHostNavigationPending } from '@/libs/shop-embed/navigation';
import { MobileFooter } from '@/molecules/MobileFooter/MobileFooter';
import { DialogSignIn } from '@/organisms/DialogSignIn/DialogSignIn';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { asOpaque } from '@/test-utils/type-assertions';
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
// Run the installed App Router Link (not the Pages Router fallback resolved by node).
// Only its prefetch/network registration is replaced; click filtering, onNavigate
// and optimistic useLinkStatus are the actual Next implementation.
vi.mock('next/link', async () => {
  const { readFileSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { runInNewContext } = await import('node:vm');
  const require = createRequire(import.meta.url);
  const path = require.resolve('next/dist/client/app-dir/link');
  const linkRequire = createRequire(path);
  const exports = {};
  runInNewContext(readFileSync(path, 'utf8'), {
    exports,
    module: { exports },
    window,
    process,
    console,
    require: (name: string) => {
      if (name === '../components/links')
        return {
          IDLE_LINK_STATUS: { pending: false },
          mountLinkInstance: (
            _element: unknown,
            _href: unknown,
            _router: unknown,
            _strategy: unknown,
            _enabled: unknown,
            setOptimisticLinkStatus: (state: { pending: boolean }) => void,
          ) => ({ setOptimisticLinkStatus }),
          unmountLinkForCurrentNavigation: () => {},
          unmountPrefetchableInstance: () => {},
          onNavigationIntent: () => {},
        };
      if (name === '../components/app-router-instance')
        return {
          dispatchNavigateAction: (
            href: string,
            _type: unknown,
            _scroll: unknown,
            link: { setOptimisticLinkStatus: (state: { pending: boolean }) => void } | null,
          ) => {
            link?.setOptimisticLinkStatus({ pending: true });
            navigation.push(href);
          },
        };
      return linkRequire(name);
    },
  });
  return exports;
});
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { hasCapabilities: vi.fn(), cancelActiveAuthFlow: vi.fn(), logout: vi.fn() },
}));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: () => ({ currentUserPubky: 'alice', userDetails: null }),
}));
vi.mock('@/hooks/useJoinRoute/useJoinRoute', () => ({ useJoinRoute: () => '/onboarding/join' }));

const require = createRequire(import.meta.url);
const { AppRouterContext } =
  require('next/dist/shared/lib/app-router-context.shared-runtime') as typeof import('next/dist/shared/lib/app-router-context.shared-runtime');
const nextExports = {};
// Execute Next's unchanged queue implementation without loading its bundler-only RSC/network graph.
runInNewContext(readFileSync(require.resolve('next/dist/client/components/app-router-instance'), 'utf8'), {
  exports: nextExports,
  module: { exports: nextExports },
  window: {},
  process,
  require: (name: string) => {
    if (name === 'react') return React;
    if (name === './router-reducer/router-reducer-types') return reducerTypes;
    if (name === '../../shared/lib/is-thenable') return { isThenable: (value: unknown) => value instanceof Promise };
    return {};
  },
});
const { createMutableActionQueue } = asOpaque<typeof NextActionQueue>(nextExports);
const initial = asOpaque<AppRouterState>({ canonicalUrl: '/shop' });
// The installed Next action queue is real; only the async route reducer/network is controlled.
const queue = createMutableActionQueue(initial);
let resolveNavigation: (state: AppRouterState) => void;
let update: React.Dispatch<React.SetStateAction<ReducerState>>;
let nativeReplace: History['replaceState'];

function Harness({ footer = false }: { footer?: boolean }) {
  const [state, setState] = useState<ReducerState>(initial);
  useEffect(() => {
    update = setState;
  }, []);
  const current = 'then' in state ? use(state) : state;
  const { iframe, initialSrc } = useShopEmbed();
  const navigate = useShopNavigation();
  return (
    <>
      <AppRouterContext.Provider value={asOpaque<React.ContextType<typeof AppRouterContext>>(navigation)}>
        <DialogSignIn />
        {footer ? (
          <MobileFooter />
        ) : (
          <>
            <Link href="/home" prefetch={false}>
              Home
            </Link>
            <Link href="/hot" onNavigate={(event) => event.preventDefault()}>
              Canceled
            </Link>
            <Link href="/home" onClick={(event) => event.preventDefault()}>
              Canceled click
            </Link>
            <Link href="/home" target="_blank">
              New tab
            </Link>
            <Link href="/home" download>
              Download
            </Link>
            <button onClick={() => navigate(() => navigation.push('/search'))}>Search</button>
          </>
        )}
      </AppRouterContext.Provider>
      <output>{current.canonicalUrl}</output>
      {initialSrc && <iframe ref={iframe} title="Shop" src={initialSrc} />}
    </>
  );
}
function send(type: string, path?: string) {
  const frame = screen.getByTitle<HTMLIFrameElement>('Shop');
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: location.origin,
      source: frame.contentWindow,
      data: { channel: 'pubky-shop-session', version: 1, type, ...(path ? { path } : {}) },
    }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/shop');
  nativeReplace = window.history.replaceState.bind(window.history);
  queue.state = initial;
  queue.pending = null;
  queue.last = null;
  queue.action = (_state, action) =>
    action.type === ACTION_NAVIGATE
      ? new Promise((resolve) => {
          resolveNavigation = resolve;
        })
      : { ...initial, canonicalUrl: asOpaque<RestoreAction>(action).url.pathname };
  navigation.push.mockImplementation((href: string) =>
    queue.dispatch(asOpaque<NavigateAction>({ type: ACTION_NAVIGATE, url: new URL(href, location.origin) }), update),
  );
  // Next's public history integration dispatches restore on replaceState (app-router.js).
  vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
    nativeReplace(data, unused, url);
    queue.dispatch(
      asOpaque<RestoreAction>({ type: ACTION_RESTORE, url: new URL(String(url), location.origin) }),
      update,
    );
  });
  useAuthStore.setState({ ...authInitialState, hasHydrated: true, generation: 'login' });
  useOnboardingStore.setState({ secretKey: null, hasHydrated: true });
  vi.mocked(AuthController.logout).mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState(authInitialState);
  useOnboardingStore.getState().reset();
});

describe('Shop reports versus the real Next navigation queue', () => {
  it.each([
    ['Sign In', '/sign-in'],
    ['Join Pubky', '/onboarding/join'],
  ])('protects guest-dialog %s navigation after the dialog closes', async (label, destination) => {
    useAuthStore.setState({ showSignInDialog: true });
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: label }));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const pending = queue.pending;
    expect(pending?.payload.type).toBe(ACTION_NAVIGATE);
    act(() => send('navigate', '/shop-embed/marketplace/listing/seller/product'));
    expect(queue.pending).toBe(pending);
    expect(pending?.discarded).not.toBe(true);
    expect(isShopHostNavigationPending()).toBe(true);
    await act(async () => {
      resolveNavigation({ ...initial, canonicalUrl: destination });
    });
    expect(screen.getByText(destination)).toBeInTheDocument();
    expect(isShopHostNavigationPending()).toBe(false);
  });

  it.each(['Home', 'Search'])('protects the real mobile-footer %s navigation', async (label) => {
    useAuthStore.setState({ currentUserPubky: 'alice' });
    render(
      <Suspense fallback="Loading">
        <Harness footer />
      </Suspense>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: label }));
    });
    const pending = queue.pending;
    expect(pending?.payload.type).toBe(ACTION_NAVIGATE);
    expect(isShopHostNavigationPending()).toBe(true);
    act(() => send('navigate', '/shop-embed/marketplace/cart'));
    expect(queue.pending).toBe(pending);
    expect(pending?.discarded).not.toBe(true);
    await act(async () => {
      resolveNavigation({ ...initial, canonicalUrl: label === 'Home' ? '/home' : '/search' });
    });
    expect(screen.getByText(label === 'Home' ? '/home' : '/search')).toBeInTheDocument();
    expect(isShopHostNavigationPending()).toBe(false);
  });

  it.each(['Home', 'Search'])('does not discard a pending host %s navigation', async (label) => {
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText(label));
    });
    const pending = queue.pending;
    expect(pending?.payload.type).toBe(ACTION_NAVIGATE);
    expect(isShopHostNavigationPending()).toBe(true);
    act(() => send('navigate', '/shop-embed/marketplace/cart'));
    expect(queue.pending).toBe(pending);
    expect(pending?.discarded).not.toBe(true);
    await act(async () => {
      resolveNavigation({ ...initial, canonicalUrl: label === 'Home' ? '/home' : '/search' });
    });
    expect(screen.getByText(label === 'Home' ? '/home' : '/search')).toBeInTheDocument();
    expect(isShopHostNavigationPending()).toBe(false);
  });

  it.each(['Home', 'Search'])('releases %s guard when navigation settles without leaving Shop', async (label) => {
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText(label));
    });
    await act(async () => {
      resolveNavigation(initial);
    });
    expect(isShopHostNavigationPending()).toBe(false);
    act(() => send('navigate', '/shop-embed/marketplace/cart'));
    expect(queue.state.canonicalUrl).toBe('/shop/marketplace/cart');
  });

  it.each(['Home', 'Search'])('releases %s guard for a synchronous/no-op navigation', async (label) => {
    queue.action = (state) => state;
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText(label));
    });
    expect(isShopHostNavigationPending()).toBe(false);
  });

  it.each(['Canceled', 'Canceled click', 'New tab', 'Download'])('does not guard %s', async (label) => {
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText(label));
    });
    expect(navigation.push).not.toHaveBeenCalled();
    expect(isShopHostNavigationPending()).toBe(false);
    act(() => send('navigate', '/shop-embed/marketplace/cart'));
    expect(queue.state.canonicalUrl).toBe('/shop/marketplace/cart');
  });

  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])('does not guard a %s click', async (modifier) => {
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Home'), { [modifier]: true });
    });
    expect(navigation.push).not.toHaveBeenCalled();
    expect(isShopHostNavigationPending()).toBe(false);
  });

  it.each(['request-login', 'request-logout'])('does not discard a pending %s navigation', async (request) => {
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>,
    );
    await act(async () => {
      send(request);
    });
    const pending = queue.pending;
    expect(pending?.payload.type).toBe(ACTION_NAVIGATE);
    act(() => send('navigate', '/shop-embed/marketplace/cart'));
    expect(queue.pending).toBe(pending);
    expect(pending?.discarded).not.toBe(true);
    await act(async () => {
      resolveNavigation({ ...initial, canonicalUrl: request === 'request-login' ? '/sign-in' : '/logout' });
    });
    expect(screen.getByText(request === 'request-login' ? '/sign-in' : '/logout')).toBeInTheDocument();
  });
  it('accepts child navigation again after logout fails without leaving the wrapper', async () => {
    vi.mocked(AuthController.logout).mockRejectedValue(new Error('storage blocked'));
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>,
    );
    await act(async () => {
      send('request-logout');
    });
    expect(navigation.push).not.toHaveBeenCalled();
    act(() => send('navigate', '/shop-embed/marketplace/cart'));
    await waitFor(() => expect(queue.state.canonicalUrl).toBe('/shop/marketplace/cart'));
  });
});
