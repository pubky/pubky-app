import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_ROUTES } from '@/app/routes';
import { SignInNavigation } from './SignInNavigation';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Minimal atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" data-class-name={className}>
        {children}
      </div>
    ),
  };
});

// Use real libs - use actual implementations

// Stub child dialogs so we can trigger onRestore
vi.mock('@/organisms/DialogRestoreEncryptedFile/DialogRestoreEncryptedFile', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/organisms/DialogRestoreEncryptedFile/DialogRestoreEncryptedFile')>();
  return {
    ...actual,
    DialogRestoreEncryptedFile: ({ onRestore }: { onRestore?: () => void }) => (
      <button data-testid="restore-file" onClick={onRestore}>
        Restore File
      </button>
    ),
  };
});

vi.mock('@/organisms/DialogRestoreRecoveryPhrase/DialogRestoreRecoveryPhrase', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/organisms/DialogRestoreRecoveryPhrase/DialogRestoreRecoveryPhrase')>();
  return {
    ...actual,
    DialogRestoreRecoveryPhrase: ({ onRestore }: { onRestore?: () => void }) => (
      <button data-testid="restore-phrase" onClick={onRestore}>
        Restore Phrase
      </button>
    ),
  };
});

let mockSignInState = { authUrlResolved: false };

vi.mock('@/stores/signIn/signIn.store', () => ({
  useSignInStore: vi.fn((selector) => {
    if (typeof selector === 'function') {
      return selector(mockSignInState);
    }
    return mockSignInState;
  }),
}));

describe('SignInNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInState = { authUrlResolved: false };
  });

  it('renders both restore dialogs', () => {
    render(<SignInNavigation />);

    expect(screen.getByTestId('restore-phrase')).toBeInTheDocument();
    expect(screen.getByTestId('restore-file')).toBeInTheDocument();
  });

  it('pushes to HOME on restore (phrase)', () => {
    render(<SignInNavigation />);

    fireEvent.click(screen.getByTestId('restore-phrase'));
    expect(mockPush).toHaveBeenCalledWith(HOME_ROUTES.HOME);
  });

  it('pushes to HOME on restore (file)', () => {
    render(<SignInNavigation />);

    fireEvent.click(screen.getByTestId('restore-file'));
    expect(mockPush).toHaveBeenCalledWith(HOME_ROUTES.HOME);
  });

  it('does not render when sign-in progress is active', () => {
    mockSignInState.authUrlResolved = true;

    render(<SignInNavigation />);

    expect(screen.queryByTestId('restore-phrase')).not.toBeInTheDocument();
    expect(screen.queryByTestId('restore-file')).not.toBeInTheDocument();
  });
});

describe('SignInNavigation - Snapshots', () => {
  beforeEach(() => {
    mockSignInState = { authUrlResolved: false };
  });

  it('matches snapshot', () => {
    const { container } = render(<SignInNavigation />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
