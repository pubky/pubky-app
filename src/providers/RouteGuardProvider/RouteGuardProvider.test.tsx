import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// Hoisted mocks
const mocks = vi.hoisted(() => {
  const mockRouterPush = vi.fn();
  const mockRouterRefresh = vi.fn();
  const mockResync = vi.fn();
  const resetMigrationStore = vi.fn();

  return {
    mockRouterPush,
    mockRouterRefresh,
    mockResync,
    resetMigrationStore,
    // Auth store state defaults
    hasHydrated: true,
    session: {} as unknown,
    sessionExport: null as unknown,
    currentUserPubky: 'test-pubky-z32' as string | null,
    wasDbReset: false,
    // Auth status defaults
    status: 'AUTHENTICATED' as string,
    isLoading: false,
    // Route defaults
    pathname: '/feed',
    // Locale defaults
    serverLocale: 'en',
    storeLanguage: 'en' as string | null,
  };
});

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.mockRouterPush, refresh: mocks.mockRouterRefresh }),
  usePathname: () => mocks.pathname,
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => mocks.serverLocale,
}));

// Mock @/hooks
vi.mock('@/hooks', () => ({
  useAuthStatus: () => ({ status: mocks.status, isLoading: mocks.isLoading }),
}));

// Mock @/app
vi.mock('@/app', () => ({
  PUBLIC_ROUTES: ['/landing'],
  isDynamicPublicRoute: (path: string) => path.startsWith('/post/') || path.startsWith('/profile/'),
}));

// Mock @/providers
vi.mock('@/providers', () => ({
  ROUTE_ACCESS_MAP: {
    AUTHENTICATED: { allowedRoutes: ['/feed', '/settings'], redirectTo: '/feed' },
    UNAUTHENTICATED: { allowedRoutes: ['/login', '/landing'], redirectTo: '/login' },
    NEEDS_PROFILE_CREATION: { allowedRoutes: ['/create-profile'], redirectTo: '/create-profile' },
  },
}));

// Mock @/atoms
vi.mock('@/atoms', () => ({
  Spinner: (props: Record<string, unknown>) => <div data-testid="spinner" {...props} />,
}));

// Mock @/libs
vi.mock('@/libs', () => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  Err: {
    timeout: (code: string, msg: string, _opts: unknown) => new Error(msg),
  },
  TimeoutErrorCode: { REQUEST_TIMEOUT: 'REQUEST_TIMEOUT' },
  ErrorService: { Local: 'Local' },
}));

// Mock @/core
vi.mock('@/core', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      hasHydrated: mocks.hasHydrated,
      session: mocks.session,
      sessionExport: mocks.sessionExport,
      currentUserPubky: mocks.currentUserPubky,
    }),
  useMigrationStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({ wasDbReset: mocks.wasDbReset }),
    {
      getState: () => ({ reset: mocks.resetMigrationStore, wasDbReset: mocks.wasDbReset }),
    },
  ),
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ language: mocks.storeLanguage }),
  AuthController: {
    restorePersistedSession: vi.fn().mockResolvedValue(true),
  },
  MigrationController: {
    resync: mocks.mockResync,
  },
}));

import { RouteGuardProvider } from './RouteGuardProvider';

