import { createRef, type ReactNode, type RefObject } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { asOpaque } from '@/test-utils/type-assertions';
import { CollectionItems } from './CollectionItems';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuthStore = vi.fn();
const mockTimelineFeedProps = vi.hoisted(() => vi.fn());

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) => mockUseAuthStore(selector),
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: (props: {
    variant: string;
    children?: ReactNode;
    emptyState?: ReactNode;
    pullToRefreshContainerRef?: RefObject<HTMLElement | null>;
  }) => {
    const { variant, children, emptyState, pullToRefreshContainerRef } = props;
    mockTimelineFeedProps({ pullToRefreshContainerRef });

    return (
      <div data-testid="timeline-feed" data-variant={variant} data-has-empty-state={String(Boolean(emptyState))}>
        {children}
      </div>
    );
  },
  useTimelineFeedContext: () => null,
}));

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const AUTHOR_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const POST_ID = '0034BBBDFK83G';
const COMPOSITE_ID = `${AUTHOR_PUBKY}:${POST_ID}`;

const COLLECTION_CONTENT = JSON.stringify({
  name: 'Based Bitcoin',
  description: 'A bit of Bitcoin purity amidst all of the madness.',
  items: ['pubky://author/pub/pubky.app/posts/a', 'pubky://author/pub/pubky.app/posts/b'],
});

const COLLECTION_CONTENT_EMPTY = JSON.stringify({
  name: 'Quiet collection',
  description: null,
  items: [],
});

const mockUsePostDetails = vi.mocked(usePostDetails);

function setAuthStore(currentUserPubky: string | null) {
  mockUseAuthStore.mockImplementation((selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky }),
  );
}

function setPostDetails(content: string | null) {
  mockUsePostDetails.mockReturnValue({
    postDetails: content
      ? asOpaque<EnrichedPostDetails>({
          id: COMPOSITE_ID,
          content,
          kind: 'collection',
          indexed_at: 0,
          uri: '',
          attachments: null,
          is_moderated: false,
          is_blurred: false,
        })
      : null,
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTimelineFeedProps.mockClear();
  setAuthStore(null);
  setPostDetails(COLLECTION_CONTENT);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionItems', () => {
  it('renders the COLLECTION TimelineFeed for a non-empty envelope with the collection empty state', () => {
    setPostDetails(COLLECTION_CONTENT);

    render(<CollectionItems authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    const feed = screen.getByTestId('timeline-feed');
    expect(feed).toHaveAttribute('data-variant', 'collection');
    expect(feed).toHaveAttribute('data-has-empty-state', 'true');
    expect(screen.queryByLabelText('collections.single.addContent')).not.toBeInTheDocument();
    expect(screen.queryByTestId('collection-items-empty')).not.toBeInTheDocument();
  });

  it('passes the page-level pull-to-refresh ref to the timeline feed', () => {
    setPostDetails(COLLECTION_CONTENT);
    const pullToRefreshContainerRef = createRef<HTMLElement>();

    render(
      <CollectionItems
        authorPubky={AUTHOR_PUBKY}
        postId={POST_ID}
        pullToRefreshContainerRef={pullToRefreshContainerRef}
      />,
    );

    expect(mockTimelineFeedProps).toHaveBeenCalledWith({ pullToRefreshContainerRef });
  });

  it('renders the owner Add Content CTA above the feed for a non-empty envelope', () => {
    setAuthStore(AUTHOR_PUBKY);
    setPostDetails(COLLECTION_CONTENT);

    render(<CollectionItems authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByLabelText('collections.single.addContent')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'collection');
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-empty-state', 'true');
    expect(screen.queryByTestId('collection-items-empty')).not.toBeInTheDocument();
  });

  it('renders the feed (never the empty state) while the envelope is still loading', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: undefined, isLoading: true });

    render(<CollectionItems authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'collection');
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-empty-state', 'true');
    expect(screen.queryByTestId('collection-items-empty')).not.toBeInTheDocument();
  });

  it('renders the owner Add Content CTA and passes empty state for an empty envelope owned by the viewer', () => {
    setAuthStore(AUTHOR_PUBKY);
    setPostDetails(COLLECTION_CONTENT_EMPTY);

    render(<CollectionItems authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByLabelText('collections.single.addContent')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'collection');
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-empty-state', 'true');
  });

  it('renders plain empty text (and no Add Content CTA) for an empty envelope viewed by a non-owner', () => {
    setAuthStore('some-other-user');
    setPostDetails(COLLECTION_CONTENT_EMPTY);

    render(<CollectionItems authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByText('collections.single.empty')).toBeInTheDocument();
    expect(screen.queryByLabelText('collections.single.addContent')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
  });
});

describe('CollectionItems - Snapshots', () => {
  it('matches the owner non-empty snapshot with Add Content CTA above the feed', () => {
    setAuthStore(AUTHOR_PUBKY);
    setPostDetails(COLLECTION_CONTENT);

    const { container } = render(<CollectionItems authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
