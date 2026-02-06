import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupedRepostHeader } from './GroupedRepostHeader';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      you: 'You',
      youAndOthersReposted: `${params?.name} and ${params?.count} others reposted this`,
      mobileReposted: `${params?.name}, others reposted`,
      singleReposted: `${params?.name} reposted`,
      reposters: 'Reposters',
    };
    return translations[key] || key;
  },
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({
    children,
    className,
    overrideDefaults,
    'data-testid': dataTestId,
  }: {
    children: React.ReactNode;
    className?: string;
    overrideDefaults?: boolean;
    'data-testid'?: string;
  }) => (
    <div data-testid={dataTestId ?? 'container'} className={className} data-override-defaults={overrideDefaults}>
      {children}
    </div>
  ),
  Typography: ({
    children,
    className,
    'data-testid': dataTestId,
  }: {
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
  }) => (
    <span data-testid={dataTestId ?? 'typography'} className={className}>
      {children}
    </span>
  ),
  Button: ({
    children,
    className,
    onClick,
    overrideDefaults,
    'data-testid': dataTestId,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
    overrideDefaults?: boolean;
    'data-testid'?: string;
    'aria-label'?: string;
  }) => (
    <button
      data-testid={dataTestId ?? 'button'}
      className={className}
      onClick={onClick}
      data-override-defaults={overrideDefaults}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  ),
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  AvatarGroup: ({
    items,
    totalCount,
    maxAvatars,
  }: {
    items: Array<{ id: string; name?: string; avatarUrl?: string }>;
    totalCount: number;
    maxAvatars?: number;
  }) => (
    <div data-testid="avatar-group" data-items={items.length} data-total={totalCount} data-max={maxAvatars}>
      Avatar Group ({items.length} avatars)
    </div>
  ),
}));

// Mock RepostersOverlay
vi.mock('./RepostersOverlay', () => ({
  RepostersOverlay: ({
    variant,
    open,
    reposters,
  }: {
    variant: 'dialog' | 'sheet';
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reposters: Array<{ id: string }>;
  }) => (
    <div data-testid="reposters-overlay" data-variant={variant} data-open={open} data-count={reposters.length}>
      RepostersOverlay ({variant})
    </div>
  ),
}));

// Mock libs
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    Repeat: ({ className }: { className?: string }) => <span data-testid="repeat-icon" className={className} />,
    Clock: ({ className }: { className?: string }) => <span data-testid="clock-icon" className={className} />,
    formatPublicKey: ({ key }: { key: string }) => key.substring(0, 8) + '...',
    cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
  };
});

// Mock hooks
const mockProfile = { name: 'Alice' };
const mockUsers = [
  { id: 'user1', name: 'Alice', avatarUrl: 'https://example.com/alice.jpg' },
  { id: 'user2', name: 'Bob', avatarUrl: 'https://example.com/bob.jpg' },
  { id: 'user3', name: 'Charlie', avatarUrl: 'https://example.com/charlie.jpg' },
];

vi.mock('@/hooks', () => ({
  useUserProfile: vi.fn(() => ({
    profile: mockProfile,
    isLoading: false,
  })),
  useUserDetailsFromIds: vi.fn(() => ({
    users: mockUsers,
    isLoading: false,
  })),
  useRelativeTime: vi.fn(() => ({
    formatRelativeTime: () => '2h',
  })),
  useIsMobile: vi.fn(() => false),
}));

