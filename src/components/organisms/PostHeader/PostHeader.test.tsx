import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostHeader } from './PostHeader';
import * as Hooks from '@/hooks';
import * as Core from '@/core';

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    usePostDetails: vi.fn(),
    useUserDetails: vi.fn(),
    useAvatarUrl: vi.fn(),
    useRelativeTime: vi.fn(() => ({
      formatRelativeTime: vi.fn(() => '2h'),
    })),
  };
});

vi.mock('@/atoms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/atoms')>();
  return {
    ...actual,
    Container: vi.fn(
      ({
        children,
        className,
        overrideDefaults,
      }: {
        children: React.ReactNode;
        className?: string;
        overrideDefaults?: boolean;
      }) => (
        <div data-testid="container" className={className} data-override-defaults={overrideDefaults}>
          {children}
        </div>
      ),
    ),
    Typography: vi.fn(
      ({
        children,
        as: Tag = 'p',
        size,
        className,
      }: {
        children: React.ReactNode;
        as?: React.ElementType;
        size?: string;
        className?: string;
      }) => (
        <Tag data-testid="typography" data-size={size} className={className}>
          {children}
        </Tag>
      ),
    ),
  };
});

vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    PostHeaderUserInfo: vi.fn(
      ({
        userId,
        userName,
        characterLimit,
        size,
        timeAgo,
      }: {
        userId: string;
        userName: string;
        characterLimit?: { count: number; max: number };
        size?: 'normal' | 'large';
        timeAgo?: string | null;
      }) => (
        <div data-testid="post-header-user-info" data-size={size}>
          <div data-testid="avatar" />
          <div>{userName}</div>
          <div>@{userId.substring(0, 8)}</div>
          {characterLimit && (
            <div>
              {characterLimit.count}/{characterLimit.max}
            </div>
          )}
          {timeAgo && <div data-testid="bottom-left-time">{timeAgo}</div>}
        </div>
      ),
    ),
    PostHeaderTimestamp: vi.fn(({ timeAgo }: { timeAgo: string; indexedAt: Date }) => (
      <div data-testid="post-header-timestamp">
        <svg data-testid="clock-icon" />
        <span>{timeAgo}</span>
      </div>
    )),
  };
});

// Use real libs - use actual implementations
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    extractInitials: vi.fn(({ name }) => name?.substring(0, 2).toUpperCase() || ''),
    formatPublicKey: vi.fn(({ key, length }) => key?.substring(0, length) || ''),
    Clock: vi.fn(({ className }: { className?: string }) => <svg data-testid="clock-icon" className={className} />),
  };
});

const mockUsePostDetails = vi.mocked(Hooks.usePostDetails);
const mockUseUserDetails = vi.mocked(Hooks.useUserDetails);
const mockUseAvatarUrl = vi.mocked(Hooks.useAvatarUrl);

describe('PostHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows skeleton when details are unavailable', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({ userDetails: null, isLoading: false });
    mockUseAvatarUrl.mockReturnValue(undefined);

    render(<PostHeader postId="user123:post456" />);
    expect(screen.getAllByRole('generic').some((el) => el.getAttribute('data-slot') === 'skeleton')).toBe(true);
  });

  it('renders user name, handle and time', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: {
        id: 'userpubkykey:post456',
        indexed_at: Date.now(),
        kind: 'short' as const,
        uri: 'pubky://userpubkykey/pub/pubky.app/posts/post456',
        content: '',
        attachments: null,
        is_moderated: false,
        is_blurred: false,
      } as Core.EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as Core.NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    render(<PostHeader postId="userpubkykey:post456" />);

    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('hides time when isReplyInput is true', () => {
    // When isReplyInput is true, postDetails is not fetched
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as Core.NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    const { container } = render(<PostHeader postId="userpubkykey:post456" isReplyInput={true} />);

    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    // Verify that time section is not rendered (no Clock icon)
    expect(container.querySelector('[data-testid="clock-icon"]')).not.toBeInTheDocument();
  });

  it('shows skeleton when user details are not available and isReplyInput is true', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({ userDetails: null, isLoading: false });
    mockUseAvatarUrl.mockReturnValue(undefined);

    render(<PostHeader postId="userpubkykey:post456" isReplyInput={true} />);

    expect(screen.getAllByRole('generic').some((el) => el.getAttribute('data-slot') === 'skeleton')).toBe(true);
  });

  it('passes size prop to PostHeaderUserInfo', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: {
        id: 'userpubkykey:post456',
        indexed_at: Date.now(),
        kind: 'short' as const,
        uri: 'pubky://userpubkykey/pub/pubky.app/posts/post456',
        content: '',
        attachments: null,
        is_moderated: false,
        is_blurred: false,
      } as Core.EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as Core.NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    render(<PostHeader postId="userpubkykey:post456" size="large" />);

    expect(screen.getByTestId('post-header-user-info')).toHaveAttribute('data-size', 'large');
  });

  it('renders time in top-right by default', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: {
        id: 'userpubkykey:post456',
        indexed_at: Date.now(),
        kind: 'short' as const,
        uri: 'pubky://userpubkykey/pub/pubky.app/posts/post456',
        content: '',
        attachments: null,
        is_moderated: false,
        is_blurred: false,
      } as Core.EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as Core.NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    render(<PostHeader postId="userpubkykey:post456" />);

    expect(screen.getByTestId('post-header-timestamp')).toBeInTheDocument();
    expect(screen.queryByTestId('bottom-left-time')).not.toBeInTheDocument();
  });

  it('renders time in bottom-left when timeAgoPlacement is bottom-left', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: {
        id: 'userpubkykey:post456',
        indexed_at: Date.now(),
        kind: 'short' as const,
        uri: 'pubky://userpubkykey/pub/pubky.app/posts/post456',
        content: '',
        attachments: null,
        is_moderated: false,
        is_blurred: false,
      } as Core.EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as Core.NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    render(<PostHeader postId="userpubkykey:post456" timeAgoPlacement="bottom-left" />);

    expect(screen.queryByTestId('post-header-timestamp')).not.toBeInTheDocument();
    expect(screen.getByTestId('bottom-left-time')).toHaveTextContent('2h');
  });
});

describe('PostHeader - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot in loaded state', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: {
        id: 'userpubkykey:post456',
        indexed_at: Date.now(),
        kind: 'short' as const,
        uri: 'pubky://userpubkykey/pub/pubky.app/posts/post456',
        content: '',
        attachments: null,
        is_moderated: false,
        is_blurred: false,
      } as Core.EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: {
        id: 'snapshotUserKey',
        name: 'Snapshot User',
        image: 'snapshot-image-id',
      } as Core.NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/snapshotUserKey.png');

    const { container } = render(<PostHeader postId="snapshotUserKey:post789" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in loading state', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({ userDetails: null, isLoading: false });
    mockUseAvatarUrl.mockReturnValue(undefined);

    const { container } = render(<PostHeader postId="user123:post456" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
