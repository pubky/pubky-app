import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostHeaderUserInfo } from './PostHeaderUserInfo';
import * as Libs from '@/libs';

const { mockUserInfoPopover } = vi.hoisted(() => ({
  mockUserInfoPopover: vi.fn(
    ({
      children,
      userName,
      formattedPublicKey,
      sideOffset = 1,
    }: {
      children: React.ReactNode;
      userName: string;
      formattedPublicKey: string;
      sideOffset?: number;
    }) => (
      <div data-testid="popover" data-hover="true">
        <div data-testid="popover-trigger" data-as-child="true">
          {children}
        </div>
        <div data-testid="popover-content" data-side-offset={sideOffset}>
          <div data-testid="popover-inner-content">
            <div data-testid="avatar" />
            <div>{userName}</div>
            <div>@{formattedPublicKey}</div>
          </div>
        </div>
      </div>
    ),
  ),
}));

// Mock hooks
const mockUseUserProfile = vi.fn();
const mockUseIsFollowing = vi.fn();
const mockUseFollowUser = vi.fn();
const mockUseAuthStore = vi.fn();
const mockUseProfileStats = vi.fn();
const mockUseProfileConnections = vi.fn();
const mockUseCurrentUserProfile = vi.fn();

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useUserProfile: () => mockUseUserProfile(),
    useIsFollowing: () => mockUseIsFollowing(),
    useFollowUser: () => mockUseFollowUser(),
    useProfileStats: () => mockUseProfileStats(),
    useProfileConnections: () => mockUseProfileConnections(),
    useCurrentUserProfile: () => mockUseCurrentUserProfile(),
    CONNECTION_TYPE: {
      FOLLOWERS: 'followers',
      FOLLOWING: 'following',
      FRIENDS: 'friends',
    },
  };
});

vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    useAuthStore: () => mockUseAuthStore(),
  };
});

// Mock atoms
vi.mock('@/atoms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/atoms')>();
  const React = await import('react');
  return {
    ...actual,
    Popover: ({ children, hover }: { children: React.ReactNode; hover?: boolean }) => (
      <div data-testid="popover" data-hover={hover}>
        {children}
      </div>
    ),
    PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
      <div data-testid="popover-trigger" data-as-child={asChild}>
        {children}
      </div>
    ),
    PopoverContent: ({
      children,
      className,
      side,
      sideOffset,
    }: {
      children: React.ReactNode;
      className?: string;
      side?: string;
      sideOffset?: number;
    }) => (
      <div data-testid="popover-content" className={className} data-side={side} data-side-offset={sideOffset}>
        {children}
      </div>
    ),
    Container: React.forwardRef<
      HTMLDivElement,
      {
        children: React.ReactNode;
        className?: string;
        overrideDefaults?: boolean;
      }
    >(function MockContainer({ children, className, overrideDefaults }, ref) {
      return (
        <div ref={ref} data-testid="container" className={className} data-override-defaults={overrideDefaults}>
          {children}
        </div>
      );
    }),
    Typography: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <p data-testid="typography" className={className}>
        {children}
      </p>
    ),
    Link: ({
      children,
      href,
      onClick,
      className,
    }: {
      children: React.ReactNode;
      href: string;
      onClick?: (e: React.MouseEvent) => void;
      className?: string;
    }) => (
      <a data-testid="profile-link" href={href} onClick={onClick} className={className}>
        {children}
      </a>
    ),
    Button: ({
      children,
      variant,
      size,
      className,
      onClick,
      disabled,
      'aria-label': ariaLabel,
    }: {
      children: React.ReactNode;
      variant?: string;
      size?: string;
      className?: string;
      onClick?: (e: React.MouseEvent) => void;
      disabled?: boolean;
      'aria-label'?: string;
    }) => (
      <button
        data-testid="button"
        data-variant={variant}
        data-size={size}
        className={className}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    ),
  };
});

