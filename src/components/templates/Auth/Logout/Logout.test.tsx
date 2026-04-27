import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Logout } from './Logout';
import { asOpaque } from '@/test-utils';

const mocks = vi.hoisted(() => {
  const authState = {
    hasHydrated: true,
    session: {} as object | null,
    sessionExport: null as string | null,
    isLoggingOut: false,
    setIsLoggingOut: vi.fn((value: boolean) => {
      authState.isLoggingOut = value;
    }),
  };

  const onboardingState = {
    hasHydrated: true,
  };

  return {
    authState,
    onboardingState,
    mockPush: vi.fn(),
    mockLogout: vi.fn(),
    mockLoggerError: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.mockPush,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      loadingTitle: 'Signing you out...',
      loadingSubtitle: "We're ending your session securely.",
      errorTitle: "We couldn't sign you out yet",
      errorSubtitle: 'Please try again to finish signing out securely.',
      homepage: 'Homepage',
      retry: 'Retry',
    };

    return translations[key] ?? key;
  },
}));

vi.mock('@/app', () => ({
  ROOT_ROUTES: '/',
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: {
    error: (...args: unknown[]) => mocks.mockLoggerError(...args),
  },
}));

vi.mock('@/atoms', () => ({
  Container: ({ children, className, size }: { children: React.ReactNode; className?: string; size?: string }) => (
    <div data-testid="container" data-class={className} data-size={size}>
      {children}
    </div>
  ),
  PageHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="page-header">{children}</div>,
  PageSubtitle: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Spinner: ({ size }: { size?: string }) => <div data-testid="spinner" data-size={size} />,
}));

vi.mock('@/molecules', () => ({
  LogoutContent: () => <div data-testid="logout-content">Logout content</div>,
  LogoutNavigation: () => <div data-testid="logout-navigation">Logout navigation</div>,
  PageTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  ContentCard: ({ children }: { children: React.ReactNode }) => <div data-testid="content-card">{children}</div>,
  ButtonsNavigation: ({
    backText,
    continueText,
    onHandleBackButton,
    onHandleContinueButton,
  }: {
    backText: string;
    continueText: string;
    onHandleBackButton: () => void;
    onHandleContinueButton: () => void;
  }) => (
    <div data-testid="buttons-navigation">
      <button onClick={onHandleBackButton}>{backText}</button>
      <button onClick={onHandleContinueButton}>{continueText}</button>
    </div>
  ),
}));

vi.mock('@/core', () => {
  const useAuthStore = ((selector?: (state: typeof mocks.authState) => unknown) =>
    selector ? selector(mocks.authState) : mocks.authState) as typeof import('@/core').useAuthStore;
  useAuthStore.getState = () => asOpaque<ReturnType<typeof useAuthStore.getState>>(mocks.authState);

  const useOnboardingStore = ((selector?: (state: typeof mocks.onboardingState) => unknown) =>
    selector ? selector(mocks.onboardingState) : mocks.onboardingState) as typeof import('@/core').useOnboardingStore;
  useOnboardingStore.getState = () => mocks.onboardingState as ReturnType<typeof useOnboardingStore.getState>;

  return {
    useAuthStore,
    useOnboardingStore,
    AuthController: {
      logout: (...args: unknown[]) => mocks.mockLogout(...args),
    },
  };
});

describe('Logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onboardingState.hasHydrated = true;
    mocks.authState.hasHydrated = true;
    mocks.authState.session = {};
    mocks.authState.sessionExport = null;
    mocks.authState.isLoggingOut = false;
  });

  it('shows a loading state first and then the success state for authenticated visits', async () => {
    mocks.mockLogout.mockImplementation(async () => {
      mocks.authState.session = null;
      mocks.authState.sessionExport = null;
    });

    render(<Logout />);

    expect(screen.getByText('Signing you out...')).toBeInTheDocument();
    expect(screen.queryByTestId('logout-content')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.mockLogout).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByTestId('logout-content')).toBeInTheDocument();
    });

    expect(mocks.authState.setIsLoggingOut).toHaveBeenCalledWith(false);
  });

  it('shows the success state immediately when the user is already signed out', async () => {
    mocks.authState.session = null;
    mocks.authState.sessionExport = null;
    mocks.authState.isLoggingOut = true;

    render(<Logout />);

    expect(screen.getByTestId('logout-content')).toBeInTheDocument();
    expect(mocks.mockLogout).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mocks.authState.setIsLoggingOut).toHaveBeenCalledWith(false);
    });
  });

  it('does not show the success state before a persisted-session logout finishes', async () => {
    let resolveLogout: (() => void) | undefined;
    mocks.authState.session = null;
    mocks.authState.sessionExport = 'session-export';
    mocks.mockLogout.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = () => {
            mocks.authState.session = null;
            mocks.authState.sessionExport = null;
            resolve();
          };
        }),
    );

    render(<Logout />);

    expect(screen.getByText('Signing you out...')).toBeInTheDocument();
    expect(screen.queryByTestId('logout-content')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.mockLogout).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByTestId('logout-content')).not.toBeInTheDocument();

    resolveLogout?.();

    await waitFor(() => {
      expect(screen.getByTestId('logout-content')).toBeInTheDocument();
    });
  });

  it('shows an inline retry state when logout fails locally', async () => {
    mocks.mockLogout.mockRejectedValue(new Error('clear failed'));

    render(<Logout />);

    await waitFor(() => {
      expect(screen.getByText("We couldn't sign you out yet")).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.queryByTestId('logout-content')).not.toBeInTheDocument();
    expect(mocks.mockLoggerError).toHaveBeenCalledWith('Failed to logout from /logout route', {
      error: expect.any(Error),
    });
  });

  it('retries logout from the inline error state and can reach success', async () => {
    mocks.mockLogout.mockRejectedValueOnce(new Error('clear failed')).mockImplementationOnce(async () => {
      mocks.authState.session = null;
      mocks.authState.sessionExport = null;
    });

    render(<Logout />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(mocks.mockLogout).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByTestId('logout-content')).toBeInTheDocument();
    });
  });

  it('navigates home from the inline error state', async () => {
    mocks.mockLogout.mockRejectedValue(new Error('clear failed'));

    render(<Logout />);

    await waitFor(() => {
      expect(screen.getByText('Homepage')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Homepage'));

    expect(mocks.mockPush).toHaveBeenCalledWith('/');
  });
});
