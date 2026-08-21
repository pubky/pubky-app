import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { PostHeader } from './PostHeader';

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/hooks/useUserDetails/useUserDetails', () => ({
  useUserDetails: vi.fn(),
}));

vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({
  useAvatarUrl: vi.fn(),
}));

vi.mock('@/hooks/useRelativeTime/useRelativeTime', () => ({
  useRelativeTime: vi.fn(() => ({
    formatRelativeTime: vi.fn(() => '2h'),
  })),
}));

const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: vi.fn(
      ({
        children,
        className,
        overrideDefaults: _overrideDefaults,
      }: {
        children: React.ReactNode;
        className?: string;
        overrideDefaults?: boolean;
      }) => (
        <div data-testid="container" className={className}>
          {children}
        </div>
      ),
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
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

vi.mock('@/molecules/PostHeaderTimestamp/PostHeaderTimestamp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules/PostHeaderTimestamp/PostHeaderTimestamp')>();
  return actual;
});

vi.mock('@/molecules/PostHeaderUserInfo/PostHeaderUserInfo', () => {
  return {
    PostHeaderUserInfo: vi.fn(
      ({
        userId,
        userName,
        status,
        size,
        timeAgo,
        showUserInfo = true,
        visuallyHideAvatar = false,
        characterLimitPlacement,
        characterLimit,
      }: {
        userId: string;
        userName: string;
        status?: string | null;
        size?: 'normal' | 'large' | 'extraLarge';
        timeAgo?: string | null;
        showUserInfo?: boolean;
        visuallyHideAvatar?: boolean;
        characterLimitPlacement?: string;
        characterLimit?: { count: number; max: number };
      }) => (
        <div
          data-testid="post-header-user-info"
          data-status={status || undefined}
          data-size={size}
          data-show-user-info={showUserInfo}
          data-visually-hide-avatar={visuallyHideAvatar || undefined}
          data-character-limit-placement={characterLimitPlacement}
        >
          <div data-testid="avatar" />
          {showUserInfo && (
            <>
              <div>{userName}</div>
              <div>@{userId.substring(0, 8)}</div>
            </>
          )}
          {characterLimit && (
            <div>
              {characterLimit.count}/{characterLimit.max}
            </div>
          )}
          {timeAgo && <div data-testid="bottom-left-time">{timeAgo}</div>}
        </div>
      ),
    ),
  };
});

// Use real libs - use actual implementations

const mockUsePostDetails = vi.mocked(usePostDetails);
const mockUseUserDetails = vi.mocked(useUserDetails);
const mockUseAvatarUrl = vi.mocked(useAvatarUrl);

function renderPostHeader(ui: ReactElement) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

