import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: vi.fn(() => ({
    secretKey: 'test-secret-key-value',
  })),
}));

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
  it('renders all required elements', () => {
    render(<AlertBackup />);

    // TriangleAlert icon is now actual lucide-react component (SVG), not mocked div
    // Text comes from actual English translations via the global next-intl mock
    expect(screen.getByText('Back up now')).toBeInTheDocument();
    expect(screen.getByText('Back up now to avoid losing your account!')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-backup')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-confirm-backup')).toBeInTheDocument();
  });
});

describe('AlertBackup - Snapshot', () => {
  it('matches snapshot for default AlertBackup', () => {
    const { container } = render(<AlertBackup />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
