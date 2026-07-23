import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { TimelineFeedItem } from './TimelineFeedItem';

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      overrideDefaults: _overrideDefaults,
      ...props
    }: {
      children?: React.ReactNode;
      overrideDefaults?: boolean;
      [key: string]: unknown;
    }) => (
      <div data-testid="container" {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/organisms/PostMain/PostMain', () => {
  return {
    PostMain: ({ postId, isReply }: { postId: string; isReply: boolean }) => (
      <div data-testid={`post-${postId}`} data-is-reply={String(isReply)} />
    ),
  };
});

vi.mock('@/organisms/Timeline/PostReplies/PostReplies', () => {
  return {
    TimelinePostReplies: ({ postId }: { postId: string }) => <div data-testid={`replies-${postId}`} />,
  };
});

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard', () => {
  return {
    CollectionCard: ({
      authorPubky,
      postId,
      showDeleteAction,
    }: {
      authorPubky: string;
      postId: string;
      showDeleteAction?: boolean;
    }) => (
      <div
        data-testid="collection-card"
        data-author-pubky={authorPubky}
        data-post-id={postId}
        data-show-delete-action={String(showDeleteAction ?? false)}
      />
    ),
  };
});

const mockUsePostDetails = vi.mocked(usePostDetails);

function createMockPostDetails(overrides: Partial<EnrichedPostDetails> = {}): EnrichedPostDetails {
  return {
    id: 'author:post123',
    indexed_at: Date.now(),
    kind: 'short',
    uri: 'pubky://author/pub/pubky.app/posts/post123',
    content: 'Hello',
    attachments: null,
    is_moderated: false,
    is_blurred: false,
    ...overrides,
  };
}

describe('TimelineFeedItem', () => {
  const mockPostId = 'author:post123';
  const mockSetCardRef = vi.fn(() => vi.fn());
  const mockOnPostKeyDown = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails(),
      isLoading: false,
    });
  });

  it('renders post main and replies for non-collection posts', () => {
    render(
      <TimelineFeedItem
        postId={mockPostId}
        index={0}
        totalCount={3}
        setCardRef={mockSetCardRef}
        onPostKeyDown={mockOnPostKeyDown}
      />,
    );

    expect(screen.getByTestId(`post-${mockPostId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`post-${mockPostId}`)).toHaveAttribute('data-is-reply', 'false');
    expect(screen.getByTestId(`replies-${mockPostId}`)).toBeInTheDocument();
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
  });

  it('renders standalone CollectionCard without replies for collection posts', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({
        kind: 'collection',
        content: '{"name":"My Collection","items":[]}',
      }),
      isLoading: false,
    });

    render(
      <TimelineFeedItem
        postId="author-pubky:collection-id"
        index={0}
        totalCount={3}
        setCardRef={mockSetCardRef}
        onPostKeyDown={mockOnPostKeyDown}
      />,
    );

    const collectionCard = screen.getByTestId('collection-card');
    expect(collectionCard).toBeInTheDocument();
    expect(collectionCard).toHaveAttribute('data-author-pubky', 'author-pubky');
    expect(collectionCard).toHaveAttribute('data-post-id', 'collection-id');
    expect(collectionCard).toHaveAttribute('data-show-delete-action', 'false');
    expect(screen.queryByTestId('post-author-pubky:collection-id')).not.toBeInTheDocument();
    expect(screen.queryByTestId('replies-author-pubky:collection-id')).not.toBeInTheDocument();
  });

  it('renders PostMain while post details are loading', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: undefined,
      isLoading: true,
    });

    render(
      <TimelineFeedItem
        postId={mockPostId}
        index={0}
        totalCount={3}
        setCardRef={mockSetCardRef}
        onPostKeyDown={mockOnPostKeyDown}
      />,
    );

    expect(screen.getByTestId(`post-${mockPostId}`)).toBeInTheDocument();
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId(`replies-${mockPostId}`)).not.toBeInTheDocument();
  });

  it('renders an accessible article with feed position metadata', () => {
    render(
      <TimelineFeedItem
        postId={mockPostId}
        index={1}
        totalCount={5}
        setCardRef={mockSetCardRef}
        onPostKeyDown={mockOnPostKeyDown}
      />,
    );

    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('data-cy', 'post-card');
    expect(article).toHaveAttribute('aria-posinset', '2');
    expect(article).toHaveAttribute('aria-setsize', '5');
    expect(article).toHaveAttribute('tabindex', '0');
  });

  it('registers the card ref for keyboard navigation', () => {
    render(
      <TimelineFeedItem
        postId={mockPostId}
        index={2}
        totalCount={3}
        setCardRef={mockSetCardRef}
        onPostKeyDown={mockOnPostKeyDown}
      />,
    );

    expect(mockSetCardRef).toHaveBeenCalledWith(2);
  });

  it('forwards keyboard events to the post navigation handler', () => {
    render(
      <TimelineFeedItem
        postId={mockPostId}
        index={0}
        totalCount={3}
        setCardRef={mockSetCardRef}
        onPostKeyDown={mockOnPostKeyDown}
      />,
    );

    fireEvent.keyDown(screen.getByRole('article'), { key: 'Enter' });

    expect(mockOnPostKeyDown).toHaveBeenCalledWith(mockPostId, expect.objectContaining({ key: 'Enter' }));
  });
});

describe('TimelineFeedItem - Snapshots', () => {
  const mockSetCardRef = vi.fn(() => vi.fn());
  const mockOnPostKeyDown = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails(),
      isLoading: false,
    });
  });

  it('matches snapshot for a regular timeline feed item', () => {
    const { container } = render(
      <TimelineFeedItem
        postId="author:post123"
        index={0}
        totalCount={3}
        setCardRef={mockSetCardRef}
        onPostKeyDown={mockOnPostKeyDown}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for a collection timeline feed item', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({
        id: 'author-pubky:collection-id',
        kind: 'collection',
        content: '{"name":"My Collection","items":[]}',
      }),
      isLoading: false,
    });

    const { container } = render(
      <TimelineFeedItem
        postId="author-pubky:collection-id"
        index={0}
        totalCount={3}
        setCardRef={mockSetCardRef}
        onPostKeyDown={mockOnPostKeyDown}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
