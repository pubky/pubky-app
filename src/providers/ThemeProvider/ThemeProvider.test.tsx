import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const MEMBER: Partial<AuthStore> = { hasHydrated: true, currentUserPubky: 'pubky-1', session: mockSession() };
const GUEST: Partial<AuthStore> = { hasHydrated: true, currentUserPubky: null, session: null };

function storeSession() {
  localStorage.setItem(AUTH_PERSIST_KEY, JSON.stringify({ state: { sessionReference: { kind: 'grant' } } }));
}

function forcedTheme() {
  render(<ThemeProvider>{null}</ThemeProvider>);
  return providerProps.mock.lastCall?.[0].forcedTheme;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    mockPathname.current = '/home';
    authState.current = MEMBER;
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
    render(<ThemeProvider>{null}</ThemeProvider>);

    expect(providerProps).toHaveBeenCalledWith(expect.objectContaining({ enableColorScheme: false }));
  });

  it('passes only the class themes, since enableSystem already appends system', () => {
    render(<ThemeProvider>{null}</ThemeProvider>);

    expect(providerProps).toHaveBeenCalledWith(
      expect.objectContaining({ themes: ['dark', 'light'], enableSystem: true }),
    );
  });

  it('leaves the stored preference to a signed-in member', () => {
    expect(forcedTheme()).toBeUndefined();
  });

  it.each(['/', '/sign-in', '/logout', '/onboarding/profile'])('forces dark on %s, even for a member', (path) => {
    mockPathname.current = path;

    expect(forcedTheme()).toBe('dark');
  });

  it('forces dark for a guest', () => {
    authState.current = GUEST;

    expect(forcedTheme()).toBe('dark');
  });

  it('reads the stored session until the auth store rehydrates', () => {
    authState.current = { ...GUEST, hasHydrated: false };
    expect(forcedTheme()).toBe('dark');

    storeSession();
    expect(forcedTheme()).toBeUndefined();
  });

  describe('pre-paint script', () => {
    const root = document.documentElement;

    function runScript() {
      render(<ThemeProvider>{null}</ThemeProvider>);
      new Function(document.querySelector('script')?.innerHTML ?? '')();
    }

    beforeEach(() => {
      localStorage.setItem('pubky-theme', 'light');
      root.className = 'light';
    });

    it('swaps light for dark without touching the stored preference when no session is stored', () => {
      runScript();

      expect(root.className).toBe('dark');
      expect(localStorage.getItem('pubky-theme')).toBe('light');
    });

    it('keeps light when a session is stored', () => {
      storeSession();

      runScript();

      expect(root.className).toBe('light');
    });
  });
});
