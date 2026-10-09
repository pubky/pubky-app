import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_ROUTES,
  AUTH_ROUTES,
  COLLECTION_ROUTES,
  EXPLORE_ROUTES,
  ONBOARDING_ROUTES,
  ROOT_ROUTES,
} from '@/app/routes';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useMigrationStore } from '@/stores/migration/migration.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { onboardingInitialState } from '@/stores/onboarding/onboarding.types';
import { mockSession } from '@/test-utils/pubky';
import { RouteGuardProvider } from './RouteGuardProvider';

const mocks = vi.hoisted(() => ({
  pathname: '/home',
  push: vi.fn(),
  resync: vi.fn().mockResolvedValue(undefined),
  restore: vi.fn().mockResolvedValue(false),
  write: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    subscribeSessionFailures: vi.fn(() => vi.fn()),
    retrySessionRetirement: vi.fn().mockResolvedValue(undefined),
    retireLegacyCookieSessions: vi.fn().mockResolvedValue(undefined),
    restorePersistedSession: mocks.restore,
  },
}));
vi.mock('@/controllers/migration/migration', () => ({ MigrationController: { resync: mocks.resync } }));
vi.mock('@/hooks/useRestoreLocksAuth/useRestoreLocksAuth', () => ({ useRestoreLocksAuth: () => {} }));

function ExplorePage() {
  const { requireAuth } = useRequireAuth();
  return (
    <>
      <div>Public content</div>
      <button onClick={() => requireAuth(mocks.write)}>Account action</button>
    </>
  );
}

function renderRoute() {
  return render(
    <RouteGuardProvider>
      <ExplorePage />
    </RouteGuardProvider>,
  );
}

describe('RouteGuardProvider recovery with real route and auth rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = APP_ROUTES.HOME;
    useAuthStore.setState({ ...authInitialState, hasHydrated: true });
    useOnboardingStore.setState({ ...onboardingInitialState, hasHydrated: true });
    useMigrationStore.getState().reset();
  });

  describe.each(['reauth-required', 'temporary-error'] as const)('%s', (restoreStatus) => {
    beforeEach(() => {
      useAuthStore.setState({ currentUserPubky: 'retained-account', hasProfile: true, restoreStatus });
    });

    describe.each([false, true])('pending database resync: %s', (wasDbReset) => {
      beforeEach(() => useMigrationStore.getState().setWasDbReset(wasDbReset));

      it.each(EXPLORE_ROUTES)('allows reading %s while still gating account actions', (pathname) => {
        mocks.pathname = pathname;
        renderRoute();

        expect(screen.getByText('Public content')).toBeInTheDocument();
        expect(mocks.push).not.toHaveBeenCalled();
        expect(mocks.resync).not.toHaveBeenCalled();
        expect(useMigrationStore.getState().wasDbReset).toBe(wasDbReset);

        fireEvent.click(screen.getByRole('button', { name: 'Account action' }));
        expect(mocks.write).not.toHaveBeenCalled();
        expect(useAuthStore.getState().showSignInDialog).toBe(true);
        expect(useAuthStore.getState().currentUserPubky).toBe('retained-account');
      });

      it.each([ROOT_ROUTES, AUTH_ROUTES.SIGN_IN, ONBOARDING_ROUTES.HUMAN, ONBOARDING_ROUTES.BACKUP])(
        'allows the existing sign-in/onboarding flow on %s',
        (pathname) => {
          mocks.pathname = pathname;
          renderRoute();
          expect(screen.getByText('Public content')).toBeInTheDocument();
          expect(mocks.push).not.toHaveBeenCalled();
          expect(mocks.resync).not.toHaveBeenCalled();
          expect(useAuthStore.getState().currentUserPubky).toBe('retained-account');
        },
      );

      it.each([COLLECTION_ROUTES.BOOKMARKS, APP_ROUTES.SETTINGS, '/feed/custom', '/profile/notifications'])(
        'redirects %s to the landing page for sign-in',
        (pathname) => {
          mocks.pathname = pathname;
          renderRoute();
          expect(screen.queryByText('Public content')).not.toBeInTheDocument();
          expect(mocks.push).toHaveBeenCalledWith(ROOT_ROUTES);
          expect(mocks.resync).not.toHaveBeenCalled();
        },
      );
    });

    it('waits for hydration before rendering a core explore page', () => {
      useAuthStore.setState({ hasHydrated: false });
      renderRoute();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.queryByText('Public content')).not.toBeInTheDocument();
    });
  });

  it('allows public reads with a live session whose profile bootstrap needs recovery', () => {
    useAuthStore.setState({
      currentUserPubky: 'retained-account',
      session: mockSession(),
      hasProfile: false,
      restoreStatus: 'temporary-error',
    });
    useMigrationStore.getState().setWasDbReset(true);
    renderRoute();
    expect(screen.getByText('Public content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Account action' }));
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.resync).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('keeps a ready account without a profile in onboarding', () => {
    useAuthStore.setState({
      currentUserPubky: 'new-account',
      session: mockSession(),
      hasProfile: false,
      restoreStatus: 'ready',
    });
    renderRoute();
    expect(screen.queryByText('Public content')).not.toBeInTheDocument();
    expect(mocks.push).toHaveBeenCalledWith(ONBOARDING_ROUTES.PROFILE);
  });

  it('gates a previously available action when an open explore page loses its session', () => {
    useAuthStore.setState({
      currentUserPubky: 'retained-account',
      session: mockSession(),
      hasProfile: true,
      restoreStatus: 'ready',
    });
    renderRoute();
    act(() => useAuthStore.setState({ session: null, restoreStatus: 'reauth-required' }));
    expect(screen.getByText('Public content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Account action' }));
    expect(mocks.write).not.toHaveBeenCalled();
    expect(useAuthStore.getState().showSignInDialog).toBe(true);
  });
});

