import { Keypair } from '@synonymdev/pubky';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';
import { AlertBackup } from './AlertBackup';

vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: vi.fn(({ children }: { children: React.ReactNode }) => <div data-testid="dialog">{children}</div>),
    DialogTrigger: vi.fn(({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-trigger">{children}</div>
    )),
    DialogClose: vi.fn(({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-close">{children}</div>
    )),
    DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-content" className={className}>
        {children}
      </div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
    DialogDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-description" className={className}>
        {children}
      </div>
    ),
  };
});

// Mock dependencies
// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      variant,
      className,
      onClick,
    }: {
      children: React.ReactNode;
      variant?: string;
      className?: string;
      onClick?: () => void;
    }) => (
      <button data-testid="button" data-variant={variant} className={className} onClick={onClick}>
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Card/Card', () => {
  return {
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Input/Input', () => {
  return {
    Input: ({
      type,
      id,
      placeholder,
      value,
      onChange,
      className,
    }: {
      type?: string;
      id?: string;
      placeholder?: string;
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      className?: string;
    }) => (
      <input
        data-testid="input"
        type={type}
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={className}
      />
    ),
  };
});

vi.mock('@/atoms/Label/Label', () => {
  return {
    Label: ({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) => (
      <label data-testid="label" htmlFor={htmlFor} className={className}>
        {children}
      </label>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, size, className }: { children: React.ReactNode; size?: string; className?: string }) => (
      <p data-testid="typography" data-size={size} className={className}>
        {children}
      </p>
    ),
  };
});

// Mock molecules
vi.mock('@/organisms/DialogBackupExport/DialogBackupExport', () => {
  return {
    DialogBackupExport: vi.fn(() => <div data-testid="dialog-export">DialogBackupExport</div>),
  };
});

// Mock organisms
vi.mock('@/organisms/DialogBackup/DialogBackup', () => {
  return {
    DialogBackup: vi.fn(() => <div data-testid="dialog-backup">DialogBackup</div>),
  };
});

vi.mock('@/organisms/DialogBackupEncrypted/DialogBackupEncrypted', () => {
  return {
    DialogBackupEncrypted: vi.fn(() => <div data-testid="dialog-backup-encrypted">DialogBackupEncrypted</div>),
  };
});

vi.mock('@/organisms/DialogBackupPhrase/DialogBackupPhrase', () => {
  return {
    DialogBackupPhrase: vi.fn(() => <div data-testid="dialog-backup-phrase">DialogBackupPhrase</div>),
  };
});

vi.mock('@/organisms/DialogConfirmBackup/DialogConfirmBackup', () => {
  return {
    DialogConfirmBackup: vi.fn(() => <div data-testid="dialog-confirm-backup">DialogConfirmBackup</div>),
  };
});

describe('AlertBackup', () => {
  beforeEach(() => {
    useAuthStore.setState(authInitialState);
    useOnboardingStore.getState().reset();
    useOnboardingStore.setState({ secretKey: Buffer.from(Keypair.random().secret()).toString('hex') });
  });

  it.each([true, false])('shows sign-in instructions only for the matching saved key (%s)', (matches) => {
    const keypair = Keypair.random();
    useOnboardingStore.setState({ secretKey: Buffer.from(keypair.secret()).toString('hex'), mnemonic: 'saved phrase' });
    useAuthStore.setState({
      currentUserPubky: matches ? keypair.publicKey.z32() : Keypair.random().publicKey.z32(),
      restoreStatus: 'reauth-required',
    });
    render(<AlertBackup />);
    const instruction = screen.queryByText(/then use it on the Sign In page/);
    if (matches) expect(instruction).toBeInTheDocument();
    else expect(instruction).not.toBeInTheDocument();
    expect(screen.getByTestId('dialog-confirm-backup')).toBeInTheDocument();
    expect(useOnboardingStore.getState().mnemonic).toBe('saved phrase');
  });

  it('renders all required elements', () => {
    useAuthStore.setState({ currentUserPubky: 'account', session: mockSession(), restoreStatus: 'ready' });
    render(<AlertBackup />);

    // TriangleAlert icon is now actual lucide-react component (SVG), not mocked div
    expect(screen.getByText('Back up now')).toBeInTheDocument();
    expect(screen.getByText('Back up now to avoid losing your account!')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-backup')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-confirm-backup')).toBeInTheDocument();
  });

  it.each([
    {
      account: 'a ready session',
      state: { session: mockSession(), sessionReference: mockGrantReference(), restoreStatus: 'ready' },
    },
    {
      account: 'a session being restored',
      state: { session: null, sessionReference: mockGrantReference(), restoreStatus: 'restoring' },
    },
    {
      account: 'a saved session pending restoration',
      state: { session: null, sessionReference: mockGrantReference(), restoreStatus: 'idle' },
    },
    { account: 'a failed restore', state: { session: null, sessionReference: null, restoreStatus: 'temporary-error' } },
  ] as const)('keeps the alert for a member with $account', ({ state }) => {
    useAuthStore.setState({ currentUserPubky: 'account', ...state });
    render(<AlertBackup />);
    expect(screen.getByText('Back up now')).toBeInTheDocument();
  });

  describe('guest with a generated pubky (#2955)', () => {
    const keypair = Keypair.random();
    beforeEach(() => {
      useOnboardingStore.setState({ secretKey: Buffer.from(keypair.secret()).toString('hex') });
      useAuthStore.setState({
        currentUserPubky: keypair.publicKey.z32(),
        session: null,
        sessionReference: null,
        restoreStatus: 'idle',
      });
    });

    it('renders nothing while the key has no session and nothing to restore', () => {
      const { container } = render(<AlertBackup />);
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByText('Back up now')).not.toBeInTheDocument();
    });

    it('shows the alert once that key signs in', () => {
      render(<AlertBackup />);
      act(() => useAuthStore.setState({ session: mockSession(), restoreStatus: 'ready' }));
      expect(screen.getByText('Back up now')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-backup')).toBeInTheDocument();
    });

    it('keeps the alert after a reload while a sign-up for the stored secret is recorded', () => {
      // The generated pubky is not persisted, the secret and the attempt are.
      useAuthStore.setState({ currentUserPubky: null });
      useOnboardingStore.setState({
        signupAttempt: {
          pubky: keypair.publicKey.z32(),
          homeserver: 'homeserver',
          environment: 'staging',
          phase: 'created',
        },
      });
      render(<AlertBackup />);
      expect(screen.getByText('Back up now')).toBeInTheDocument();
    });

    it('renders nothing after a reload without a sign-up attempt', () => {
      useAuthStore.setState({ currentUserPubky: null });
      const { container } = render(<AlertBackup />);
      expect(container).toBeEmptyDOMElement();
    });

    it.each(['creating', 'created'] as const)(
      'keeps the alert while a sign-up for that key is %s: it may already own an account',
      (phase) => {
        useOnboardingStore.setState({
          signupAttempt: { pubky: keypair.publicKey.z32(), homeserver: 'homeserver', environment: 'staging', phase },
        });
        render(<AlertBackup />);
        expect(screen.getByText('Back up now')).toBeInTheDocument();
      },
    );
  });
});
