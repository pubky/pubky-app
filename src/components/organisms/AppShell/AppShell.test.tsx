import { renderToString } from 'react-dom/server';
import { usePathname } from 'next/navigation';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COPYRIGHT_ROUTES, LEGAL_ROUTES } from '@/app/routes';
import { AUTH_CLEANUP_CHANGED_EVENT } from '@/libs/auth/persistence';
import type { PersistedAuth } from '@/libs/auth/session.types';
import { SHOP_CLEANUP_ACK_KEY, SHOP_TEARDOWN_PENDING_KEY } from '@/libs/shop-embed/cleanup';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AUTH_PERSIST_KEY, AUTH_STORE_VERSION, LEGACY_AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { mockGrantReference } from '@/test-utils/pubky';
import { AppShell } from './AppShell';

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

  it('returns to the public landing only once all same-document cleanup obligations are gone', async () => {
    persistGuest({ pendingRetirements: [mockGrantReference()], shopCleanupEpoch: 'logout' });
    vi.mocked(usePathname).mockReturnValue('/');
    render(<AppShell>Landing</AppShell>);
    const guard = await screen.findByTestId('route-guard-provider');

    localStorage.setItem(SHOP_CLEANUP_ACK_KEY, 'logout');
    act(() => window.dispatchEvent(new Event(AUTH_CLEANUP_CHANGED_EVENT)));
    expect(screen.getByTestId('route-guard-provider')).toBe(guard);

    persistGuest({ shopCleanupEpoch: 'logout' });
    act(() => window.dispatchEvent(new Event(AUTH_CLEANUP_CHANGED_EVENT)));
    expect(await screen.findByTestId('public-header')).toBeInTheDocument();
    expect(screen.queryByTestId('route-guard-provider')).not.toBeInTheDocument();
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

  it('still runs the guard to finish pending Shop teardown for a signed-out account', async () => {
    localStorage.setItem(SHOP_CLEANUP_ACK_KEY, 'logout');
    localStorage.setItem(SHOP_TEARDOWN_PENDING_KEY, '1');
    persistGuest({ shopCleanupEpoch: 'logout' });
    vi.mocked(usePathname).mockReturnValue('/');
    render(<AppShell>Landing</AppShell>);
    expect(await screen.findByTestId('route-guard-provider')).toBeInTheDocument();
  });

  it('preserves legacy-session cleanup on the landing page', async () => {
    localStorage.setItem(
      LEGACY_AUTH_PERSIST_KEY,
      JSON.stringify({ state: { currentUserPubky: null, sessionExport: 'legacy' } }),
    );
    vi.mocked(usePathname).mockReturnValue('/');
    render(<AppShell>Landing</AppShell>);
    expect(await screen.findByTestId('route-guard-provider')).toBeInTheDocument();
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
