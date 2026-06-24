import { render, screen } from '@testing-library/react';
import type { ReactNode, RefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { asOpaque } from '@/test-utils/type-assertions';
import { Collection } from './Collection';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/organisms/Collections/CollectionItems/CollectionItems', () => ({
  CollectionItems: (p: {
    authorPubky: string;
    postId: string;
    postDetails?: unknown;
    pullToRefreshContainerRef?: RefObject<HTMLElement | null>;
  }) => (
    <div
      data-testid="collection-items"
      data-author={p.authorPubky}
      data-post={p.postId}
      data-has-post-details={String(p.postDetails != null)}
      data-has-ptr-ref={String(Boolean(p.pullToRefreshContainerRef))}
    />
  ),
}));

vi.mock('@/organisms/Collections/CollectionNotFound/CollectionNotFound', () => ({
  CollectionNotFound: (p: { postId: string }) => <div data-testid="collection-not-found" data-post={p.postId} />,
}));

vi.mock('@/organisms/Collections/CollectionsSections/CollectionsSections', () => ({
  CollectionsSections: () => <div data-testid="collections-sections" />,
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: ReactNode }) => <div data-testid="content-layout">{children}</div>,
}));

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const AUTHOR_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const POST_ID = '0034BBBDFK83G';
const COMPOSITE = `${AUTHOR_PUBKY}:${POST_ID}`;

const COLLECTION_CONTENT = JSON.stringify({
  name: 'My Collection',
  description: 'desc',
  items: ['pubky://a/pub/pubky.app/posts/x'],
});

const mockUsePostDetails = vi.mocked(usePostDetails);

function setPostDetails(content: string | null | undefined, isLoading = false) {
  mockUsePostDetails.mockReturnValue({
    postDetails:
      content == null
        ? content
        : asOpaque<EnrichedPostDetails>({
            id: COMPOSITE,
            content,
            kind: 'collection',
            indexed_at: 0,
            uri: '',
            attachments: null,
            is_moderated: false,
            is_blurred: false,
          }),
    isLoading,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setPostDetails(COLLECTION_CONTENT);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Collection (template)', () => {
  it('renders the resolved items region + sections for a valid collection envelope', () => {
    setPostDetails(COLLECTION_CONTENT, false);

    render(<Collection postId={COMPOSITE} />);

    const items = screen.getByTestId('collection-items');
    expect(items).toHaveAttribute('data-author', AUTHOR_PUBKY);
    expect(items).toHaveAttribute('data-post', POST_ID);
    expect(items).toHaveAttribute('data-has-post-details', 'true');
    expect(items).toHaveAttribute('data-has-ptr-ref', 'true');
    expect(screen.getByTestId('collections-sections')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-not-found')).not.toBeInTheDocument();
  });

  it('renders the resolved branch (not the not-found state) while details are still loading', () => {
    setPostDetails(undefined, true);

    render(<Collection postId={COMPOSITE} />);

    const items = screen.getByTestId('collection-items');
    expect(items).toHaveAttribute('data-has-post-details', 'false');
    expect(screen.queryByTestId('collection-not-found')).not.toBeInTheDocument();
  });

  it('renders the not-found state (with sections, without items) when the post is missing', () => {
    setPostDetails(null, false);

    render(<Collection postId={COMPOSITE} />);

    const notFound = screen.getByTestId('collection-not-found');
    expect(notFound).toHaveAttribute('data-post', COMPOSITE);
    expect(screen.getByTestId('collections-sections')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-items')).not.toBeInTheDocument();
  });

  it('treats a deleted collection as not found', () => {
    setPostDetails('[DELETED]', false);

    render(<Collection postId={COMPOSITE} />);

    expect(screen.getByTestId('collection-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-items')).not.toBeInTheDocument();
  });

  it('treats an invalid composite as not found and disables the post details query', () => {
    setPostDetails(undefined, false);

    render(<Collection postId="garbage" />);

    expect(screen.getByTestId('collection-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-items')).not.toBeInTheDocument();
    expect(mockUsePostDetails).toHaveBeenCalledWith('garbage', { enabled: false });
  });

  it('matches the snapshot for the resolved collection state', () => {
    setPostDetails(COLLECTION_CONTENT, false);

    const { container } = render(<Collection postId={COMPOSITE} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