describe('GroupedRepostHeader', () => {
  const defaultProps = {
    reposterIds: ['user1', 'user2', 'user3'],
    includesCurrentUser: false,
    earliestTimestamp: Date.now() - 2 * 60 * 60 * 1000,
    isExpanded: false,
    onExpandToggle: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the header with repeat icon', () => {
    render(<GroupedRepostHeader {...defaultProps} />);

    expect(screen.getByTestId('grouped-repost-header')).toBeInTheDocument();
    expect(screen.getByTestId('repeat-icon')).toBeInTheDocument();
  });

  it('shows first reposter name and others count', () => {
    render(<GroupedRepostHeader {...defaultProps} />);

    const header = screen.getByTestId('grouped-repost-header');
    expect(header).toHaveTextContent('Alice');
    expect(header).toHaveTextContent('2 others');
    expect(header).toHaveTextContent('reposted');
  });

  it('shows "You" when current user has reposted', () => {
    render(<GroupedRepostHeader {...defaultProps} includesCurrentUser={true} />);

    const header = screen.getByTestId('grouped-repost-header');
    expect(header).toHaveTextContent('You');
    expect(header).toHaveTextContent('2 others');
  });

  it('renders AvatarGroup for desktop with maxAvatars=4', () => {
    render(<GroupedRepostHeader {...defaultProps} />);

    const avatarGroup = screen.getByTestId('avatar-group');
    expect(avatarGroup).toBeInTheDocument();
    expect(avatarGroup).toHaveAttribute('data-max', '4');
  });

  it('calls onExpandToggle when clicking avatar group button', () => {
    const onExpandToggle = vi.fn();
    render(<GroupedRepostHeader {...defaultProps} onExpandToggle={onExpandToggle} />);

    fireEvent.click(screen.getByTestId('grouped-repost-avatars'));
    expect(onExpandToggle).toHaveBeenCalledTimes(1);
  });

  it('renders RepostersOverlay with dialog variant for desktop', () => {
    render(<GroupedRepostHeader {...defaultProps} />);

    const overlay = screen.getByTestId('reposters-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveAttribute('data-variant', 'dialog');
  });

  it('passes isExpanded to RepostersOverlay', () => {
    const { rerender } = render(<GroupedRepostHeader {...defaultProps} isExpanded={false} />);

    expect(screen.getByTestId('reposters-overlay')).toHaveAttribute('data-open', 'false');

    rerender(<GroupedRepostHeader {...defaultProps} isExpanded={true} />);
    expect(screen.getByTestId('reposters-overlay')).toHaveAttribute('data-open', 'true');
  });

  it('renders timestamp', () => {
    render(<GroupedRepostHeader {...defaultProps} />);

    expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    expect(screen.getByTestId('grouped-repost-header')).toHaveTextContent('2h');
  });

  it('shows single reposter format when only one reposter', () => {
    render(<GroupedRepostHeader {...defaultProps} reposterIds={['user1']} />);

    expect(screen.getByTestId('grouped-repost-text')).toHaveTextContent('Alice reposted');
  });
});

describe('GroupedRepostHeader - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot with multiple reposters collapsed', () => {
    const { container } = render(
      <GroupedRepostHeader
        reposterIds={['user1', 'user2', 'user3']}
        includesCurrentUser={false}
        earliestTimestamp={Date.now() - 2 * 60 * 60 * 1000}
        isExpanded={false}
        onExpandToggle={vi.fn()}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple reposters expanded', () => {
    const { container } = render(
      <GroupedRepostHeader
        reposterIds={['user1', 'user2', 'user3']}
        includesCurrentUser={false}
        earliestTimestamp={Date.now() - 2 * 60 * 60 * 1000}
        isExpanded={true}
        onExpandToggle={vi.fn()}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with single reposter', () => {
    const { container } = render(
      <GroupedRepostHeader
        reposterIds={['user1']}
        includesCurrentUser={false}
        earliestTimestamp={Date.now() - 2 * 60 * 60 * 1000}
        isExpanded={false}
        onExpandToggle={vi.fn()}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with current user included', () => {
    const { container } = render(
      <GroupedRepostHeader
        reposterIds={['user1', 'user2']}
        includesCurrentUser={true}
        earliestTimestamp={Date.now() - 2 * 60 * 60 * 1000}
        isExpanded={false}
        onExpandToggle={vi.fn()}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