// Mock organisms
vi.mock('@/organisms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/organisms')>();
  return {
    ...actual,
    AvatarWithFallback: ({ avatarUrl, name, size }: { avatarUrl?: string; name: string; size?: string }) => (
      <div data-testid="avatar" data-size={size}>
        {avatarUrl ? <img data-testid="avatar-image" src={avatarUrl} alt={name} /> : null}
        <div data-testid="avatar-fallback">{name.substring(0, 2).toUpperCase()}</div>
      </div>
    ),
  };
});

// Mock molecules
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    UserInfoPopover: (props: React.ComponentProps<typeof actual.UserInfoPopover>) => mockUserInfoPopover(props),
    PostHeaderTimestamp: ({ timeAgo }: { timeAgo: string; indexedAt: Date }) => (
      <span data-testid="post-header-timestamp">{timeAgo}</span>
    ),
  };
});

// Mock libs
vi.mock('@/libs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs')>();
  const { DEFAULT_DISPLAY_PUBLIC_KEY_LENGTH } = await import('@/config');
  return {
    ...actual,
    cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
    formatPublicKey: vi.fn(({ key, length = DEFAULT_DISPLAY_PUBLIC_KEY_LENGTH }) => key?.substring(0, length) || ''),
  };
});

describe('PostHeaderUserInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockUseAuthStore.mockReturnValue({ currentUserPubky: 'currentUser123' });
    mockUseCurrentUserProfile.mockReturnValue({ currentUserPubky: 'currentUser123' });
    mockUseUserProfile.mockReturnValue({
      profile: {
        name: 'Test User',
        bio: '',
        avatarUrl: 'https://example.com/avatar.png',
        publicKey: 'pk:user123',
      },
      isLoading: false,
    });
    mockUseIsFollowing.mockReturnValue({
      isFollowing: false,
      isLoading: false,
    });
    mockUseFollowUser.mockReturnValue({
      toggleFollow: vi.fn(),
      isUserLoading: vi.fn(() => false),
    });
    mockUseProfileStats.mockReturnValue({
      stats: {
        followers: 0,
        following: 0,
        posts: 0,
        replies: 0,
        friends: 0,
        uniqueTags: 0,
        notifications: 0,
      },
      isLoading: false,
    });
    mockUseProfileConnections.mockReturnValue({
      connections: [],
      count: 0,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: vi.fn(),
    });
  });

  it('renders user name and public key', () => {
    render(<PostHeaderUserInfo userId="userpubkykey" userName="Test User" />);

    expect(screen.getByTestId('popover')).toBeInTheDocument();
    expect(screen.getByTestId('popover-trigger')).toBeInTheDocument();
    const avatars = screen.getAllByTestId('avatar');
    expect(avatars.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Test User').length).toBeGreaterThan(0);
    // formatPublicKey returns first 8 chars, so "userpubk"
    expect(screen.getAllByText(/@userpubk/).length).toBeGreaterThan(0);
  });

  it('renders avatar with image when avatarUrl is provided', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" avatarUrl="https://example.com/avatar.png" />);

    const avatarImages = screen.getAllByTestId('avatar-image');
    expect(avatarImages.length).toBeGreaterThan(0);
    expect(avatarImages[0]).toHaveAttribute('src', 'https://example.com/avatar.png');
    expect(avatarImages[0]).toHaveAttribute('alt', 'Test User');
  });

  it('renders character limit when provided', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" characterLimit={{ count: 50, max: 280 }} />);

    expect(screen.getByText('50/280')).toBeInTheDocument();
  });

  it('does not render character limit when not provided', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" />);

    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
  });

  it('formats public key correctly', () => {
    const formatSpy = vi.spyOn(Libs, 'formatPublicKey');
    formatSpy.mockReturnValue('userpubk');

    render(<PostHeaderUserInfo userId="userpubkykey" userName="Test User" />);

    expect(formatSpy).toHaveBeenCalledWith({ key: 'userpubkykey' });
    expect(screen.getAllByText('@userpubk').length).toBeGreaterThan(0);

    formatSpy.mockRestore();
  });

  it('renders popover content with user info', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" />);

    const content = screen.getByTestId('popover-content');
    expect(content).toBeInTheDocument();
    expect(content).toHaveAttribute('data-side-offset', '1');
  });
  // Popover content details (bio/follow actions) are covered by UserInfoPopover + hooks tests.

  it('renders without popover when showPopover is false', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" showPopover={false} />);

    expect(screen.queryByTestId('popover')).not.toBeInTheDocument();
    expect(screen.queryByTestId('popover-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('popover-content')).not.toBeInTheDocument();
    const avatars = screen.getAllByTestId('avatar');
    expect(avatars.length).toBeGreaterThan(0);
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('renders with popover when showPopover is true', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" showPopover={true} />);

    expect(screen.getByTestId('popover')).toBeInTheDocument();
    expect(screen.getByTestId('popover-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('popover-content')).toBeInTheDocument();
  });

  it('renders with popover by default when showPopover is not provided', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" />);

    expect(screen.getByTestId('popover')).toBeInTheDocument();
    expect(screen.getByTestId('popover-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('popover-content')).toBeInTheDocument();
  });

  it('does not pass stable placement config', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" />);

    const popoverProps = mockUserInfoPopover.mock.calls.at(-1)?.[0];
    expect(popoverProps).not.toHaveProperty('stablePlacement');
  });

  it('renders with normal size by default', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" />);

    const avatar = screen.getAllByTestId('avatar')[0];
    expect(avatar).toHaveAttribute('data-size', 'default');
  });

  it('renders with large size when size prop is "large"', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" size="large" />);

    const avatar = screen.getAllByTestId('avatar')[0];
    expect(avatar).toHaveAttribute('data-size', 'xl');
  });

  it('renders timeAgo when provided', () => {
    render(
      <PostHeaderUserInfo
        userId="user123"
        userName="Test User"
        timeAgo="2h ago"
        indexedAt={new Date('2025-01-15T10:00:00Z')}
      />,
    );

    expect(screen.getByTestId('post-header-timestamp')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });

  it('does not render timeAgo when not provided', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" />);

    expect(screen.queryByTestId('post-header-timestamp')).not.toBeInTheDocument();
  });

  it('does not render timeAgo when null', () => {
    render(<PostHeaderUserInfo userId="user123" userName="Test User" timeAgo={null} />);

    expect(screen.queryByTestId('post-header-timestamp')).not.toBeInTheDocument();
  });
});

