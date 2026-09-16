import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/toast';
import { RouteGuardProvider } from './RouteGuardProvider';

// Hoisted mocks
const mocks = vi.hoisted(() => {
  const mockRouterPush = vi.fn();
  const mockRouterRefresh = vi.fn();
  const mockResync = vi.fn();
  const resetMigrationStore = vi.fn();
  const restorePersistedSession = vi.fn().mockResolvedValue(true);

  return {
    mockRouterPush,
    mockRouterRefresh,
    mockResync,
    resetMigrationStore,
    restorePersistedSession,
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
  };
});

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.mockRouterPush, refresh: mocks.mockRouterRefresh }),
  usePathname: () => mocks.pathname,
}));

vi.mock('@/hooks/useAuthStatus/useAuthStatus', () => ({
  useAuthStatus: () => ({ status: mocks.status, isLoading: mocks.isLoading }),
}));

// Mock @/app
vi.mock('@/app/routes', () => ({
  PUBLIC_ROUTES: ['/landing'],
  isDynamicPublicRoute: (path: string) => {
    const segments = path.split('/').filter(Boolean);
    return (
      (segments[0] === 'post' && segments.length === 3) ||
      (segments[0] === 'profile' && segments.length === 2 && segments[1].length === 52) ||
      (segments[0] === 'collections' && segments.length === 3 && segments[1] !== 'bookmarks')
    );
  },
  matchesAllowedRoute: (pathname: string, route: string, options?: { restrictExploreSubRoutes?: boolean }) => {
    const EXPLORE_ROUTES = ['/home', '/hot', '/search', '/collections'];
    if (pathname === route) return true;
    if (options?.restrictExploreSubRoutes && EXPLORE_ROUTES.includes(route)) return false;
    return pathname.startsWith(`${route}/`);
  },
}));

// Mock @/providers/RouteGuardProvider/RouteGuardProvider.constants
vi.mock('@/providers/RouteGuardProvider/RouteGuardProvider.constants', () => ({
  ROUTE_ACCESS_MAP: {
    AUTHENTICATED: { allowedRoutes: ['/feed', '/settings', '/collections'], redirectTo: '/feed' },
    UNAUTHENTICATED: {
      allowedRoutes: ['/login', '/landing', '/home', '/hot', '/search', '/collections'],
      redirectTo: '/login',
    },
    NEEDS_PROFILE_CREATION: { allowedRoutes: ['/create-profile'], redirectTo: '/create-profile' },
  },
}));

// Mock @/atoms
vi.mock('@/atoms/Spinner/Spinner', () => {
  return {
    Spinner: (props: Record<string, unknown>) => <div data-testid="spinner" {...props} />,
  };
});

