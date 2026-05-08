import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MuteFilter } from '@/application/stream/posts/muting/mute-filter';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { useUnreadPosts } from '@/hooks/useUnreadPosts/useUnreadPosts';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { NewPostsSection } from './NewPostsSection';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

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

vi.mock('@/molecules/Toaster/showErrorToast', () => {
  return {
    showErrorToast: vi.fn(),
  };
});

vi.mock('@/application/stream/posts/muting/mute-filter', () => ({
  MuteFilter: {
    filterPostsSafe: vi.fn((ids: string[]) => ids),
  },
}));
vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: {
    mergeUnreadStreamWithPostStream: vi.fn(),
    clearUnreadStream: vi.fn(),
    filterDeletedPosts: vi.fn((ids: string[]) => Promise.resolve(ids)),
  },
}));

const defaultProps = {
  streamId: 'timeline:all:all' as PostStreamId,
  postIds: ['post1', 'post2'],
  mutedUserIdSet: new Set<string>(),
  loading: false,
  prependPosts: vi.fn(),
};

describe('NewPostsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: [], unreadCount: 0 });
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

  it('filters muted users from new post count', () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['new1', 'muted1'], unreadCount: 2 });
    vi.mocked(MuteFilter.filterPostsSafe).mockReturnValue(['new1']);
    render(<NewPostsSection {...defaultProps} />);
    expect(screen.getByTestId('new-posts-button')).toHaveAttribute('data-count', '1');
  });

  it('calls stream controllers and prependPosts on click', async () => {
    mockUseUnreadPosts.mockReturnValue({ unreadPostIds: ['new1'], unreadCount: 1 });
    const prependPosts = vi.fn();
    render(<NewPostsSection {...defaultProps} prependPosts={prependPosts} />);

    fireEvent.click(screen.getByTestId('new-posts-button'));

    await waitFor(() => {
      expect(StreamPostsController.mergeUnreadStreamWithPostStream).toHaveBeenCalledWith({
        streamId: 'timeline:all:all',
      });
      expect(StreamPostsController.clearUnreadStream).toHaveBeenCalledWith({
        streamId: 'timeline:all:all',
      });
      expect(prependPosts).toHaveBeenCalledWith(['new1']);
    });
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
    vi.mocked(MuteFilter.filterPostsSafe).mockImplementation((ids: string[]) => ids);
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