describe('PostHeaderUserInfo - Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue({ currentUserPubky: 'currentUser123' });
    mockUseCurrentUserProfile.mockReturnValue({ currentUserPubky: 'currentUser123' });
    mockUseUserProfile.mockReturnValue({
      profile: { name: 'Test User', bio: '', avatarUrl: undefined, publicKey: 'pk:user123' },
      isLoading: false,
    });
    mockUseIsFollowing.mockReturnValue({ isFollowing: false, isLoading: false });
    mockUseFollowUser.mockReturnValue({ toggleFollow: vi.fn(), isUserLoading: vi.fn(() => false) });
    mockUseProfileStats.mockReturnValue({
      stats: { followers: 0, following: 0, posts: 0, replies: 0, friends: 0, uniqueTags: 0, notifications: 0 },
      isLoading: false,
    });
    mockUseProfileConnections.mockReturnValue({
      connections: [],
      count: 0,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: vi.fn(),
    });
  });

  it('renders profile links for avatar and username', () => {
    render(<PostHeaderUserInfo userId="testuser123" userName="Test User" />);

    const profileLinks = screen.getAllByTestId('profile-link');
    expect(profileLinks.length).toBe(2); // One for avatar, one for username

    // Both should link to the same profile
    profileLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/profile/testuser123');
    });
  });

  it('stops propagation when clicking on avatar link', () => {
    render(<PostHeaderUserInfo userId="testuser123" userName="Test User" />);

    const profileLinks = screen.getAllByTestId('profile-link');
    const avatarLink = profileLinks[0];

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');

    fireEvent(avatarLink, clickEvent);

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('stops propagation when clicking on username link', () => {
    render(<PostHeaderUserInfo userId="testuser123" userName="Test User" />);

    const profileLinks = screen.getAllByTestId('profile-link');
    const usernameLink = profileLinks[1];

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');

    fireEvent(usernameLink, clickEvent);

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('renders profile links when showPopover is false', () => {
    render(<PostHeaderUserInfo userId="testuser123" userName="Test User" showPopover={false} />);

    const profileLinks = screen.getAllByTestId('profile-link');
    expect(profileLinks.length).toBe(2);
    profileLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/profile/testuser123');
    });
  });

  it('does not underline the username on hover', () => {
    render(<PostHeaderUserInfo userId="testuser123" userName="Test User" showPopover={false} />);

    expect(screen.getByText('Test User')).not.toHaveClass('hover:underline');
  });
});