describe('RouteGuardProvider — migration resync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset defaults
    mocks.hasHydrated = true;
    mocks.session = {};
    mocks.sessionExport = null;
    mocks.currentUserPubky = 'test-pubky-z32';
    mocks.wasDbReset = false;
    mocks.status = 'AUTHENTICATED';
    mocks.isLoading = false;
    mocks.pathname = '/feed';
    mocks.serverLocale = 'en';
    mocks.storeLanguage = 'en';
    mocks.mockResync.mockReset();
    mocks.mockRouterRefresh.mockReset();
    mocks.resetMigrationStore.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls MigrationController.resync when wasDbReset is true and user is authenticated', async () => {
    mocks.wasDbReset = true;
    mocks.mockResync.mockResolvedValue(undefined);

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.mockResync).toHaveBeenCalledWith('test-pubky-z32');
  });

  it('shows loading spinner while wasDbReset is true', () => {
    mocks.wasDbReset = true;
    mocks.mockResync.mockReturnValue(new Promise(() => {})); // never resolves

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('resets wasDbReset to false after resync completes', async () => {
    mocks.wasDbReset = true;
    mocks.mockResync.mockResolvedValue(undefined);

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.resetMigrationStore).toHaveBeenCalled();
  });

  it('handles resync errors gracefully — logs warning, does not throw, still resets flag', async () => {
    mocks.wasDbReset = true;
    mocks.mockResync.mockRejectedValue(new Error('resync failed'));

    const { Logger } = await import('@/libs');

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should have logged a warning
    expect(Logger.warn).toHaveBeenCalledWith(
      'Migration re-sync degraded',
      expect.objectContaining({
        error: expect.any(Error),
        pubky: 'test-pubky-z32',
      }),
    );

    // Flag should still be reset
    expect(mocks.resetMigrationStore).toHaveBeenCalled();
  });

  it('resync exceeding 10s times out without crashing', async () => {
    mocks.wasDbReset = true;
    // resync never resolves — the timeout will fire
    mocks.mockResync.mockReturnValue(new Promise(() => {}));

    const { Logger } = await import('@/libs');

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    // Advance past the 10s timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });

    // Timeout should trigger the catch path with a warning
    expect(Logger.warn).toHaveBeenCalledWith(
      'Migration re-sync degraded',
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );

    // Flag should be reset in finally
    expect(mocks.resetMigrationStore).toHaveBeenCalled();
  });

  it('does NOT call resync when currentUserPubky is falsy', async () => {
    mocks.wasDbReset = true;
    mocks.currentUserPubky = null;

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.mockResync).not.toHaveBeenCalled();
    // Should still reset wasDbReset since no user is logged in
    expect(mocks.resetMigrationStore).toHaveBeenCalled();
  });

  it('does NOT call resync when wasDbReset is false', async () => {
    mocks.wasDbReset = false;

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.mockResync).not.toHaveBeenCalled();
    expect(mocks.resetMigrationStore).not.toHaveBeenCalled();
  });

  it('does NOT call resync twice when effect re-fires via dependency change mid-resync', async () => {
    mocks.wasDbReset = true;
    mocks.mockResync.mockReturnValue(new Promise(() => {})); // never resolves — resync stays in-flight

    const { rerender } = render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    // First fire: resync is now running
    expect(mocks.mockResync).toHaveBeenCalledTimes(1);

    // Simulate a dependency change that would re-fire the effect (e.g. hasHydrated toggles)
    mocks.hasHydrated = false;
    rerender(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );
    mocks.hasHydrated = true;
    rerender(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    // The ref guard should prevent a second call while the first is still pending
    expect(mocks.mockResync).toHaveBeenCalledTimes(1);
  });

  it('does NOT call resync twice when effect re-fires (StrictMode guard)', async () => {
    mocks.wasDbReset = true;
    mocks.mockResync.mockResolvedValue(undefined);

    render(
      <React.StrictMode>
        <RouteGuardProvider>
          <div>Protected Content</div>
        </RouteGuardProvider>
      </React.StrictMode>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.mockResync).toHaveBeenCalledTimes(1);
  });

  it('shows loading text when wasDbReset is true', () => {
    mocks.wasDbReset = true;
    mocks.mockResync.mockReturnValue(new Promise(() => {}));

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('shows redirecting text when route is inaccessible and not loading', () => {
    mocks.wasDbReset = false;
    mocks.isLoading = false;
    mocks.pathname = '/settings';
    mocks.status = 'UNAUTHENTICATED';

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    expect(screen.getByText('redirecting')).toBeInTheDocument();
  });

  it('calls router.refresh() when storeLanguage differs from serverLocale', () => {
    mocks.storeLanguage = 'es';
    mocks.serverLocale = 'en';

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    expect(mocks.mockRouterRefresh).toHaveBeenCalled();
  });

  it('does NOT call router.refresh() when storeLanguage is null', () => {
    mocks.storeLanguage = null;
    mocks.serverLocale = 'en';

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    expect(mocks.mockRouterRefresh).not.toHaveBeenCalled();
  });

  it('does NOT call router.refresh() when storeLanguage matches serverLocale', () => {
    mocks.storeLanguage = 'en';
    mocks.serverLocale = 'en';

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    expect(mocks.mockRouterRefresh).not.toHaveBeenCalled();
  });
});
