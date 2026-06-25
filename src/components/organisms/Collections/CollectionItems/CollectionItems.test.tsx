import { createRef, type ReactNode, type RefObject } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
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

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) => mockUseAuthStore(selector),
}));

vi.mock('@/organisms/Collections/CollectionHero/CollectionHero', () => ({
  CollectionHero: ({
    authorPubky,
    postId,
    postDetails,
  }: {
    authorPubky: string;
    postId: string;
    postDetails?: EnrichedPostDetails | null;
  }) => (
    <div
      data-testid="collection-hero"
      data-author-pubky={authorPubky}
      data-post-id={postId}
      data-has-post-details={String(postDetails != null)}
    />
  ),
}));

vi.mock('@/organisms/AddContentDialog/AddContentDialog', () => ({
  AddContentDialog: ({ dataCy, triggerVariant }: { dataCy?: string; triggerVariant?: string }) => (
    <div data-testid="add-content-dialog" data-cy={dataCy} data-trigger-variant={triggerVariant ?? 'hero'} />
  ),
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: (props: {
    variant: string;
    children?: ReactNode;
    emptyState?: ReactNode;
    pullToRefreshContainerRef?: RefObject<HTMLElement | null>;
    gridTrailingSlot?: ReactNode;
  }) => {
    const { variant, children, emptyState, pullToRefreshContainerRef, gridTrailingSlot } = props;
    mockTimelineFeedProps({ pullToRefreshContainerRef, gridTrailingSlot });

    return (
      <div
        data-testid="timeline-feed"
        data-variant={variant}
        data-has-empty-state={String(Boolean(emptyState))}
        data-has-grid-trailing-slot={String(Boolean(gridTrailingSlot))}
      >
        {children}
        {gridTrailingSlot}
      </div>
    );
  },
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

function buildPostDetails(content: string): EnrichedPostDetails {
  return asOpaque<EnrichedPostDetails>({
    id: COMPOSITE_ID,
    content,
    kind: 'collection',
    indexed_at: 0,
    uri: '',
    attachments: null,
    is_moderated: false,
    is_blurred: false,
  });
}

function setAuthStore(currentUserPubky: string | null) {
  mockUseAuthStore.mockImplementation((selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky }),
  );
}

function renderCollectionItems({
  postDetails = buildPostDetails(COLLECTION_CONTENT),
  pullToRefreshContainerRef,
}: {
  postDetails?: EnrichedPostDetails | null;
  pullToRefreshContainerRef?: RefObject<HTMLElement | null>;
} = {}) {
  return render(
    <CollectionItems
      authorPubky={AUTHOR_PUBKY}
      postId={POST_ID}
      postDetails={postDetails}
      pullToRefreshContainerRef={pullToRefreshContainerRef}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTimelineFeedProps.mockClear();
  setAuthStore(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionItems', () => {
  it('renders the COLLECTION TimelineFeed for a non-empty envelope with the hero inside the feed', () => {
    renderCollectionItems();

    const feed = screen.getByTestId('timeline-feed');
    expect(feed).toHaveAttribute('data-variant', 'collection');
    expect(feed).toHaveAttribute('data-has-empty-state', 'true');
    expect(screen.getByTestId('collection-hero')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-items-empty')).not.toBeInTheDocument();
  });

  it('passes postDetails through to CollectionHero', () => {
    renderCollectionItems();

    expect(screen.getByTestId('collection-hero')).toHaveAttribute('data-has-post-details', 'true');
  });

  it('passes the page-level pull-to-refresh ref to the timeline feed', () => {
    const pullToRefreshContainerRef = createRef<HTMLElement>();

    renderCollectionItems({ pullToRefreshContainerRef });

    expect(mockTimelineFeedProps).toHaveBeenCalledWith({ pullToRefreshContainerRef });
  });

  it('renders the feed for an owner non-empty envelope with the hero inside the feed', () => {
    setAuthStore(AUTHOR_PUBKY);

    renderCollectionItems();

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'collection');
    expect(screen.getByTestId('collection-hero')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-items-empty')).not.toBeInTheDocument();
  });

  it('renders the feed (never the empty state) while the envelope is still loading', () => {
    renderCollectionItems({ postDetails: undefined });

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'collection');
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-empty-state', 'true');
    expect(screen.queryByTestId('collection-items-empty')).not.toBeInTheDocument();
  });

  it('renders the feed and passes empty state for an empty envelope owned by the viewer', () => {
    setAuthStore(AUTHOR_PUBKY);

    renderCollectionItems({ postDetails: buildPostDetails(COLLECTION_CONTENT_EMPTY) });

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'collection');
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-empty-state', 'true');
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-grid-trailing-slot', 'true');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-cy', 'collection-add-content-grid');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-trigger-variant', 'grid');
  });

  it('does not pass a grid trailing slot for non-owner collections', () => {
    setAuthStore('some-other-user');

    renderCollectionItems();

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-grid-trailing-slot', 'false');
    expect(screen.queryByTestId('add-content-dialog')).not.toBeInTheDocument();
  });

  it('renders plain empty text with the hero outside the feed for an empty envelope viewed by a non-owner', () => {
    setAuthStore('some-other-user');

    renderCollectionItems({ postDetails: buildPostDetails(COLLECTION_CONTENT_EMPTY) });

    expect(screen.getByTestId('collection-hero')).toBeInTheDocument();
    expect(screen.getByText('collections.single.empty')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
  });
});

describe('CollectionItems - Snapshots', () => {
  it('matches the owner non-empty snapshot', () => {
    setAuthStore(AUTHOR_PUBKY);

    const { container } = renderCollectionItems();

    expect(container.firstChild).toMatchSnapshot();
  });
});
