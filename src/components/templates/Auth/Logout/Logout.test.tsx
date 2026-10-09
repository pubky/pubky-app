import React from 'react';
import { Keypair } from '@synonymdev/pubky';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionReference } from '@/libs/auth/session.types';
import { createCanceledError } from '@/libs/error/auth-flow-canceled';
import { mockGrantReference } from '@/test-utils/pubky';
import { Logout } from './Logout';

const mocks = vi.hoisted(() => {
  const authState = {
    hasHydrated: true,
    restoreStatus: 'idle',
    session: {} as object | null,
    currentUserPubky: 'account' as string | null,
    sessionReference: null as SessionReference | null,
    isLoggingOut: false,
    setIsLoggingOut: vi.fn((value: boolean) => {
      authState.isLoggingOut = value;
    }),
  };

  const onboardingState = {
    secretKey: '',
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

vi.mock('@/organisms/AlertBackup/AlertBackup', () => ({ AlertBackup: () => <div>Backup controls</div> }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.mockPush,
  }),
}));
vi.mock('@/app/routes', () => ({
  ROOT_ROUTES: '/',
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: {
    error: (...args: unknown[]) => mocks.mockLoggerError(...args),
  },
}));

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className, size }: { children: React.ReactNode; className?: string; size?: string }) => (
      <div data-testid="container" data-class={className} data-size={size}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/PageHeader/PageHeader', () => {
  return {
    PageHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="page-header">{children}</div>,
  };
});

vi.mock('@/atoms/PageSubtitle/PageSubtitle', () => {
  return {
    PageSubtitle: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  };
});

vi.mock('@/atoms/Spinner/Spinner', () => {
  return {
    Spinner: ({ size }: { size?: string }) => <div data-testid="spinner" data-size={size} />,
  };
});

vi.mock('@/molecules/ButtonsNavigation/ButtonsNavigation', () => {
  return {
    ButtonsNavigation: ({
      backText,
      continueText,
      onHandleBackButton,
      onHandleContinueButton,
      className,
      hiddenContinueButton,
    }: {
      hiddenContinueButton?: boolean;
      backText: string;
      continueText: string;
      onHandleBackButton: () => void;
      onHandleContinueButton: () => void;
      className?: string;
    }) => (
      <div data-testid="buttons-navigation" data-class={className}>
        <button onClick={onHandleBackButton}>{backText}</button>
        {!hiddenContinueButton && <button onClick={onHandleContinueButton}>{continueText}</button>}
      </div>
    ),
  };
});

vi.mock('@/molecules/Content/Content', () => {
  return {
    ContentCard: ({ children }: { children: React.ReactNode }) => <div data-testid="content-card">{children}</div>,
  };
});

vi.mock('@/molecules/Logout/Logout', () => {
  return {
    LogoutContent: () => <div data-testid="logout-content">Logout content</div>,
    LogoutNavigation: ({ className }: { className?: string }) => (
      <div data-testid="logout-navigation" data-class={className}>
        Logout navigation
      </div>
    ),
  };
});

vi.mock('@/molecules/Page/Page', () => {
  return {
    PageTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector?: (state: typeof mocks.authState) => unknown) => (selector ? selector(mocks.authState) : mocks.authState),
    {
      getState: () => mocks.authState,
    },
  ),
}));
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: Object.assign(
    (selector?: (state: typeof mocks.onboardingState) => unknown) =>
      selector ? selector(mocks.onboardingState) : mocks.onboardingState,
    {
      getState: () => mocks.onboardingState,
    },
  ),
}));
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    logout: (...args: unknown[]) => mocks.mockLogout(...args),
  },
}));