describe('PostHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it('shows skeleton when details are unavailable', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({ userDetails: null, isLoading: false });
    mockUseAvatarUrl.mockReturnValue(undefined);

    renderPostHeader(<PostHeader postId="user123:post456" />);
    expect(screen.getAllByRole('generic').some((el) => el.getAttribute('data-slot') === 'skeleton')).toBe(true);
  });

  it('shows skeleton (never author info) when the post is deleted', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: {
        id: 'userpubkykey:post456',
        indexed_at: Date.now(),
        kind: 'short' as const,
        uri: 'pubky://userpubkykey/pub/pubky.app/posts/post456',
        content: '[DELETED]',
        attachments: null,
        is_moderated: false,
        is_blurred: false,
      } as EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    renderPostHeader(<PostHeader postId="userpubkykey:post456" />);

    // Parents render the deleted state from their own query instance, which can
    // resolve later — author info must never appear for a deleted post.
    expect(screen.queryByText('Test User')).not.toBeInTheDocument();
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
      } as EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: {
        id: 'userpubkykey',
        name: 'Test User',
        image: 'test-image-id',
        status: 'vacationing',
      } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    renderPostHeader(<PostHeader postId="userpubkykey:post456" />);

    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByTestId('post-header-user-info')).toHaveAttribute('data-status', 'vacationing');
    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('renders a real post when the author profile query settles without details', () => {
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
      } as EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({ userDetails: null, isLoading: false });
    mockUseAvatarUrl.mockReturnValue(undefined);

    renderPostHeader(<PostHeader postId="userpubkykey:post456" />);

    expect(screen.getAllByRole('generic').some((el) => el.getAttribute('data-slot') === 'skeleton')).toBe(false);
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('hides time when isReplyInput is true', () => {
    // When isReplyInput is true, postDetails is not fetched
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    const { container } = renderPostHeader(<PostHeader postId="userpubkykey:post456" isReplyInput={true} />);

    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    // Verify that time section is not rendered
    expect(container.querySelector('.lucide-clock')).not.toBeInTheDocument();
  });

  it('shows skeleton while user details are still loading and isReplyInput is true', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({ userDetails: null, isLoading: true });
    mockUseAvatarUrl.mockReturnValue(undefined);

    renderPostHeader(<PostHeader postId="userpubkykey:post456" isReplyInput={true} />);

    expect(screen.getAllByRole('generic').some((el) => el.getAttribute('data-slot') === 'skeleton')).toBe(true);
  });

  it('shows only the avatar skeleton when user info is hidden', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({ userDetails: null, isLoading: true });
    mockUseAvatarUrl.mockReturnValue(undefined);

    const { container } = renderPostHeader(
      <PostHeader postId="userpubkykey" isReplyInput={true} showUserInfo={false} />,
    );

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons).toHaveLength(1);
    expect(skeletons[0]).toHaveClass('size-10', 'rounded-full');
  });

  it('keeps an avatar-sized invisible spacer skeleton when the avatar is visually hidden', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({ userDetails: null, isLoading: true });
    mockUseAvatarUrl.mockReturnValue(undefined);

    const { container } = renderPostHeader(
      <PostHeader
        postId="userpubkykey"
        isReplyInput={true}
        showUserInfo={false}
        visuallyHideAvatar={true}
        size="extraLarge"
      />,
    );

    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).toHaveClass('size-16', 'invisible');
  });

  it('renders provided user details without showing a remount skeleton', () => {
    const providedUserDetails = {
      id: 'userpubkykey',
      name: 'Provided User',
      image: null,
      bio: '',
      links: null,
      status: null,
      indexed_at: Date.now(),
    } as NexusUserDetails;
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({ userDetails: undefined, isLoading: true });
    mockUseAvatarUrl.mockReturnValue(undefined);

    renderPostHeader(<PostHeader postId="userpubkykey" isReplyInput={true} userDetails={providedUserDetails} />);

    expect(screen.getAllByRole('generic').some((el) => el.getAttribute('data-slot') === 'skeleton')).toBe(false);
    expect(screen.getByText('Provided User')).toBeInTheDocument();
    expect(mockUseUserDetails).toHaveBeenCalledWith(null);
    expect(mockUseAvatarUrl).toHaveBeenCalledWith(providedUserDetails);
  });

  it('falls back to querying user details when provided user details are null', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({ userDetails: null, isLoading: true });
    mockUseAvatarUrl.mockReturnValue(undefined);

    renderPostHeader(<PostHeader postId="userpubkykey" isReplyInput={true} userDetails={null} />);

    expect(screen.getAllByRole('generic').some((element) => element.getAttribute('data-slot') === 'skeleton')).toBe(
      true,
    );
    expect(mockUseUserDetails).toHaveBeenCalledWith('userpubkykey');
    expect(mockUseAvatarUrl).toHaveBeenCalledWith(null);
  });

  it('renders the header and character counter when the profile query settles without details', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({ userDetails: null, isLoading: false });
    mockUseAvatarUrl.mockReturnValue(undefined);

    renderPostHeader(
      <PostHeader postId="userpubkykey" isReplyInput={true} characterLimit={{ count: 12, max: 2000 }} />,
    );

    expect(screen.getAllByRole('generic').some((el) => el.getAttribute('data-slot') === 'skeleton')).toBe(false);
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    expect(screen.getByText('12/2000')).toBeInTheDocument();
  });

  it('passes showUserInfo to PostHeaderUserInfo', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    renderPostHeader(<PostHeader postId="userpubkykey" isReplyInput={true} showUserInfo={false} />);

    expect(screen.getByTestId('post-header-user-info')).toHaveAttribute('data-show-user-info', 'false');
    expect(screen.queryByText('Test User')).not.toBeInTheDocument();
  });

  it('passes visuallyHideAvatar to PostHeaderUserInfo', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    renderPostHeader(<PostHeader postId="userpubkykey" isReplyInput={true} visuallyHideAvatar={true} />);

    expect(screen.getByTestId('post-header-user-info')).toHaveAttribute('data-visually-hide-avatar', 'true');
  });

  it('passes the character limit placement to PostHeaderUserInfo', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    renderPostHeader(
      <PostHeader
        postId="userpubkykey"
        isReplyInput={true}
        characterLimit={{ count: 21, max: 2000 }}
        characterLimitPlacement="name-row"
      />,
    );

    expect(screen.getByTestId('post-header-user-info')).toHaveAttribute('data-character-limit-placement', 'name-row');
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
      } as EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    renderPostHeader(<PostHeader postId="userpubkykey:post456" size="large" />);

    expect(screen.getByTestId('post-header-user-info')).toHaveAttribute('data-size', 'large');
  });

  it('constrains the user info slot so long names can truncate', () => {
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
      } as EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: {
        id: 'userpubkykey',
        name: 'ThisNameIsLongEnoughToOverflowTheReplyDialogWithoutAConstrainedHeaderSlot',
        image: 'test-image-id',
      } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    renderPostHeader(<PostHeader postId="userpubkykey:post456" />);

    const userInfoSlot = screen.getByTestId('post-header-user-info').parentElement;

    expect(userInfoSlot).toHaveClass('w-full', 'max-w-full', 'min-w-0');
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
      } as EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    renderPostHeader(<PostHeader postId="userpubkykey:post456" />);

    expect(screen.getByText('2h')).toBeInTheDocument();
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
      } as EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    renderPostHeader(<PostHeader postId="userpubkykey:post456" timeAgoPlacement="bottom-left" />);

    expect(screen.getAllByText('2h')).toHaveLength(1);
    expect(screen.getByTestId('bottom-left-time')).toHaveTextContent('2h');
  });

  it('renders characterLimit in the top-right instead of timestamp', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({
      userDetails: { id: 'userpubkykey', name: 'Test User', image: 'test-image-id' } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/userpubkykey.png');

    renderPostHeader(
      <PostHeader postId="userpubkykey" isReplyInput={true} characterLimit={{ count: 21, max: 2000 }} />,
    );

    expect(screen.getByText('21/2000')).toBeInTheDocument();
    expect(screen.queryByText('2h')).not.toBeInTheDocument();
  });
});

describe('PostHeader - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
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
      } as EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: {
        id: 'snapshotUserKey',
        name: 'Snapshot User',
        image: 'snapshot-image-id',
      } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/snapshotUserKey.png');

    const { container } = renderPostHeader(<PostHeader postId="snapshotUserKey:post789" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in loading state', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });
    mockUseUserDetails.mockReturnValue({ userDetails: null, isLoading: false });
    mockUseAvatarUrl.mockReturnValue(undefined);

    const { container } = renderPostHeader(<PostHeader postId="user123:post456" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('PostHeader - Mobile Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(true);
    setMobileViewport();
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
      } as EnrichedPostDetails,
      isLoading: false,
    });
    mockUseUserDetails.mockReturnValue({
      userDetails: {
        id: 'snapshotUserKey',
        name: 'Snapshot User',
        image: 'snapshot-image-id',
      } as NexusUserDetails,
      isLoading: false,
    });
    mockUseAvatarUrl.mockReturnValue('https://example.com/avatar/snapshotUserKey.png');
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = renderPostHeader(<PostHeader postId="snapshotUserKey:post789" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