describe('mounted recovery context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      ...authInitialState,
      hasHydrated: true,
      currentUserPubky: 'account',
      session: mockSession(),
      hasProfile: true,
      restoreStatus: 'ready',
    });
    useOnboardingStore.setState({ ...onboardingInitialState, hasHydrated: true });
    useMigrationStore.getState().reset();
  });
  it.each([...EXPLORE_ROUTES, '/settings/edit', '/feed/custom', '/profile/posts'])(
    'preserves a draft while the same account restores on %s',
    (pathname) => {
      mocks.pathname = pathname;
      render(
        <RouteGuardProvider>
          <input aria-label="Post draft" defaultValue="unsent post" />
        </RouteGuardProvider>,
      );
      const input = screen.getByRole('textbox');
      act(() => useAuthStore.setState({ session: null, restoreStatus: 'restoring' }));
      expect(screen.getByRole('textbox')).toBe(input);
      expect(input).toHaveValue('unsent post');
      act(() => useAuthStore.getState().setShowSignInDialog(true));
      act(() => {
        useAuthStore.getState().setSession(mockSession());
        useAuthStore.getState().setRestoreStatus('ready');
      });
      expect(screen.getByRole('textbox')).toBe(input);
      expect(useAuthStore.getState().showSignInDialog).toBe(false);
    },
  );
  it('preserves a draft during an offline retry without a prior ready session in this tab', () => {
    mocks.pathname = APP_ROUTES.HOME;
    useAuthStore.setState({ session: null, restoreStatus: 'temporary-error' });
    render(
      <RouteGuardProvider>
        <input aria-label="Draft" defaultValue="offline draft" />
      </RouteGuardProvider>,
    );
    const input = screen.getByRole('textbox');
    act(() => useAuthStore.setState({ restoreStatus: 'restoring' }));
    expect(screen.getByRole('textbox')).toBe(input);
    act(() => useAuthStore.setState({ restoreStatus: 'temporary-error' }));
    expect(screen.getByRole('textbox')).toBe(input);
  });
  it('does not preserve a private page while another account restores', () => {
    mocks.pathname = '/settings/edit';
    renderRoute();
    act(() =>
      useAuthStore.setState({ currentUserPubky: 'another-account', session: null, restoreStatus: 'restoring' }),
    );
    expect(screen.queryByText('Public content')).not.toBeInTheDocument();
  });
  it('redirects failed restoration from mounted private settings even with a retained session', () => {
    mocks.pathname = APP_ROUTES.SETTINGS;
    renderRoute();
    expect(screen.getByText('Public content')).toBeInTheDocument();
    act(() => useAuthStore.setState({ restoreStatus: 'temporary-error' }));
    expect(mocks.push).toHaveBeenCalledWith(ROOT_ROUTES);
    expect(screen.queryByText('Public content')).not.toBeInTheDocument();
  });
  it.each([AUTH_ROUTES.SIGN_IN, ONBOARDING_ROUTES.PROFILE])(
    'keeps interactive bootstrap progress mounted on %s',
    (pathname) => {
      mocks.pathname = pathname;
      useAuthStore.setState({ hasProfile: false, restoreStatus: 'restoring' });
      render(
        <RouteGuardProvider>
          <div>Preparing your account</div>
        </RouteGuardProvider>,
      );
      expect(screen.getByText('Preparing your account')).toBeInTheDocument();
    },
  );
});
