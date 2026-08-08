import { createRef, type ReactNode, type RefObject } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { COLLECTION_LAYOUT, type CollectionLayout } from '@/config/collections';
import { CollectionHeroSkeleton } from '@/organisms/Collections/CollectionHero/CollectionHero.skeleton';
import { LAYOUT, type LayoutType } from '@/stores/home/home.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { CollectionItems } from './CollectionItems';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuthStore = vi.fn();
const mockTimelineFeedProps = vi.hoisted(() => vi.fn());
const mockReorderState = vi.hoisted(() => ({
  isReorderMode: false,
  isSaving: false,
  draftEntries: [] as { uri: string; postId: string | null }[],
  enterReorder: vi.fn(),
  moveItem: vi.fn(),
  saveOrder: vi.fn().mockResolvedValue(undefined),
  cancelReorder: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) => mockUseAuthStore(selector),
}));

vi.mock('@/hooks/useReorderCollection/useReorderCollection', () => ({
  useReorderCollection: () => mockReorderState,
}));

vi.mock('@/organisms/Collections/CollectionReorderGrid/CollectionReorderGrid', () => ({
  CollectionReorderGrid: ({
    entries,
    disabled,
  }: {
    entries: { uri: string; postId: string | null }[];
    onMove: (activeUri: string, overUri: string) => void;
    disabled?: boolean;
  }) => (
    <div data-testid="collection-reorder-grid" data-entry-count={entries.length} data-disabled={String(!!disabled)} />
  ),
}));

vi.mock('@/organisms/Collections/CollectionHero/CollectionHero', () => ({
  CollectionHero: ({
    authorPubky,
    postId,
    postDetails,
    layout,
    onLayoutChange,
    reorder,
  }: {
    authorPubky: string;
    postId: string;
    postDetails?: EnrichedPostDetails | null;
    layout: CollectionLayout;
    onLayoutChange: (layout: CollectionLayout) => void;
    reorder?: { isActive: boolean };
  }) =>
    postDetails ? (
      <div
        data-testid="collection-hero"
        data-author-pubky={authorPubky}
        data-post-id={postId}
        data-has-post-details="true"
        data-layout={layout}
        data-has-reorder={String(Boolean(reorder))}
        data-reorder-active={String(reorder?.isActive ?? false)}
      >
        <button type="button" onClick={() => onLayoutChange(COLLECTION_LAYOUT.GRID)}>
          Switch to Grid
        </button>
      </div>
    ) : (
      <CollectionHeroSkeleton />
    ),
}));

