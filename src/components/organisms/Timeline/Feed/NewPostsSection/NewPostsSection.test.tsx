import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { useUnreadPosts } from '@/hooks/useUnreadPosts/useUnreadPosts';
import type { Pubky } from '@/models/models.types';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { NewPostsSection } from './NewPostsSection';

vi.mock('@/hooks/useIsScrolledFromTop/useIsScrolledFromTop', () => ({
  useIsScrolledFromTop: vi.fn(() => false),
}));

vi.mock('@/hooks/useUnreadPosts/useUnreadPosts', () => ({
  useUnreadPosts: vi.fn(() => ({ unreadPostIds: [], unreadCount: 0 })),
}));

const mockUseUnreadPosts = vi.mocked(useUnreadPosts);

vi.mock('@/molecules/NewPostsButton/NewPostsButton', () => {
  return {
    NewPostsButton: ({
      count,
      visible,
      onClick,
      isScrolled,
    }: {
      count: number;
      visible: boolean;
      onClick: () => void;
      isScrolled: boolean;
    }) =>
      visible ? (
        <button data-testid="new-posts-button" data-count={count} data-scrolled={isScrolled} onClick={onClick}>
          {count} new posts
        </button>
      ) : null,
  };
});

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: {
    markUnreadPostsAsRead: vi.fn(),
    filterDeletedPosts: vi.fn((ids: string[]) => Promise.resolve(ids)),
  },
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getDetailsByIds: vi.fn(),
  },
}));

const defaultProps = {
  streamId: 'timeline:all:all' as PostStreamId,
  variant: TIMELINE_FEED_VARIANT.HOME,
  postIds: ['post1', 'post2'],
  mutedUserIdSet: new Set<Pubky>(),
  mutedUsersLoading: false,
  loading: false,
  prependPosts: vi.fn(),
};

