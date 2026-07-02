import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackupMethodCard } from './BackupMethodCard';

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
    DialogHeader: vi.fn(() => <div data-testid="dialog-header" />),
    DialogTitle: vi.fn(() => <h2 data-testid="dialog-title" />),
    DialogDescription: vi.fn(() => <div data-testid="dialog-description" />),
  };
});

interface MockOnboardingState {
  mnemonic?: string | null;
  secretKey?: string;
  hasHydrated?: boolean;
}

// Mock onboarding store
const mockUseOnboardingStore = vi.fn<() => MockOnboardingState>();
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: (selector: (state: MockOnboardingState) => unknown) => selector(mockUseOnboardingStore()),
}));

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      variant,
      className,
      onClick,
      id,
    }: {
      children: React.ReactNode;
      variant?: string;
      className?: string;
      onClick?: () => void;
      id?: string;
    }) => (
      <button id={id} data-testid="button" data-variant={variant} className={className} onClick={onClick}>
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

vi.mock('@/atoms/Heading/Heading', () => {
  return {
    Heading: ({
      children,
      level,
      size,
      className,
    }: {
      children: React.ReactNode;
      level: number;
      size?: string;
      className?: string;
    }) => (
      <div data-testid={`heading-${level}`} data-size={size} className={className}>
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
      <div data-testid="typography" data-size={size} className={className}>
        {children}
      </div>
    ),
  };
});

// Mock molecules
vi.mock('@/molecules/Content/Content', () => {
  return {
    ContentCard: ({
      children,
      image,
      className,
    }: {
      children: React.ReactNode;
      image?: { src: string; alt: string; width: number; height: number };
      className?: string;
    }) => (
      <div data-testid="content-card" data-image-src={image?.src} data-image-alt={image?.alt} className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/molecules/PopoverBackup/PopoverBackup', () => {
  return {
    PopoverBackup: () => <div data-testid="popover-backup">Backup Info</div>,
  };
});

// Mock organisms
vi.mock('@/organisms/DialogBackupEncrypted/DialogBackupEncrypted', () => {
  return {
    DialogBackupEncrypted: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="dialog-backup-encrypted">{children || 'Backup Encrypted'}</div>
    ),
  };
});

vi.mock('@/organisms/DialogBackupExport/DialogBackupExport', () => {
  return {
    DialogBackupExport: ({ mnemonic, children }: { mnemonic?: string | null; children?: React.ReactNode }) => (
      <div data-testid="dialog-export" data-mnemonic={mnemonic ?? ''}>
        {children || `Export ${mnemonic ? 'with mnemonic' : 'without mnemonic'}`}
      </div>
    ),
  };
});

vi.mock('@/organisms/DialogBackupPhrase/DialogBackupPhrase', () => {
  return {
    DialogBackupPhrase: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="dialog-backup-phrase">{children || 'Backup Phrase'}</div>
    ),
  };
});

describe('BackupMethodCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with default mnemonic', () => {
    mockUseOnboardingStore.mockReturnValue({
      mnemonic: '',
    });

    render(<BackupMethodCard />);

    expect(screen.getByTestId('content-card')).toBeInTheDocument();
    expect(screen.getByTestId('content-card')).toHaveClass('rounded-md');
    expect(screen.getByTestId('heading-2')).toHaveTextContent('Choose backup method');
    expect(screen.getByTestId('heading-2')).toHaveAttribute('data-size', 'md');
    expect(screen.getByTestId('heading-2')).toHaveClass('font-bold');
  });

  it('renders with mnemonic from store', () => {
    const testMnemonic = 'wood fox silver drive march fee palace flame earn door case almost';
    mockUseOnboardingStore.mockReturnValue({
      mnemonic: testMnemonic,
    });

    render(<BackupMethodCard />);

    expect(screen.getByTestId('content-card')).toBeInTheDocument();
    expect(screen.getByTestId('heading-2')).toHaveTextContent('Choose backup method');
  });

  it('renders all backup options', () => {
    mockUseOnboardingStore.mockReturnValue({
      mnemonic: 'test mnemonic',
    });

    render(<BackupMethodCard />);

    expect(screen.getByTestId('dialog-backup-phrase')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-backup-encrypted')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-export')).toBeInTheDocument();

    const buttons = screen.getAllByTestId('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Recovery phrase',
      'Encrypted file',
      'Export to Pubky Ring',
    ]);
    expect(buttons[0]).toHaveAttribute('id', 'backup-recovery-phrase-btn');
    expect(buttons[0]).toHaveAttribute('data-variant', 'secondary');
    expect(buttons[0].querySelector('.lucide-file-text')).toBeInTheDocument();
    expect(buttons[1]).toHaveAttribute('id', 'backup-encrypted-file-btn');
    expect(buttons[1]).toHaveAttribute('data-variant', 'secondary');
    expect(buttons[1].querySelector('.lucide-file-down')).toBeInTheDocument();
    expect(buttons[2]).toHaveAttribute('id', 'backup-pubky-ring-btn');
    expect(buttons[2]).not.toHaveAttribute('data-variant');
    expect(buttons[2].querySelector('.lucide-scan')).toBeInTheDocument();
  });

  it('uses the mobile stack and preserves the desktop row layout', () => {
    mockUseOnboardingStore.mockReturnValue({ mnemonic: 'test mnemonic' });

    render(<BackupMethodCard />);

    const actionsContainer = screen
      .getAllByTestId('container')
      .find((container) => container.classList.contains('mt-6'));
    expect(actionsContainer).toHaveClass('flex-col', 'gap-3', 'lg:flex-row', 'lg:flex-wrap');

    screen.getAllByTestId('button').forEach((button) => {
      expect(button).toHaveClass('w-full', 'font-bold', 'lg:w-auto');
    });
  });

  it('renders content card with shield image', () => {
    mockUseOnboardingStore.mockReturnValue({
      mnemonic: '',
    });

    render(<BackupMethodCard />);

    const contentCard = screen.getByTestId('content-card');
    expect(contentCard).toHaveAttribute('data-image-src', '/images/shield.webp');
    expect(contentCard).toHaveAttribute('data-image-alt', 'Shield');
  });

  it('passes mnemonic correctly to DialogBackupExport based on store state', () => {
    const testCases = [
      { mnemonic: null, expectedMnemonic: '' },
      { mnemonic: 'test phrase', expectedMnemonic: 'test phrase' },
      {
        mnemonic: 'wood fox silver drive march fee palace flame earn door case almost',
        expectedMnemonic: 'wood fox silver drive march fee palace flame earn door case almost',
      },
    ];

    testCases.forEach(({ mnemonic, expectedMnemonic }) => {
      mockUseOnboardingStore.mockReturnValue({ mnemonic });

      const { unmount } = render(<BackupMethodCard />);

      const dialogExport = screen.getByTestId('dialog-export');
      expect(dialogExport).toHaveAttribute('data-mnemonic', expectedMnemonic);
      expect(dialogExport).toHaveTextContent('Export to Pubky Ring');

      unmount();
    });
  });

  it('integrates correctly with onboarding store', () => {
    const testMnemonic = 'integration test mnemonic phrase';
    mockUseOnboardingStore.mockReturnValue({
      mnemonic: testMnemonic,
      secretKey: 'test-secret-key',
      hasHydrated: true,
    });

    render(<BackupMethodCard />);

    // Should call the store hook
    expect(mockUseOnboardingStore).toHaveBeenCalled();

    // Component should render with store data
    expect(screen.getByTestId('content-card')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-export')).toHaveAttribute('data-mnemonic', testMnemonic);
  });

  describe('organism behavior', () => {
    it('handles undefined mnemonic gracefully', () => {
      mockUseOnboardingStore.mockReturnValue({
        mnemonic: undefined,
      });

      render(<BackupMethodCard />);

      // Component should render without errors
      expect(screen.getByTestId('content-card')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-backup-phrase')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-backup-encrypted')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-export')).toBeInTheDocument();
    });

    it('maintains component structure regardless of store state', () => {
      const storeStates = [{ mnemonic: '' }, { mnemonic: 'test' }, { mnemonic: undefined }, { mnemonic: null }];

      storeStates.forEach((storeState) => {
        mockUseOnboardingStore.mockReturnValue(storeState);

        const { unmount } = render(<BackupMethodCard />);

        // All main components should always be present
        expect(screen.getByTestId('content-card')).toBeInTheDocument();
        expect(screen.getByTestId('heading-2')).toBeInTheDocument();
        expect(screen.getByTestId('popover-backup')).toBeInTheDocument();
        expect(screen.getByTestId('typography')).toBeInTheDocument();
        expect(screen.getByTestId('dialog-backup-phrase')).toBeInTheDocument();
        expect(screen.getByTestId('dialog-backup-encrypted')).toBeInTheDocument();
        expect(screen.getByTestId('dialog-export')).toBeInTheDocument();

        unmount();
      });
    });
  });
});

describe('BackupMethodCard - Snapshots', () => {
  it('matches snapshot for default BackupMethodCard', () => {
    mockUseOnboardingStore.mockReturnValue({
      mnemonic: '',
    });

    const { container } = render(<BackupMethodCard />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