describe('Logout', () => {
  it('waits for backup confirmation before direct-route signout', async () => {
    const key = Keypair.random();
    mocks.onboardingState.secretKey = Buffer.from(key.secret()).toString('hex');
    mocks.authState.currentUserPubky = key.publicKey.z32();
    mocks.mockLogout.mockResolvedValue(undefined);
    const { rerender } = render(<Logout />);
    expect(screen.getByText('Back up your key before signing out')).toBeInTheDocument();
    expect(screen.getByText('Backup controls')).toBeInTheDocument();
    expect(mocks.mockLogout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Homepage' }));
    expect(mocks.mockPush).toHaveBeenCalledWith('/');
    expect(mocks.onboardingState.secretKey).not.toBe('');
    expect(mocks.mockLogout).not.toHaveBeenCalled();
    mocks.onboardingState.secretKey = '';
    rerender(<Logout />);
    expect(await screen.findByTestId('logout-content')).toBeInTheDocument();
    expect(mocks.mockLogout).toHaveBeenCalledOnce();
  });
  it('does not ask for a backup of an unrelated onboarding key', async () => {
    mocks.onboardingState.secretKey = Buffer.from(Keypair.random().secret()).toString('hex');
    mocks.mockLogout.mockResolvedValue(undefined);
    render(<Logout />);
    expect(await screen.findByTestId('logout-content')).toBeInTheDocument();
    expect(screen.queryByText('Backup controls')).not.toBeInTheDocument();
    expect(mocks.mockLogout).toHaveBeenCalledOnce();
  });
  it('waits for a controller-owned logout even after the account fields are cleared', () => {
    mocks.authState.currentUserPubky = null;
    mocks.authState.session = null;
    mocks.authState.isLoggingOut = true;
    render(<Logout />);
    expect(screen.getByText('Signing you out...')).toBeInTheDocument();
    expect(mocks.authState.setIsLoggingOut).not.toHaveBeenCalled();
    expect(mocks.mockLogout).not.toHaveBeenCalled();
  });
  describe('Snapshots', () => {
    it('matches the backup confirmation state', () => {
      const key = Keypair.random();
      mocks.onboardingState.secretKey = Buffer.from(key.secret()).toString('hex');
      mocks.authState.currentUserPubky = key.publicKey.z32();
      const { container } = render(<Logout />);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('matches the canceled logout state with navigation at the bottom', async () => {
      mocks.mockLogout.mockRejectedValue(createCanceledError());
      const { container } = render(<Logout />);
      await screen.findByText('Your account changed');
      expect(screen.getByTestId('buttons-navigation').parentElement).toHaveClass('onboarding-nav');
      expect(container.firstChild).toMatchSnapshot();
    });
  });
  it('shows cancellation when a newer account supersedes logout', async () => {
    mocks.mockLogout.mockRejectedValue(createCanceledError());
    render(<Logout />);
    expect(await screen.findByText('Your account changed')).toBeInTheDocument();
    expect(screen.queryByTestId('logout-content')).not.toBeInTheDocument();
    expect(mocks.mockLoggerError).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onboardingState.hasHydrated = true;
    mocks.onboardingState.secretKey = '';
    mocks.authState.hasHydrated = true;
    mocks.authState.restoreStatus = 'idle';
    mocks.authState.session = {};
    mocks.authState.currentUserPubky = 'account';
    mocks.authState.sessionReference = null;
    mocks.authState.isLoggingOut = false;
  });

  it('runs explicit cleanup when corrupt metadata left no readable account fields', async () => {
    mocks.authState.session = null;
    mocks.authState.sessionReference = null;
    mocks.authState.currentUserPubky = null;
    mocks.authState.restoreStatus = 'temporary-error';
    mocks.mockLogout.mockResolvedValue(undefined);
    render(<Logout />);
    expect(await screen.findByTestId('logout-content')).toBeInTheDocument();
    expect(mocks.mockLogout).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state first and then the success state for authenticated visits', async () => {
    mocks.mockLogout.mockImplementation(async () => {
      mocks.authState.session = null;
      mocks.authState.sessionReference = null;
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

    expect(mocks.authState.setIsLoggingOut).not.toHaveBeenCalled();
  });

  it('shows the success state immediately when the user is already signed out', async () => {
    mocks.authState.currentUserPubky = null;
    mocks.authState.session = null;
    mocks.authState.sessionReference = null;
    mocks.authState.isLoggingOut = false;

    render(<Logout />);

    expect(screen.getByTestId('logout-content')).toBeInTheDocument();
    expect(mocks.mockLogout).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mocks.authState.setIsLoggingOut).not.toHaveBeenCalled();
    });
  });

  it('does not show the success state before a persisted-session logout finishes', async () => {
    let resolveLogout: (() => void) | undefined;
    mocks.authState.session = null;
    mocks.authState.sessionReference = mockGrantReference();
    mocks.mockLogout.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = () => {
            mocks.authState.session = null;
            mocks.authState.sessionReference = null;
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
      mocks.authState.sessionReference = null;
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

  it('drops the doubled mobile bottom inset on the signed-out navigation', () => {
    mocks.authState.currentUserPubky = null;
    mocks.authState.session = null;
    mocks.authState.sessionReference = null;

    render(<Logout />);

    expect(screen.getByTestId('logout-navigation')).toHaveAttribute('data-class', 'pb-0 lg:pb-6');
  });

  it('drops the doubled mobile bottom inset on the error-state navigation', async () => {
    mocks.mockLogout.mockRejectedValue(new Error('clear failed'));

    render(<Logout />);

    await waitFor(() => {
      expect(screen.getByText("We couldn't sign you out yet")).toBeInTheDocument();
    });

    expect(screen.getByTestId('buttons-navigation')).toHaveAttribute('data-class', 'pb-0 lg:pb-6');
  });
});

describe('Logout after cookie migration', () => {
  it('runs cleanup for a retained account even though its cookie reference was discarded', async () => {
    mocks.authState.hasHydrated = true;
    mocks.onboardingState.hasHydrated = true;
    mocks.onboardingState.secretKey = '';
    mocks.authState.session = null;
    mocks.authState.sessionReference = null;
    mocks.authState.currentUserPubky = 'legacy-account';
    mocks.authState.isLoggingOut = false;
    mocks.mockLogout.mockReset().mockImplementation(async () => {
      mocks.authState.currentUserPubky = null;
    });
    render(<Logout />);
    expect(await screen.findByTestId('logout-content')).toBeInTheDocument();
    expect(mocks.mockLogout).toHaveBeenCalledOnce();
    expect(mocks.authState.currentUserPubky).toBeNull();
  });
});
