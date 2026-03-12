import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as Core from '@/core';
import { NewPostsSection } from './NewPostsSection';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/hooks/useIsScrolledFromTop', () => ({
  useIsScrolledFromTop: vi.fn(() => false),
}));

vi.mock('@/molecules', () => ({
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
  showErrorToast: vi.fn(),
}));

vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    MuteFilter: {
      ...actual.MuteFilter,
      filterPostsSafe: vi.fn((ids: string[]) => ids),
    },
    StreamPostsController: {
      mergeUnreadStreamWithPostStream: vi.fn(),
      clearUnreadStream: vi.fn(),
      filterDeletedPosts: vi.fn((ids: string[]) => Promise.resolve(ids)),
    },
  };
});

const defaultProps = {
  streamId: 'timeline:all:all' as Core.PostStreamId,
  unreadPostIds: [] as string[],
  postIds: ['post1', 'post2'],
  mutedUserIdSet: new Set<string>(),
  loading: false,
  prependPosts: vi.fn(),
};

describe('NewPostsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  it('renders nothing when there are no new posts', () => {
    const { container } = render(<NewPostsSection {...defaultProps} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the new posts button when there are unread posts', () => {
    render(<NewPostsSection {...defaultProps} unreadPostIds={['new1', 'new2']} />);
    expect(screen.getByTestId('new-posts-button')).toBeInTheDocument();
    expect(screen.getByTestId('new-posts-button')).toHaveAttribute('data-count', '2');
  });

  it('does not show button for already-displayed posts', () => {
    render(<NewPostsSection {...defaultProps} unreadPostIds={['post1']} />);
    expect(screen.queryByTestId('new-posts-button')).not.toBeInTheDocument();
  });

  it('hides the button while loading', () => {
    render(<NewPostsSection {...defaultProps} unreadPostIds={['new1']} loading={true} />);
    expect(screen.queryByTestId('new-posts-button')).not.toBeInTheDocument();
  });

  it('filters muted users from new post count', () => {
    vi.mocked(Core.MuteFilter.filterPostsSafe).mockReturnValue(['new1']);
    render(<NewPostsSection {...defaultProps} unreadPostIds={['new1', 'muted1']} />);
    expect(screen.getByTestId('new-posts-button')).toHaveAttribute('data-count', '1');
  });

  it('calls stream controllers and prependPosts on click', async () => {
    const prependPosts = vi.fn();
    render(<NewPostsSection {...defaultProps} unreadPostIds={['new1']} prependPosts={prependPosts} />);

    fireEvent.click(screen.getByTestId('new-posts-button'));

    await waitFor(() => {
      expect(Core.StreamPostsController.mergeUnreadStreamWithPostStream).toHaveBeenCalledWith({
        streamId: 'timeline:all:all',
      });
      expect(Core.StreamPostsController.clearUnreadStream).toHaveBeenCalledWith({
        streamId: 'timeline:all:all',
      });
      expect(prependPosts).toHaveBeenCalledWith(['new1']);
    });
  });

  it('scrolls to top after loading new posts', async () => {
    render(<NewPostsSection {...defaultProps} unreadPostIds={['new1']} />);

    fireEvent.click(screen.getByTestId('new-posts-button'));

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });
  });
});

describe('NewPostsSection - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Core.MuteFilter.filterPostsSafe).mockImplementation((ids: string[]) => ids);
  });

  it('matches snapshot when hidden', () => {
    const { container } = render(<NewPostsSection {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with new posts visible', () => {
    const { container } = render(<NewPostsSection {...defaultProps} unreadPostIds={['new1', 'new2', 'new3']} />);
    expect(container).toMatchSnapshot();
  });
});
