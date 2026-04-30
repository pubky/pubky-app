import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FollowerItem } from './FollowerItem';
import type { UserConnectionData } from '@/hooks/useProfileConnections/useProfileConnections.types';
import type { Pubky } from '@/models/models.types';
// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
  Typography: ({
    children,
    as: Tag = 'p',
    className,
  }: {
    children: React.ReactNode;
    as?: React.ElementType;
    className?: string;
  }) => (
    <Tag data-testid="typography" className={className}>
      {children}
    </Tag>
  ),
  Button: ({
    children,
    className,
    onClick,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    'aria-label'?: string;
  }) => (
    <button data-testid="button" className={className} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  Link: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a data-testid="link" href={href} className={className}>
      {children}
    </a>
  ),
  Tag: ({ name }: { name: string }) => <span data-testid="tag">{name}</span>,
}));

// Mock organisms
vi.mock('@/organisms', () => ({
  AvatarWithFallback: ({
    avatarUrl,
    name,
    size,
    className,
  }: {
    avatarUrl?: string;
    name: string;
    size?: string;
    className?: string;
  }) => (
    <div
      data-testid="avatar-with-fallback"
      data-name={name}
      data-avatar={avatarUrl}
      data-size={size}
      className={className}
    >
      {avatarUrl ? <img src={avatarUrl} alt={name} /> : <span>{name[0]}</span>}
    </div>
  ),
}));

// Mock dependencies
vi.mock('@/models/user/users.helpers', () => ({
  generateTestUserId: vi.fn((index: number) => `test-user-${index}`),
}));

// Shared mock follower for all tests
const mockFollower: UserConnectionData = {
  id: 'test-user-1' as Pubky,
  name: 'John Doe',
  bio: 'Test bio',
  image: null,
  status: 'active',
  links: null,
  indexed_at: 1704067200000,
  avatarUrl: 'https://example.com/avatar.png',
  tags: ['bitcoin', 'candid'],
  stats: {
    tags: 100,
    posts: 50,
  },
};

describe('FollowerItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders follower name', () => {
    render(<FollowerItem follower={mockFollower} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('renders formatted public key', () => {
    render(<FollowerItem follower={mockFollower} />);
    // formatPublicKey with length 8 formats "test-user-1" (11 chars) as "test...er-1"
    expect(screen.getByText(/test\.\.\.er-1/i)).toBeInTheDocument();
  });

  it('renders avatar with fallback', () => {
    render(<FollowerItem follower={mockFollower} />);
    const avatar = screen.getByTestId('avatar-with-fallback');
    expect(avatar).toHaveAttribute('data-name', 'John Doe');
  });

  it('renders stats', () => {
    render(<FollowerItem follower={mockFollower} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText(/Tags/i)).toBeInTheDocument();
    expect(screen.getByText(/Posts/i)).toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<FollowerItem follower={mockFollower} />);
    // Tags are hidden on mobile (lg:flex), so we check for the tags in the mobile section
    const tags = screen.getAllByTestId('tag');
    // Tags appear twice - once in desktop section (hidden) and once in mobile section
    expect(tags.length).toBeGreaterThanOrEqual(2);
    const bitcoinTags = screen.getAllByText('bitcoin');
    const candidTags = screen.getAllByText('candid');
    expect(bitcoinTags.length).toBeGreaterThan(0);
    expect(candidTags.length).toBeGreaterThan(0);
  });

  it('renders link to profile', () => {
    render(<FollowerItem follower={mockFollower} />);
    const link = screen.getByTestId('link');
    expect(link).toHaveAttribute('href', '/profile/test-user-1');
  });

  it('renders follow button when not following', () => {
    render(<FollowerItem follower={mockFollower} isFollowing={false} />);
    const buttons = screen.getAllByTestId('button');
    const followButton = buttons.find((btn) => btn.getAttribute('aria-label') === 'Follow');
    expect(followButton).toBeInTheDocument();
    expect(document.querySelectorAll('.lucide-user-round-plus').length).toBeGreaterThan(0);
  });

  it('renders unfollow button when following', () => {
    render(<FollowerItem follower={mockFollower} isFollowing={true} />);
    const buttons = screen.getAllByTestId('button');
    const unfollowButton = buttons.find((btn) => btn.getAttribute('aria-label') === 'Unfollow');
    expect(unfollowButton).toBeInTheDocument();
    expect(document.querySelectorAll('.lucide-check').length).toBeGreaterThan(0);
  });

  it('calls onFollow when button is clicked', () => {
    const onFollow = vi.fn();
    render(<FollowerItem follower={mockFollower} isFollowing={true} onFollow={onFollow} />);
    const buttons = screen.getAllByTestId('button');
    const followButton = buttons.find((btn) => btn.getAttribute('aria-label') === 'Unfollow');
    fireEvent.click(followButton!);
    expect(onFollow).toHaveBeenCalledWith('test-user-1', true);
  });

  it('handles follower without tags', () => {
    const followerWithoutTags = { ...mockFollower, tags: [] };
    render(<FollowerItem follower={followerWithoutTags} />);
    const tags = screen.queryAllByTestId('tag');
    expect(tags).toHaveLength(0);
  });

  it('handles follower without stats', () => {
    const followerWithoutStats = { ...mockFollower, stats: { tags: 0, posts: 0 } };
    render(<FollowerItem follower={followerWithoutStats} />);
    // Stats are always shown, even if 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(2); // Tags and Posts both show 0
  });

  it('limits tags to 3', () => {
    const followerWithManyTags = {
      ...mockFollower,
      tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
    };
    render(<FollowerItem follower={followerWithManyTags} />);
    const tags = screen.getAllByTestId('tag');
    // Tags appear twice (desktop and mobile), so we check that we have at most 6 (3 * 2)
    expect(tags.length).toBeLessThanOrEqual(6);
    // But each section should only show 3 tags
    const uniqueTags = new Set(tags.map((tag) => tag.textContent));
    expect(uniqueTags.size).toBeLessThanOrEqual(3);
  });
});

describe('FollowerItem - Snapshots', () => {
  it('matches snapshot when following', () => {
    const { container } = render(<FollowerItem follower={mockFollower} isFollowing={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when not following', () => {
    const { container } = render(<FollowerItem follower={mockFollower} isFollowing={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot without tags', () => {
    const followerWithoutTags = { ...mockFollower, tags: [] };
    const { container } = render(<FollowerItem follower={followerWithoutTags} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
