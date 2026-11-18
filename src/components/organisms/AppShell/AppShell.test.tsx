import { type ReactNode, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { usePathname } from 'next/navigation';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COPYRIGHT_ROUTES, LEGAL_ROUTES } from '@/app/routes';
import { AUTH_CLEANUP_CHANGED_EVENT } from '@/libs/auth/persistence';
import type { PersistedAuth } from '@/libs/auth/session.types';
import { SHOP_CLEANUP_ACK_KEY, SHOP_TEARDOWN_PENDING_KEY } from '@/libs/shop-embed/cleanup';
import { LocalAuthService } from '@/services/local/auth/auth';
import { ShopEmbedService } from '@/services/shop-embed/shop-embed';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AUTH_PERSIST_KEY, AUTH_STORE_VERSION, LEGACY_AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { mockGrantReference } from '@/test-utils/pubky';
import { createTestWebLocks } from '@/test-utils/web-locks';
import { AppShell } from './AppShell';

const cleanup = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('@/coordinators/auth/auth', () => ({
  AuthCoordinator: { getInstance: () => ({ watchGuestCleanup: cleanup.start }) },
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

// The gate opens IndexedDB and restores the session; stand-ins that only mark where they sit in the tree.
vi.mock('@/providers/DatabaseProvider/DatabaseProvider', () => ({
  DatabaseProvider: ({ children }: { children: ReactNode }) => <div data-testid="database-provider">{children}</div>,
}));
vi.mock('@/providers/RouteGuardProvider/RouteGuardProvider', () => ({
  RouteGuardProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="route-guard-provider">{children}</div>
  ),
}));
vi.mock('@/organisms/CoordinatorsManager/CoordinatorsManager', () => ({
  CoordinatorsManager: () => <div data-testid="coordinators-manager" />,
}));
vi.mock('@/organisms/Header/Header', () => ({
  Header: () => <header data-testid="header" />,
}));
vi.mock('@/organisms/Header/PublicHeader', () => ({
  PublicHeader: () => <header data-testid="public-header" />,
}));
vi.mock('@/molecules/Fab/Fab', () => ({
  Fab: () => <div data-testid="fab" />,
}));
vi.mock('@/organisms/GuestContextualBanner/GuestContextualBanner', () => ({
  GuestContextualBanner: () => <div data-testid="guest-contextual-banner" />,
}));
vi.mock('@/organisms/DialogSignIn/DialogSignIn', () => ({
  DialogSignIn: () => <div data-testid="dialog-sign-in" />,
}));

const PUBLIC_DOCUMENT_ROUTES = [...Object.values(LEGAL_ROUTES), COPYRIGHT_ROUTES.COPYRIGHT];
const APP_ONLY_TEST_IDS = [
  'database-provider',
  'route-guard-provider',
  'coordinators-manager',
  'fab',
  'guest-contextual-banner',
  'dialog-sign-in',
];

function persistGuest(overrides: Partial<PersistedAuth> = {}) {
  localStorage.setItem(
    AUTH_PERSIST_KEY,
    JSON.stringify({
      version: AUTH_STORE_VERSION,
      state: {
        generation: 'guest-generation',
        currentUserPubky: null,
        sessionReference: null,
        hasProfile: null,
        retiringSession: null,
        ...overrides,
      },
    }),
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    cleanup.start.mockReset().mockReturnValue(cleanup.stop);
    cleanup.stop.mockReset();
    localStorage.clear();
    useAuthStore.setState(useAuthStore.getInitialState());
    vi.mocked(usePathname).mockReturnValue('/home');
  });

  it('renders app routes inside the database and auth gate, with the app chrome', async () => {
    render(
      <AppShell>
        <p>Feed</p>
      </AppShell>,
    );

    const routeGuard = await screen.findByTestId('route-guard-provider');
    expect(screen.getByTestId('database-provider')).toContainElement(routeGuard);
    expect(routeGuard).toContainElement(screen.getByText('Feed'));
    expect(routeGuard).toContainElement(screen.getByTestId('header'));
    for (const testId of APP_ONLY_TEST_IDS.slice(2)) {
      expect(routeGuard).toContainElement(screen.getByTestId(testId));
    }
  });

  it.each(['/', ...PUBLIC_DOCUMENT_ROUTES])('renders %s with only the header, outside the gate', (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    render(
      <AppShell>
        <p>Document text</p>
      </AppShell>,
    );

    expect(screen.getByTestId('public-header')).toBeInTheDocument();
    expect(screen.getByText('Document text')).toBeInTheDocument();
    for (const testId of APP_ONLY_TEST_IDS) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
  });

  it('hands an existing session or a new same-tab sign-in to the normal guard', async () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<AppShell>Landing</AppShell>);
    expect(screen.getByTestId('public-header')).toBeInTheDocument();

    act(() => useAuthStore.setState({ restoreStatus: 'restoring' }));
    expect(await screen.findByTestId('route-guard-provider')).toContainElement(screen.getByText('Landing'));
    expect(screen.queryByTestId('public-header')).not.toBeInTheDocument();
  });

  it('uses the normal recovery path when the persisted record is unreadable', async () => {
    vi.mocked(usePathname).mockReturnValue('/');
    localStorage.setItem(AUTH_PERSIST_KEY, 'incomplete');
    render(<AppShell>Landing</AppShell>);
    expect(await screen.findByTestId('route-guard-provider')).toBeInTheDocument();
  });

  it('resumes cross-tab reconciliation when a guest receives an auth storage event', async () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<AppShell>Landing</AppShell>);
    expect(screen.getByTestId('public-header')).toBeInTheDocument();

    persistGuest({ currentUserPubky: 'alice', sessionReference: mockGrantReference() });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: AUTH_PERSIST_KEY })));
    expect(await screen.findByTestId('route-guard-provider')).toBeInTheDocument();
  });

  it('keeps an already signed-out account on the public landing after completed Shop cleanup', () => {
    localStorage.setItem(SHOP_CLEANUP_ACK_KEY, 'completed');
    persistGuest({ shopCleanupEpoch: 'completed' });
    vi.mocked(usePathname).mockReturnValue('/');
    render(<AppShell>Landing</AppShell>);
    expect(screen.getByTestId('public-header')).toBeInTheDocument();
    expect(screen.queryByTestId('database-provider')).not.toBeInTheDocument();
  });

  it('renders the public landing after an actual App logout and cleanup without a Shop acknowledgement', async ({
    onTestFinished,
  }) => {
    vi.stubGlobal('navigator', Object.create(navigator, { locks: { value: createTestWebLocks() } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const grant = mockGrantReference();
    const guest: PersistedAuth = {
      generation: 'logout',
      currentUserPubky: null,
      sessionReference: null,
      hasProfile: null,
      retiringSession: null,
    };
    await LocalAuthService.commit(
      { ...guest, currentUserPubky: 'alice', sessionReference: grant, generation: 'login' },
      '',
    );
    await LocalAuthService.commit(guest, 'login');
    await LocalAuthService.finishRetirement(grant.sessionStoreId);
    localStorage.setItem('pubky.messaging.session.v1', 'old-session');
    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect(LocalAuthService.read()).toMatchObject({ shopCleanupEpoch: 'logout', pendingRetirements: [] });
    expect(localStorage.getItem('pubky.messaging.session.v1')).toBeNull();
    expect(localStorage.getItem(SHOP_TEARDOWN_PENDING_KEY)).toBeNull();
    expect(localStorage.getItem(SHOP_CLEANUP_ACK_KEY)).toBeNull();
    await useAuthStore.persist.rehydrate();
    vi.mocked(usePathname).mockReturnValue('/');
    render(<AppShell>Landing</AppShell>);
    await waitFor(() => expect(cleanup.start).toHaveBeenCalledOnce());
    expect(screen.getByTestId('public-header')).toBeInTheDocument();
    expect(screen.getByText('Landing')).toBeVisible();
    expect(screen.queryByTestId('database-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('route-guard-provider')).not.toBeInTheDocument();
  });

  it('keeps guest-to-guest storage updates on the public landing and adopts their generation', async () => {
    vi.mocked(usePathname).mockReturnValue('/');
    useAuthStore.setState({ hasHydrated: true });
    render(<AppShell>Landing</AppShell>);
    persistGuest();
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: AUTH_PERSIST_KEY })));
    expect(useAuthStore.getState().generation).toBe('guest-generation');
    expect(screen.getByTestId('public-header')).toBeInTheDocument();
    expect(screen.queryByTestId('database-provider')).not.toBeInTheDocument();
  });

  it('preserves a pending landing action while cleanup starts, runs and completes', async () => {
    function LandingAction() {
      const [pending, setPending] = useState(false);
      return (
        <button disabled={pending} onClick={() => setPending(true)}>
          Continue
        </button>
      );
    }
    vi.mocked(usePathname).mockReturnValue('/');
    useAuthStore.setState({ generation: 'guest-generation', hasHydrated: true });
    persistGuest();
    render(
      <AppShell>
        <LandingAction />
      </AppShell>,
    );
    const button = screen.getByRole('button', { name: 'Continue' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(cleanup.start).not.toHaveBeenCalled();

    persistGuest({ pendingRetirements: [mockGrantReference()], shopCleanupEpoch: 'logout' });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: AUTH_PERSIST_KEY })));
    await waitFor(() => expect(cleanup.start).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Continue' })).toBe(button);
    expect(screen.queryByTestId('route-guard-provider')).not.toBeInTheDocument();

    localStorage.setItem(SHOP_CLEANUP_ACK_KEY, 'logout');
    act(() => window.dispatchEvent(new Event(AUTH_CLEANUP_CHANGED_EVENT)));
    expect(cleanup.stop).not.toHaveBeenCalled();

    persistGuest({ shopCleanupEpoch: 'logout' });
    act(() => window.dispatchEvent(new Event(AUTH_CLEANUP_CHANGED_EVENT)));
    expect(cleanup.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Continue' })).toBe(button);
    expect(button).toBeDisabled();
  });

  it('hands cross-tab storage removal to the normal sync when a guest has a stale generation', async () => {
    useAuthStore.setState({ generation: 'signed-out', hasHydrated: true });
    persistGuest({ generation: 'signed-out' });
    vi.mocked(usePathname).mockReturnValue('/');
    render(<AppShell>Landing</AppShell>);
    expect(screen.getByTestId('public-header')).toBeInTheDocument();

    localStorage.clear();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
    expect(await screen.findByTestId('route-guard-provider')).toBeInTheDocument();
  });

  it('reconciles outstanding cleanup against a changed generation before running it as a guest', async () => {
    useAuthStore.setState({ generation: 'previous', hasHydrated: true });
    persistGuest({ pendingRetirements: [mockGrantReference()] });
    vi.mocked(usePathname).mockReturnValue('/');
    render(<AppShell>Landing</AppShell>);
    expect(await screen.findByTestId('route-guard-provider')).toBeInTheDocument();
    expect(cleanup.start).not.toHaveBeenCalled();

    await act(async () => useAuthStore.persist.rehydrate());
    await waitFor(() => expect(cleanup.start).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('route-guard-provider')).not.toBeInTheDocument();
  });

  it('runs pending Shop teardown for a signed-out account after hydration', async () => {
    localStorage.setItem(SHOP_CLEANUP_ACK_KEY, 'logout');
    localStorage.setItem(SHOP_TEARDOWN_PENDING_KEY, '1');
    persistGuest({ shopCleanupEpoch: 'logout' });
    vi.mocked(usePathname).mockReturnValue('/');
    render(<AppShell>Landing</AppShell>);
    expect(cleanup.start).not.toHaveBeenCalled();
    act(() => useAuthStore.setState({ generation: 'guest-generation', hasHydrated: true }));
    await waitFor(() => expect(cleanup.start).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('route-guard-provider')).not.toBeInTheDocument();
  });

  it('preserves legacy-session cleanup on the landing page', async () => {
    localStorage.setItem(
      LEGACY_AUTH_PERSIST_KEY,
      JSON.stringify({ state: { currentUserPubky: null, sessionExport: 'legacy' } }),
    );
    useAuthStore.setState({ generation: 'legacy', hasHydrated: true });
    vi.mocked(usePathname).mockReturnValue('/');
    render(<AppShell>Landing</AppShell>);
    await waitFor(() => expect(cleanup.start).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('route-guard-provider')).not.toBeInTheDocument();
  });

  it.each(['/', ...PUBLIC_DOCUMENT_ROUTES])("puts the text of %s in the server's HTML", (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    const html = renderToString(
      <AppShell>
        <p>Document text</p>
      </AppShell>,
    );

    expect(html).toContain('Document text');
    expect(html).not.toContain('database-provider');
  });
});
