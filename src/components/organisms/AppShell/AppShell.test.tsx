import { renderToString } from 'react-dom/server';
import { usePathname } from 'next/navigation';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COPYRIGHT_ROUTES, LEGAL_ROUTES } from '@/app/routes';
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

describe('AppShell', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/home');
  });

  it('renders app routes inside the database and auth gate, with the app chrome', () => {
    render(
      <AppShell>
        <p>Feed</p>
      </AppShell>,
    );

    const routeGuard = screen.getByTestId('route-guard-provider');
    expect(screen.getByTestId('database-provider')).toContainElement(routeGuard);
    expect(routeGuard).toContainElement(screen.getByText('Feed'));
    expect(routeGuard).toContainElement(screen.getByTestId('header'));
    for (const testId of APP_ONLY_TEST_IDS.slice(2)) {
      expect(routeGuard).toContainElement(screen.getByTestId(testId));
    }
  });

  it.each(PUBLIC_DOCUMENT_ROUTES)('renders %s with only the header, outside the gate', (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    render(
      <AppShell>
        <p>Document text</p>
      </AppShell>,
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByText('Document text')).toBeInTheDocument();
    for (const testId of APP_ONLY_TEST_IDS) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
  });

  it.each(PUBLIC_DOCUMENT_ROUTES)("puts the text of %s in the server's HTML", (pathname) => {
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
