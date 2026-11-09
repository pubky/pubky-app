import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import type { SessionReference } from '@/libs/auth/session.types';
import type { AuthStore } from '@/stores/auth/auth.types';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { mockSession } from '@/test-utils/pubky';
import { mockAuthStore } from '@/test-utils/stores';
import { ThemeProvider } from './ThemeProvider';

const { providerProps, mockPathname, authState } = vi.hoisted(() => ({
  providerProps: vi.fn(),
  mockPathname: { current: '/home' },
  authState: { current: {} as Partial<AuthStore> },
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children, ...props }: { children: React.ReactNode }) => {
    providerProps(props);
    return <div data-testid="theme-provider">{children}</div>;
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.current,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: <T,>(selector: (state: AuthStore) => T) => selector(mockAuthStore(authState.current)),
}));

const SESSION_REFERENCE: SessionReference = {
  kind: 'grant',
  sessionStoreId: 'store-1',
  clientId: 'client-1',
  grantId: 'grant-1',
  grantExpiresAt: 1,
  tokenExpiresAt: 1,
};

const SIGNED_IN: Partial<AuthStore> = {
  hasHydrated: true,
  currentUserPubky: 'pubky-1',
  session: mockSession(),
  sessionReference: SESSION_REFERENCE,
  restoreStatus: 'ready',
};

const SIGNED_OUT: Partial<AuthStore> = {
  hasHydrated: true,
  currentUserPubky: null,
  session: null,
  sessionReference: null,
  restoreStatus: 'idle',
};

function renderProvider() {
  render(<ThemeProvider>{null}</ThemeProvider>);
  return providerProps.mock.lastCall?.[0];
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    providerProps.mockClear();
    localStorage.clear();
    mockPathname.current = '/home';
    authState.current = SIGNED_IN;
  });

  it('renders children', () => {
    render(
      <ThemeProvider>
        <div>Themed content</div>
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
    expect(screen.getByText('Themed content')).toBeInTheDocument();
  });

  it('leaves color-scheme unset so transparent iframes are not given an opaque backdrop', () => {
    expect(renderProvider()).toEqual(expect.objectContaining({ enableColorScheme: false }));
  });

  it('passes only the class themes, since enableSystem already appends system', () => {
    expect(renderProvider()).toEqual(expect.objectContaining({ themes: ['dark', 'light'], enableSystem: true }));
  });

  it('renders the pre-paint signed-out theme script', () => {
    render(<ThemeProvider>{null}</ThemeProvider>);

    expect(document.getElementById('pubky-signed-out-theme')?.innerHTML).toContain(AUTH_PERSIST_KEY);
  });

  it.each(['/home', '/settings/appearance', '/profile'])('leaves the stored preference to a member on %s', (path) => {
    mockPathname.current = path;

    expect(renderProvider()?.forcedTheme).toBeUndefined();
  });

  it.each(['/', AUTH_ROUTES.SIGN_IN, AUTH_ROUTES.LOGOUT, ...Object.values(ONBOARDING_ROUTES)])(
    'forces dark on the signed-out page %s, even for a member',
    (path) => {
      mockPathname.current = path;

      expect(renderProvider()?.forcedTheme).toBe('dark');
    },
  );

  it.each(['/home', '/hot', '/copyright', '/terms-of-use'])('forces dark for a guest on %s', (path) => {
    mockPathname.current = path;
    authState.current = SIGNED_OUT;

    expect(renderProvider()?.forcedTheme).toBe('dark');
  });

  it('forces dark once a member has to sign in again', () => {
    authState.current = { ...SIGNED_IN, session: null, restoreStatus: 'reauth-required' };

    expect(renderProvider()?.forcedTheme).toBe('dark');
  });

  it('keeps the preference while a stored session is being restored', () => {
    authState.current = { ...SIGNED_IN, session: null, restoreStatus: 'restoring' };

    expect(renderProvider()?.forcedTheme).toBeUndefined();
  });

  describe('before the auth store rehydrates', () => {
    beforeEach(() => {
      authState.current = { ...SIGNED_OUT, hasHydrated: false };
    });

    it('keeps the preference when a session is stored', () => {
      localStorage.setItem(
        AUTH_PERSIST_KEY,
        JSON.stringify({ version: 3, state: { currentUserPubky: 'pubky-1', sessionReference: SESSION_REFERENCE } }),
      );

      expect(renderProvider()?.forcedTheme).toBeUndefined();
    });

    it('forces dark when no session is stored', () => {
      expect(renderProvider()?.forcedTheme).toBe('dark');
    });
  });

  it('switches back to the preference after sign-in and to dark after logout', () => {
    authState.current = SIGNED_OUT;
    const { rerender } = render(<ThemeProvider>{null}</ThemeProvider>);
    expect(providerProps.mock.lastCall?.[0].forcedTheme).toBe('dark');

    authState.current = SIGNED_IN;
    rerender(<ThemeProvider>{null}</ThemeProvider>);
    expect(providerProps.mock.lastCall?.[0].forcedTheme).toBeUndefined();

    mockPathname.current = AUTH_ROUTES.LOGOUT;
    rerender(<ThemeProvider>{null}</ThemeProvider>);
    expect(providerProps.mock.lastCall?.[0].forcedTheme).toBe('dark');
  });
});
