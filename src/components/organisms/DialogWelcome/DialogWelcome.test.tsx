import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { DialogWelcome } from './DialogWelcome';

const { mockGetAvatarUrl, mockCopyToClipboard, mockSetShowWelcomeDialog } = vi.hoisted(() => ({
  mockGetAvatarUrl: vi.fn((pubky: string) => `https://mocked.avatar/${pubky}`),
  mockCopyToClipboard: vi.fn(),
  mockSetShowWelcomeDialog: vi.fn(),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    currentUserPubky: 'test-pubky-123',
  })),
}));
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: vi.fn(() => ({
    showWelcomeDialog: true,
    setShowWelcomeDialog: mockSetShowWelcomeDialog,
  })),
}));
vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: {
    read: vi.fn(() =>
      Promise.resolve({
        name: 'Test User',
        bio: 'Test bio',
        image: 'test-image.jpg',
      }),
    ),
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: mockGetAvatarUrl,
  },
}));

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => {
    // useLiveQuery returns the resolved value directly (not a Promise)
    // The callback is async, but useLiveQuery handles the async internally
    return {
      name: 'Test User',
      bio: 'Test bio',
      image: 'test-image.jpg',
      indexed_at: 1234567890,
    };
  }),
}));

// Mock hooks
vi.mock('@/hooks/useCopyToClipboard/useCopyToClipboard', () => ({
  useCopyToClipboard: vi.fn(() => ({
    copyToClipboard: mockCopyToClipboard,
  })),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="dialog" data-open={open} onClick={() => onOpenChange?.(false)}>
      {children}
    </div>
  ),
  DialogContent: ({
    children,
    className,
    hiddenTitle,
  }: {
    children: React.ReactNode;
    className?: string;
    hiddenTitle?: string;
  }) => (
    <div data-testid="dialog-content" className={className} data-hidden-title={hiddenTitle}>
      {children}
    </div>
  ),
  DialogHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-header" className={className}>
      {children}
    </div>
  ),
  DialogTitle: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <h2 data-testid="dialog-title" id={id}>
      {children}
    </h2>
  ),
  DialogDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-description" className={className}>
      {children}
    </div>
  ),
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
  Typography: ({
    children,
    className,
    size,
  }: {
    children: React.ReactNode;
    as?: React.ElementType;
    className?: string;
    size?: string;
  }) => {
    return (
      <p data-testid="typography" data-size={size} className={className}>
        {children}
      </p>
    );
  },
  Button: ({
    children,
    onClick,
    variant,
    className,
    size,
    id,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    className?: string;
    size?: string;
    id?: string;
  }) => (
    <button
      data-testid={variant === 'secondary' ? 'button-secondary' : 'button-primary'}
      onClick={onClick}
      data-variant={variant}
      className={className}
      data-size={size}
      id={id}
    >
      {children}
    </button>
  ),
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

// Mock organisms
vi.mock('@/organisms', () => ({
  AvatarWithFallback: ({
    avatarUrl,
    name,
    className,
    fallbackClassName,
  }: {
    avatarUrl?: string;
    name?: string;
    className?: string;
    fallbackClassName?: string;
  }) => (
    <div
      data-testid="avatar-with-fallback"
      data-avatar-url={avatarUrl}
      data-name={name}
      className={className}
      data-fallback-class={fallbackClassName}
    />
  ),
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  toast: vi.fn(() => ({
    dismiss: vi.fn(),
  })),
}));

describe('DialogWelcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with user data from hooks', () => {
    render(<DialogWelcome />);

    const dialog = screen.getByTestId('dialog');
    const content = screen.getByTestId('dialog-content');
    const header = screen.getByTestId('dialog-header');
    const title = screen.getByTestId('dialog-title');

    expect(dialog).toBeInTheDocument();
    expect(content).toBeInTheDocument();
    expect(header).toBeInTheDocument();
    expect(title).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('Test bio')).toBeInTheDocument();
  });

  it('calls setShowWelcomeDialog when explore button is clicked', () => {
    render(<DialogWelcome />);

    const exploreButton = screen.getByText('Explore Pubky');
    fireEvent.click(exploreButton);

    expect(mockSetShowWelcomeDialog).toHaveBeenCalledWith(false);
  });

  it('calls copyToClipboard when copy button is clicked', () => {
    render(<DialogWelcome />);

    const copyButton = screen.getByTestId('button-secondary');
    fireEvent.click(copyButton);

    expect(mockCopyToClipboard).toHaveBeenCalledWith('pubkytest-pubky-123');
  });

  it('uses generated avatar url when user has image', () => {
    render(<DialogWelcome />);
    expect(mockGetAvatarUrl).toHaveBeenCalledWith('test-pubky-123', 1234567890);
  });

  it('does not generate avatar url when user has no image', () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      name: 'Test User',
      bio: 'Test bio',
      image: null,
      indexed_at: 1234567890,
    });

    mockGetAvatarUrl.mockClear();
    render(<DialogWelcome />);

    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });
});

describe('DialogWelcome - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLiveQuery).mockReturnValue({
      name: 'Test User',
      bio: 'Test bio',
      image: 'test-image.jpg',
      indexed_at: 1234567890,
    });
  });

  it('matches snapshot for default DialogWelcome', () => {
    const { container } = render(<DialogWelcome />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when user has no image', () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      name: 'Test User',
      bio: 'Test bio',
      image: null,
      indexed_at: 1234567890,
    });

    const { container } = render(<DialogWelcome />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