vi.mock('@/libs/logger/logger', () => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/molecules/Toaster/toast');

// Mock auth store
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      hasHydrated: mocks.hasHydrated,
      session: mocks.session,
      sessionExport: mocks.sessionExport,
      currentUserPubky: mocks.currentUserPubky,
    }),
}));
vi.mock('@/stores/migration/migration.store', () => ({
  useMigrationStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({ wasDbReset: mocks.wasDbReset }),
    {
      getState: () => ({ reset: mocks.resetMigrationStore, wasDbReset: mocks.wasDbReset }),
    },
  ),
}));
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    restorePersistedSession: mocks.restorePersistedSession,
  },
}));
vi.mock('@/controllers/migration/migration', () => ({
  MigrationController: {
    resync: mocks.mockResync,
  },
}));

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
    mocks.mockResync.mockReset();
    mocks.mockRouterRefresh.mockReset();
    mocks.resetMigrationStore.mockReset();
    vi.mocked(toast).mockReset();
    mocks.restorePersistedSession.mockReset();
    mocks.restorePersistedSession.mockResolvedValue(true);
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

    expect(screen.getByText('Loading...')).toBeInTheDocument();
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

    expect(screen.getByText('Redirecting...')).toBeInTheDocument();
  });

  it('allows unauthenticated users to render core explore routes after auth loading resolves', () => {
    mocks.status = 'UNAUTHENTICATED';
    mocks.isLoading = false;
    mocks.currentUserPubky = null;
    mocks.pathname = '/home';

    render(
      <RouteGuardProvider>
        <div>Explore Content</div>
      </RouteGuardProvider>,
    );

    expect(screen.getByText('Explore Content')).toBeInTheDocument();
    expect(mocks.mockRouterPush).not.toHaveBeenCalled();
  });

  it('allows unauthenticated users to render the collections overview after auth loading resolves', () => {
    mocks.status = 'UNAUTHENTICATED';
    mocks.isLoading = false;
    mocks.currentUserPubky = null;
    mocks.pathname = '/collections';

    render(
      <RouteGuardProvider>
        <div>Collections Content</div>
      </RouteGuardProvider>,
    );

    expect(screen.getByText('Collections Content')).toBeInTheDocument();
    expect(mocks.mockRouterPush).not.toHaveBeenCalled();
  });

  it('allows unauthenticated users to render a single collection page', () => {
    mocks.status = 'UNAUTHENTICATED';
    mocks.isLoading = false;
    mocks.currentUserPubky = null;
    mocks.pathname = '/collections/o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy/0034BBBDFK83G';

    render(
      <RouteGuardProvider>
        <div>Single Collection Content</div>
      </RouteGuardProvider>,
    );

    expect(screen.getByText('Single Collection Content')).toBeInTheDocument();
    expect(mocks.mockRouterPush).not.toHaveBeenCalled();
  });

  it('still protects collections bookmarks for unauthenticated users', () => {
    mocks.status = 'UNAUTHENTICATED';
    mocks.isLoading = false;
    mocks.currentUserPubky = null;
    mocks.pathname = '/collections/bookmarks';

    render(
      <RouteGuardProvider>
        <div>Bookmarks Content</div>
      </RouteGuardProvider>,
    );

    expect(screen.getByText('Redirecting...')).toBeInTheDocument();
    expect(screen.queryByText('Bookmarks Content')).not.toBeInTheDocument();
  });

  it('allows authenticated users to render collections bookmarks via prefix matching', () => {
    mocks.status = 'AUTHENTICATED';
    mocks.isLoading = false;
    mocks.currentUserPubky = 'test-pubky-z32';
    mocks.pathname = '/collections/bookmarks';

    render(
      <RouteGuardProvider>
        <div>Bookmarks Content</div>
      </RouteGuardProvider>,
    );

    expect(screen.getByText('Bookmarks Content')).toBeInTheDocument();
    expect(mocks.mockRouterPush).not.toHaveBeenCalled();
  });

  it('still protects bookmarks for unauthenticated users', () => {
    mocks.status = 'UNAUTHENTICATED';
    mocks.isLoading = false;
    mocks.currentUserPubky = null;
    mocks.pathname = '/bookmarks';

    render(
      <RouteGuardProvider>
        <div>Bookmarks Content</div>
      </RouteGuardProvider>,
    );

    expect(screen.getByText('Redirecting...')).toBeInTheDocument();
    expect(screen.queryByText('Bookmarks Content')).not.toBeInTheDocument();
  });

  it('keeps profile-creation users on onboarding instead of core explore routes', () => {
    mocks.status = 'NEEDS_PROFILE_CREATION';
    mocks.isLoading = false;
    mocks.pathname = '/home';

    render(
      <RouteGuardProvider>
        <div>Explore Content</div>
      </RouteGuardProvider>,
    );

    expect(screen.getByText('Redirecting...')).toBeInTheDocument();
    expect(screen.queryByText('Explore Content')).not.toBeInTheDocument();
    expect(mocks.mockRouterPush).toHaveBeenCalledWith('/create-profile');
  });
});

describe('RouteGuardProvider — session restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasHydrated = true;
    mocks.session = null;
    mocks.sessionExport = 'session-export';
    mocks.currentUserPubky = null;
    mocks.wasDbReset = false;
    mocks.status = 'UNAUTHENTICATED';
    mocks.isLoading = false;
    mocks.pathname = '/home';
    vi.mocked(toast).mockReset();
    mocks.restorePersistedSession.mockReset();
    mocks.restorePersistedSession.mockResolvedValue(true);
  });

  it('toasts when persisted session restore fails for wrong-environment homeserver', async () => {
    mocks.restorePersistedSession.mockRejectedValue(
      Err.auth(AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER, 'wrong env', {
        service: ErrorService.Homeserver,
        operation: 'assertUserHomeserverAllowed',
      }),
    );

    render(
      <RouteGuardProvider>
        <div>Protected Content</div>
      </RouteGuardProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'This key is linked to a different homeserver. Use a staging account on this site.',
    });
    expect(Logger.error).not.toHaveBeenCalled();
  });
});