vi.mock('@/organisms/Collections/DialogAddContent/DialogAddContent', () => ({
  DialogAddContent: ({ dataCy, triggerVariant }: { dataCy?: string; triggerVariant?: string }) => (
    <div data-testid="add-content-dialog" data-cy={dataCy} data-trigger-variant={triggerVariant ?? 'hero'} />
  ),
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: (props: {
    variant: string;
    children?: ReactNode;
    emptyState?: ReactNode;
    pullToRefreshContainerRef?: RefObject<HTMLElement | null>;
    trailingSlot?: ReactNode;
    requestedLayout?: LayoutType;
    visualHiddenItemsNotice?: ReactNode;
  }) => {
    const {
      variant,
      children,
      emptyState,
      pullToRefreshContainerRef,
      trailingSlot,
      requestedLayout,
      visualHiddenItemsNotice,
    } = props;
    mockTimelineFeedProps({ pullToRefreshContainerRef, trailingSlot, requestedLayout, visualHiddenItemsNotice });

    return (
      <div
        data-testid="timeline-feed"
        data-variant={variant}
        data-has-empty-state={String(Boolean(emptyState))}
        data-has-trailing-slot={String(Boolean(trailingSlot))}
        data-has-visual-hidden-items-notice={String(Boolean(visualHiddenItemsNotice))}
        data-requested-layout={requestedLayout}
      >
        {children}
        {visualHiddenItemsNotice}
        {trailingSlot}
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

function buildPostDetails(content: string, { isBlurred = false }: { isBlurred?: boolean } = {}): EnrichedPostDetails {
  return asOpaque<EnrichedPostDetails>({
    id: COMPOSITE_ID,
    content,
    kind: 'collection',
    indexed_at: 0,
    uri: '',
    attachments: null,
    is_moderated: isBlurred,
    is_blurred: isBlurred,
  });
}

function setAuthStore(currentUserPubky: string | null) {
  mockUseAuthStore.mockImplementation((selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky }),
  );
}

type RenderCollectionItemsOptions = {
  postDetails?: EnrichedPostDetails | null;
  pullToRefreshContainerRef?: RefObject<HTMLElement | null>;
};

function renderCollectionItems(options: RenderCollectionItemsOptions = {}) {
  const postDetails = 'postDetails' in options ? options.postDetails : buildPostDetails(COLLECTION_CONTENT);
  const { pullToRefreshContainerRef } = options;

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
  mockReorderState.isReorderMode = false;
  mockReorderState.isSaving = false;
  mockReorderState.draftEntries = [];
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

    expect(mockTimelineFeedProps).toHaveBeenCalledWith(expect.objectContaining({ pullToRefreshContainerRef }));
  });

  it('renders the feed for an owner non-empty envelope with the hero inside the feed', () => {
    setAuthStore(AUTHOR_PUBKY);

    renderCollectionItems();

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'collection');
    expect(screen.getByTestId('collection-hero')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-items-empty')).not.toBeInTheDocument();
  });

  it('uses the creator List default and lets the viewer override it locally', () => {
    renderCollectionItems({
      postDetails: buildPostDetails(
        JSON.stringify({
          name: 'Reading',
          items: ['pubky://author/pub/pubky.app/posts/a'],
          layout: COLLECTION_LAYOUT.LIST,
        }),
      ),
    });

    expect(screen.getByTestId('collection-hero')).toHaveAttribute('data-layout', COLLECTION_LAYOUT.LIST);
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-requested-layout', LAYOUT.LIST);

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Grid' }));

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-requested-layout', LAYOUT.COLUMNS);
  });

  it('provides the collection empty state and owner CTA for an empty List collection', () => {
    setAuthStore(AUTHOR_PUBKY);

    renderCollectionItems({
      postDetails: buildPostDetails(
        JSON.stringify({
          name: 'Reading',
          items: [],
          layout: COLLECTION_LAYOUT.LIST,
        }),
      ),
    });

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-requested-layout', LAYOUT.LIST);
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-empty-state', 'true');
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-trailing-slot', 'true');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-cy', 'collection-add-content-list');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-trigger-variant', 'list');
  });

  it('provides the owner CTA after posts in a populated List collection', () => {
    setAuthStore(AUTHOR_PUBKY);

    renderCollectionItems({
      postDetails: buildPostDetails(
        JSON.stringify({
          name: 'Reading',
          items: ['pubky://author/pub/pubky.app/posts/a'],
          layout: COLLECTION_LAYOUT.LIST,
        }),
      ),
    });

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-requested-layout', LAYOUT.LIST);
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-trailing-slot', 'true');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-cy', 'collection-add-content-list');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-trigger-variant', 'list');
  });

  it('provides the collection empty state and owner CTA for an empty Visual collection', () => {
    setAuthStore(AUTHOR_PUBKY);

    renderCollectionItems({
      postDetails: buildPostDetails(
        JSON.stringify({
          name: 'Reading',
          items: [],
          layout: COLLECTION_LAYOUT.VISUAL,
        }),
      ),
    });

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-requested-layout', LAYOUT.VISUAL);
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-empty-state', 'true');
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-trailing-slot', 'true');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-cy', 'collection-add-content-visual');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-trigger-variant', 'visual');
  });

  it('provides the owner CTA after posts in a populated Visual collection', () => {
    setAuthStore(AUTHOR_PUBKY);

    renderCollectionItems({
      postDetails: buildPostDetails(
        JSON.stringify({
          name: 'Reading',
          items: ['pubky://author/pub/pubky.app/posts/a'],
          layout: COLLECTION_LAYOUT.VISUAL,
        }),
      ),
    });

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-requested-layout', LAYOUT.VISUAL);
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-trailing-slot', 'true');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-cy', 'collection-add-content-visual');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-trigger-variant', 'visual');
  });

  it('passes the hidden-items notice to the feed regardless of the active layout', () => {
    renderCollectionItems();

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-requested-layout', LAYOUT.COLUMNS);
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-visual-hidden-items-notice', 'true');
    expect(screen.getByRole('status')).toHaveAttribute('data-cy', 'collection-hidden-items-notice');
  });

  it('renders only the hero skeleton while the envelope is still loading', () => {
    renderCollectionItems({ postDetails: undefined });

    expect(screen.getByTestId('collection-hero-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
    expect(mockTimelineFeedProps).not.toHaveBeenCalled();
  });

  it('mounts the feed directly in List layout once the envelope resolves', () => {
    const { rerender } = renderCollectionItems({ postDetails: undefined });
    const listPostDetails = buildPostDetails(
      JSON.stringify({
        name: 'Reading',
        items: ['pubky://author/pub/pubky.app/posts/a'],
        layout: COLLECTION_LAYOUT.LIST,
      }),
    );

    rerender(<CollectionItems authorPubky={AUTHOR_PUBKY} postId={POST_ID} postDetails={listPostDetails} />);

    expect(screen.queryByTestId('collection-hero-skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-requested-layout', LAYOUT.LIST);
    expect(mockTimelineFeedProps).toHaveBeenCalledTimes(1);
    expect(mockTimelineFeedProps).toHaveBeenCalledWith(expect.objectContaining({ requestedLayout: LAYOUT.LIST }));
  });

  it('renders the feed and passes empty state for an empty envelope owned by the viewer', () => {
    setAuthStore(AUTHOR_PUBKY);

    renderCollectionItems({ postDetails: buildPostDetails(COLLECTION_CONTENT_EMPTY) });

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'collection');
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-empty-state', 'true');
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-trailing-slot', 'true');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-cy', 'collection-add-content-grid');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-trigger-variant', 'grid');
  });

  it('does not pass a grid trailing slot for non-owner collections', () => {
    setAuthStore('some-other-user');

    renderCollectionItems();

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-has-trailing-slot', 'false');
    expect(screen.queryByTestId('add-content-dialog')).not.toBeInTheDocument();
  });

  it('renders plain empty text with the hero outside the feed for an empty envelope viewed by a non-owner', () => {
    setAuthStore('some-other-user');

    renderCollectionItems({ postDetails: buildPostDetails(COLLECTION_CONTENT_EMPTY) });

    expect(screen.getByTestId('collection-hero')).toBeInTheDocument();
    expect(screen.getByText('collections.single.empty')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
  });

  describe('reorder mode', () => {
    it('passes the reorder bridge to the hero for owners only', () => {
      setAuthStore(AUTHOR_PUBKY);
      const { unmount } = renderCollectionItems();
      expect(screen.getByTestId('collection-hero')).toHaveAttribute('data-has-reorder', 'true');
      unmount();

      setAuthStore('some-other-user');
      renderCollectionItems();
      expect(screen.getByTestId('collection-hero')).toHaveAttribute('data-has-reorder', 'false');
    });

    it('replaces the TimelineFeed with the reorder grid while reorder mode is active', () => {
      setAuthStore(AUTHOR_PUBKY);
      mockReorderState.isReorderMode = true;
      mockReorderState.draftEntries = [
        { uri: 'pubky://author/pub/pubky.app/posts/a', postId: 'author:a' },
        { uri: 'pubky://author/pub/pubky.app/posts/b', postId: 'author:b' },
      ];

      renderCollectionItems();

      expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
      expect(screen.queryByTestId('add-content-dialog')).not.toBeInTheDocument();
      const grid = screen.getByTestId('collection-reorder-grid');
      expect(grid).toHaveAttribute('data-entry-count', '2');
      expect(grid).toHaveAttribute('data-disabled', 'false');
      expect(screen.getByTestId('collection-hero')).toHaveAttribute('data-reorder-active', 'true');
    });

    it('disables the reorder grid while the save commit is in flight', () => {
      setAuthStore(AUTHOR_PUBKY);
      mockReorderState.isReorderMode = true;
      mockReorderState.isSaving = true;

      renderCollectionItems();

      expect(screen.getByTestId('collection-reorder-grid')).toHaveAttribute('data-disabled', 'true');
    });

    it('auto-cancels reorder mode when the collection becomes blurred by moderation', () => {
      // The blurred hero has no Save/Cancel controls, so staying in reorder
      // mode would trap the user (and keep the FAB hidden app-wide).
      setAuthStore(AUTHOR_PUBKY);
      mockReorderState.isReorderMode = true;

      renderCollectionItems({ postDetails: buildPostDetails(COLLECTION_CONTENT, { isBlurred: true }) });

      expect(mockReorderState.cancelReorder).toHaveBeenCalledTimes(1);
    });

    it('does not cancel reorder mode while the collection is not blurred', () => {
      setAuthStore(AUTHOR_PUBKY);
      mockReorderState.isReorderMode = true;

      renderCollectionItems();

      expect(mockReorderState.cancelReorder).not.toHaveBeenCalled();
    });
  });
});

describe('CollectionItems - Snapshots', () => {
  it('matches the owner non-empty snapshot', () => {
    setAuthStore(AUTHOR_PUBKY);

    const { container } = renderCollectionItems();

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the owner Visual layout snapshot', () => {
    setAuthStore(AUTHOR_PUBKY);

    const { container } = renderCollectionItems({
      postDetails: buildPostDetails(
        JSON.stringify({
          name: 'Based Bitcoin',
          items: ['pubky://author/pub/pubky.app/posts/a'],
          layout: COLLECTION_LAYOUT.VISUAL,
        }),
      ),
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the owner reorder-mode snapshot', () => {
    setAuthStore(AUTHOR_PUBKY);
    mockReorderState.isReorderMode = true;
    mockReorderState.draftEntries = [{ uri: 'pubky://author/pub/pubky.app/posts/a', postId: 'author:a' }];

    const { container } = renderCollectionItems();

    expect(container.firstChild).toMatchSnapshot();
  });
});