describe('PostHeaderUserInfo - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue({ currentUserPubky: 'currentUser123' });
    mockUseCurrentUserProfile.mockReturnValue({ currentUserPubky: 'currentUser123' });
    mockUseUserProfile.mockReturnValue({
      profile: {
        name: 'Test User',
        bio: '',
        avatarUrl: 'https://example.com/avatar.png',
        publicKey: 'pk:user123',
      },
      isLoading: false,
    });
    mockUseIsFollowing.mockReturnValue({
      isFollowing: false,
      isLoading: false,
    });
    mockUseFollowUser.mockReturnValue({
      toggleFollow: vi.fn(),
      isUserLoading: vi.fn(() => false),
    });
    mockUseProfileStats.mockReturnValue({
      stats: {
        followers: 0,
        following: 0,
        posts: 0,
        replies: 0,
        friends: 0,
        uniqueTags: 0,
        notifications: 0,
      },
      isLoading: false,
    });
    mockUseProfileConnections.mockReturnValue({
      connections: [],
      count: 0,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: vi.fn(),
    });
  });

  it('matches snapshot with all props', () => {
    const { container } = render(
      <PostHeaderUserInfo
        userId="snapshotUserKey"
        userName="Snapshot User"
        avatarUrl="https://example.com/avatar.png"
        characterLimit={{ count: 150, max: 280 }}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot without avatarUrl', () => {
    const { container } = render(
      <PostHeaderUserInfo userId="snapshotUserKey" userName="Snapshot User" characterLimit={{ count: 50, max: 280 }} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot without character count', () => {
    const { container } = render(
      <PostHeaderUserInfo
        userId="snapshotUserKey"
        userName="Snapshot User"
        avatarUrl="https://example.com/avatar.png"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with minimal props', () => {
    const { container } = render(<PostHeaderUserInfo userId="user123" userName="Test User" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with bio', () => {
    mockUseUserProfile.mockReturnValue({
      profile: {
        name: 'Snapshot User',
        bio: 'This is a snapshot bio',
        avatarUrl: undefined,
        publicKey: 'pk:snapshotUserKey',
      },
      isLoading: false,
    });

    const { container } = render(<PostHeaderUserInfo userId="snapshotUserKey" userName="Snapshot User" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for current user (no Follow button)', () => {
    mockUseAuthStore.mockReturnValue({ currentUserPubky: 'snapshotUserKey' });

    const { container } = render(<PostHeaderUserInfo userId="snapshotUserKey" userName="Snapshot User" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when following', () => {
    mockUseIsFollowing.mockReturnValue({
      isFollowing: true,
      isLoading: false,
    });

    const { container } = render(<PostHeaderUserInfo userId="otherUser123" userName="Other User" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with large size', () => {
    const { container } = render(<PostHeaderUserInfo userId="snapshotUserKey" userName="Snapshot User" size="large" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with timeAgo', () => {
    const { container } = render(
      <PostHeaderUserInfo
        userId="snapshotUserKey"
        userName="Snapshot User"
        timeAgo="5m ago"
        indexedAt={new Date('2025-03-01T12:00:00Z')}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with all new props', () => {
    const { container } = render(
      <PostHeaderUserInfo
        userId="snapshotUserKey"
        userName="Snapshot User"
        avatarUrl="https://example.com/avatar.png"
        size="large"
        timeAgo="1h ago"
        indexedAt={new Date('2025-03-01T13:00:00Z')}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