describe('NewPostsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: [], unreadCount: 0 });
    vi.mocked(PostController.getDetailsByIds).mockResolvedValue([{ kind: 'short' } as never]);
    window.scrollTo = vi.fn();
  });

  it('renders nothing when there are no new posts', () => {
    const { container } = render(<NewPostsSection {...defaultProps} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the new posts button when there are unread posts', () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['new1', 'new2'], unreadCount: 2 });
    render(<NewPostsSection {...defaultProps} />);
    expect(screen.getByTestId('new-posts-button')).toBeInTheDocument();
    expect(screen.getByTestId('new-posts-button')).toHaveAttribute('data-count', '2');
  });

  it('does not show button for already-displayed posts', () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['post1'], unreadCount: 1 });
    render(<NewPostsSection {...defaultProps} />);
    expect(screen.queryByTestId('new-posts-button')).not.toBeInTheDocument();
  });

  it('hides the button while loading', () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['new1'], unreadCount: 1 });
    render(<NewPostsSection {...defaultProps} loading={true} />);
    expect(screen.queryByTestId('new-posts-button')).not.toBeInTheDocument();
  });

  it('waits for the mute list before showing an eligible unread post', () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['author:new-post'], unreadCount: 1 });
    const { rerender } = render(<NewPostsSection {...defaultProps} mutedUsersLoading={true} />);

    expect(screen.queryByTestId('new-posts-button')).not.toBeInTheDocument();

    rerender(<NewPostsSection {...defaultProps} mutedUsersLoading={false} />);
    expect(screen.getByTestId('new-posts-button')).toHaveAttribute('data-count', '1');
  });

  it('filters muted users from new post count', () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['author:new-post', 'muted-user:new-post'], unreadCount: 2 });
    render(<NewPostsSection {...defaultProps} mutedUserIdSet={new Set(['muted-user'])} />);
    expect(screen.getByTestId('new-posts-button')).toHaveAttribute('data-count', '1');
  });

  it('keeps a muted author hidden when the mute list finishes loading', () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['muted-user:new-post'], unreadCount: 1 });
    const { rerender } = render(<NewPostsSection {...defaultProps} mutedUsersLoading={true} />);
    expect(screen.queryByTestId('new-posts-button')).not.toBeInTheDocument();

    rerender(<NewPostsSection {...defaultProps} mutedUserIdSet={new Set(['muted-user'])} />);
    expect(screen.queryByTestId('new-posts-button')).not.toBeInTheDocument();
  });

  it('excludes a known muted author without requiring local post details', () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['muted-user:new-post'], unreadCount: 1 });
    vi.mocked(PostController.getDetailsByIds).mockResolvedValue([]);
    render(<NewPostsSection {...defaultProps} mutedUserIdSet={new Set(['muted-user'])} />);

    expect(screen.queryByTestId('new-posts-button')).not.toBeInTheDocument();
    expect(PostController.getDetailsByIds).not.toHaveBeenCalled();
  });

  it.each([false, true])('ignores mute filtering and readiness on bookmarks (loading: %s)', (mutedUsersLoading) => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['muted-user:post-9'], unreadCount: 1 });

    render(
      <NewPostsSection
        {...defaultProps}
        variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
        streamId={'timeline:bookmarks:all' as PostStreamId}
        mutedUserIdSet={new Set<Pubky>(['muted-user' as Pubky])}
        mutedUsersLoading={mutedUsersLoading}
      />,
    );

    expect(screen.getByTestId('new-posts-button')).toHaveAttribute('data-count', '1');
  });

  it('calls stream controllers and prependPosts on click', async () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['new1'], unreadCount: 1 });
    const prependPosts = vi.fn();
    render(<NewPostsSection {...defaultProps} prependPosts={prependPosts} />);

    fireEvent.click(screen.getByTestId('new-posts-button'));

    await waitFor(() => {
      expect(StreamPostsController.markUnreadPostsAsRead).toHaveBeenCalledWith({
        streamId: 'timeline:all:all',
        postIds: ['new1'],
      });
      expect(prependPosts).toHaveBeenCalledWith(['new1']);
    });
  });

  it('prepends posts whose local details are not yet available', async () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['new1'], unreadCount: 1 });
    vi.mocked(PostController.getDetailsByIds).mockResolvedValue([undefined as never]);
    const prependPosts = vi.fn();

    render(<NewPostsSection {...defaultProps} prependPosts={prependPosts} />);

    fireEvent.click(screen.getByTestId('new-posts-button'));

    await waitFor(() => {
      expect(prependPosts).toHaveBeenCalledWith(['new1']);
    });
  });

  it('does not prepend posts whose kind does not match the stream content filter', async () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['new1'], unreadCount: 1 });
    vi.mocked(PostController.getDetailsByIds).mockResolvedValue([{ kind: 'short' } as never]);
    const prependPosts = vi.fn();

    render(
      <NewPostsSection
        {...defaultProps}
        streamId={'timeline:all:collection' as PostStreamId}
        prependPosts={prependPosts}
      />,
    );

    fireEvent.click(screen.getByTestId('new-posts-button'));

    await waitFor(() => {
      expect(PostController.getDetailsByIds).toHaveBeenCalledWith({ compositeIds: ['new1'] });
    });
    expect(prependPosts).not.toHaveBeenCalled();
  });

  it('does not prepend posts whose kind does not match a wot_domain stream kind', async () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['new1'], unreadCount: 1 });
    vi.mocked(PostController.getDetailsByIds).mockResolvedValue([{ kind: 'short' } as never]);
    const prependPosts = vi.fn();

    render(
      <NewPostsSection
        {...defaultProps}
        streamId={'timeline:wot_domain:2:image:bitcoin' as PostStreamId}
        prependPosts={prependPosts}
      />,
    );

    fireEvent.click(screen.getByTestId('new-posts-button'));

    await waitFor(() => {
      expect(PostController.getDetailsByIds).toHaveBeenCalledWith({ compositeIds: ['new1'] });
    });
    expect(prependPosts).not.toHaveBeenCalled();
  });

  it('scrolls to top after loading new posts', async () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['new1'], unreadCount: 1 });
    render(<NewPostsSection {...defaultProps} />);

    fireEvent.click(screen.getByTestId('new-posts-button'));

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });
  });
});

describe('NewPostsSection - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: [], unreadCount: 0 });
  });

  it('matches snapshot when hidden', () => {
    const { container } = render(<NewPostsSection {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with new posts visible', () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['new1', 'new2', 'new3'], unreadCount: 3 });
    const { container } = render(<NewPostsSection {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });
});
