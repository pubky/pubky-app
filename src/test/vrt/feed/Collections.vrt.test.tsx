// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { page } from 'vitest/browser';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import type { UseEntityTaggersResult } from '@/hooks/useEntityTaggers/useEntityTaggers';
import { describe, expect, it, vi } from 'vitest';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { formatStableRelative } from '@/test-utils/vrt.clock';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { BookmarksCollection } from '@/templates/BookmarksCollection/BookmarksCollection';
import { Collection } from '@/templates/Collection/Collection';
import { Collections } from '@/templates/Collections/Collections';

const routeState = vi.hoisted(() => ({
  pathname: '/collections',
  masonryFixtures: false,
  failedMedia: false,
  params: {} as { userId?: string; postId?: string },
}));

// Browser-mode vi.mock factories run before top-level imports resolve and have
// no synchronous require(), so each factory loads its fixture via async import
// the first time the mocked module is consumed.
const fixtures = vi.hoisted(async () => {
  const [collectionsModule, postsModule, profilesModule, navModule, mockApp] = await Promise.all([
    import('@/test/fixtures/feed/collections'),
    import('@/test/fixtures/feed/posts'),
    import('@/test/fixtures/feed/profiles'),
    import('@/test/fixtures/feed/feedNavigation'),
    import('@/test/mocks/feedApplication'),
  ]);
  const postsByCompositeId = new Map(postsModule.VRT_FEED_POSTS.map((post) => [post.compositeId, post]));
  const collectionsByCompositeId = new Map(
    collectionsModule.VRT_ALL_COLLECTIONS.map((collection) => [collection.compositeId, collection]),
  );
  const entitiesByCompositeId = new Map([...postsByCompositeId, ...collectionsByCompositeId]);
  const myCollectionIds = collectionsModule.VRT_MY_COLLECTIONS.map((c) => c.compositeId);
  const followedCollectionIds = collectionsModule.VRT_FOLLOWED_COLLECTIONS.map((c) => c.compositeId);
  const discoverCollectionIds = collectionsModule.VRT_DISCOVER_COLLECTIONS.map((c) => c.compositeId);
  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  return {
    collectionsByCompositeId,
    entitiesByCompositeId,
    postsByCompositeId,
    myCollectionIds,
    followedCollectionIds,
    discoverCollectionIds,
    singleCollections: collectionsModule.VRT_SINGLE_COLLECTIONS,
    collectionItemIds: collectionsModule.VRT_COLLECTION_ITEM_IDS,
    collectionItemTags: collectionsModule.VRT_COLLECTION_ITEM_TAGS,
    bookmarkPostIds: collectionsModule.VRT_BOOKMARK_POST_IDS,
    visualRows: collectionsModule.VRT_COLLECTION_VISUAL_ROWS,
    collectionCoverUrls: collectionsModule.VRT_COLLECTION_COVER_URLS,
    profiles: profilesModule.VRT_AUTHOR_PROFILES,
    viewerPubky,
    homeFilters: navModule.VRT_HOME_FILTERS,
    mockFeedApplication: mockApp.mockFeedApplication,
  };
});

vi.mock('next/navigation', () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  };
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => router,
    usePathname: () => routeState.pathname,
    useSearchParams: () => searchParams,
    useParams: () => routeState.params,
  };
});

// Collections sections use async useLiveQuery (bookmark/details joins). Resolve
// promises into React state so My / Followed / Discover can leave skeleton
// states — tests wait for known card titles before screenshotting.
vi.mock('dexie-react-hooks', async () => {
  const React = await import('react');
  return {
    useLiveQuery: <T,>(querier: () => T | Promise<T>, deps?: unknown[], defaultValue?: T): T | undefined => {
      const [data, setData] = React.useState<T | undefined>(defaultValue);
      const depsKey = JSON.stringify(deps ?? []);
      React.useEffect(() => {
        let alive = true;
        void (async () => {
          try {
            const result = await Promise.resolve(querier());
            if (alive) setData(result);
          } catch {
            if (alive) setData(defaultValue);
          }
        })();
        return () => {
          alive = false;
        };
        // Intentionally keyed by serialized deps — mirrors Dexie live-query
        // re-subscription when the dependency list identity changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [depsKey]);
      return data;
    },
  };
});

vi.mock('@/stores/home/home.store', async () => {
  const f = await fixtures;
  return {
    useHomeStore: createZustandLikeHook({
      ...f.homeFilters,
      setLayout: vi.fn(),
      setSort: vi.fn(),
      setReach: vi.fn(),
      setContent: vi.fn(),
      reset: vi.fn(),
    }),
  };
});

vi.mock('@/stores/auth/auth.store', async () => {
  const f = await fixtures;
  return {
    useAuthStore: createZustandLikeHook({
      currentUserPubky: f.viewerPubky,
      sessionExport: null,
      hasProfile: true,
      hasHydrated: true,
      isRestoringSession: false,
      selectCurrentUserPubky: () => f.viewerPubky,
    }),
  };
});

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: createZustandLikeHook({
    secretKey: null as string | null,
    showWelcomeDialog: false,
    setShowWelcomeDialog: () => {},
    hasHydrated: true,
  }),
}));

vi.mock('@/stores/migration/migration.store', () => ({
  useMigrationStore: createZustandLikeHook({
    wasDbReset: false,
    setWasDbReset: () => {},
  }),
}));

vi.mock('@/stores/notification/notification.store', () => ({
  useNotificationStore: createZustandLikeHook({
    selectUnread: () => 0,
  }),
}));

vi.mock('@/stores/localFiles/localFiles.store', async () => {
  const f = await fixtures;
  const portrait =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="darkslategray"/><circle cx="200" cy="260" r="140" fill="palegreen"/><text x="40" y="550" font-size="40" fill="white">Portrait study</text></svg>',
    );
  const landscape = '/images/collections-onboarding.webp';
  const media: AttachmentConstructed[] = [
    { type: 'image/svg+xml', name: 'Portrait study', width: 400, height: 800, urls: { main: portrait } },
    { type: 'image/webp', name: 'Collections on a desk', urls: { main: landscape } },
  ];
  const empty = { profile: null, posts: {}, collections: {} };
  const withMedia = {
    ...empty,
    posts: {
      [f.collectionItemIds[0]]: media,
      [f.collectionItemIds[1]]: [media[0]],
      [f.collectionItemIds[5]]: [media[1]],
      [f.bookmarkPostIds[0]]: media,
    },
  };
  const withFailedMedia = {
    ...withMedia,
    posts: {
      ...withMedia.posts,
      [f.collectionItemIds[0]]: [
        { type: 'image/png', name: 'Missing image', urls: { main: 'data:image/png;base64,invalid' } },
      ],
    },
  };
  return {
    useLocalFilesStore: <T,>(selector: (state: typeof empty) => T) =>
      selector(routeState.masonryFixtures ? (routeState.failedMedia ? withFailedMedia : withMedia) : empty),
  };
});

vi.mock('@/hooks/useKeyboardVisible/useKeyboardVisible', () => ({
  useKeyboardVisible: () => false,
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({
    isPublicRoute: false,
    isCoreExploreRoute: true,
    isDynamicPublicRoute: false,
    isPublicExploreRoute: true,
  }),
}));

// Collection sections and finite collection/bookmark feeds share this hook.
// Route by stream shape so each surface receives its own stable fixture slice.
vi.mock('@/hooks/useStreamPagination/useStreamPagination', async () => {
  const f = await fixtures;
  const cache = new Map<string, unknown>();
  return {
    useStreamPagination: ({ streamId }: { streamId: string }) => {
      const cached = cache.get(streamId);
      if (cached) return cached;
      const postIds = streamId.startsWith('collection:')
        ? f.collectionItemIds
        : streamId === 'timeline:bookmarks:all'
          ? f.bookmarkPostIds
          : f.myCollectionIds;
      const result = {
        postIds,
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: async () => {},
        refresh: async () => {},
        prependPosts: async () => {},
        prependOptimisticPosts: async () => {},
        removePosts: () => {},
      };
      cache.set(streamId, result);
      return result;
    },
  };
});

vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => {
  const result = {
    mutedUserIds: [] as string[],
    mutedUserIdSet: new Set<string>(),
    isMuted: () => false,
    isLoading: false,
  };
  return { useMutedUsers: () => result };
});

vi.mock('@/hooks/useFollowUser/useFollowUser', () => {
  const result = {
    toggleFollow: async () => {},
    isLoading: false,
    loadingAction: null as null,
    loadingUserId: null as null,
    isUserLoading: () => false,
    error: null as string | null,
  };
  return { useFollowUser: () => result };
});

vi.mock('@/hooks/useUnreadPosts/useUnreadPosts', () => {
  const result = { unreadPostIds: [] as string[], unreadCount: 0 };
  return { useUnreadPosts: () => result };
});

vi.mock('@/hooks/usePullToRefresh/usePullToRefresh', () => {
  const result = { state: 'idle' as const, pullDistance: 0 };
  return { usePullToRefresh: () => result };
});

vi.mock('@/hooks/useIsScrolledFromTop/useIsScrolledFromTop', () => ({
  useIsScrolledFromTop: () => false,
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', async () => {
  const f = await fixtures;
  const EMPTY = { postDetails: null, isLoading: false } as const;
  const cache = new Map<string, { postDetails: unknown; isLoading: false }>();
  return {
    usePostDetails: (compositeId: string | null) => {
      if (!compositeId) return EMPTY;
      const cacheKey = `${routeState.masonryFixtures}:${compositeId}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      const fixture = f.entitiesByCompositeId.get(compositeId);
      if (!fixture) {
        cache.set(cacheKey, EMPTY);
        return EMPTY;
      }
      const result = {
        postDetails: {
          ...fixture.details,
          ...(routeState.masonryFixtures && compositeId === f.collectionItemIds[5]
            ? {
                kind: 'long',
                content: JSON.stringify({
                  title: 'Designing a useful collection',
                  body: 'Keep the original proportions. Let the content determine how much room it needs. This article explains why independent columns make browsing a mixed collection easier.',
                }),
                attachments: ['pubky://fixture/pub/pubky.app/files/cover'],
              }
            : {}),
          ...(routeState.masonryFixtures && compositeId === f.collectionItemIds[4]
            ? { content: 'A longer notebook entry. '.repeat(50) }
            : {}),
          is_moderated: false,
          is_blurred: false,
        },
        isLoading: false as const,
      };
      cache.set(cacheKey, result);
      return result;
    },
  };
});

vi.mock('@/hooks/usePostCounts/usePostCounts', async () => {
  const f = await fixtures;
  const ZERO_COUNTS = { tags: 0, unique_tags: 0, replies: 0, reposts: 0 };
  const cache = new Map<string, { postCounts: typeof ZERO_COUNTS; isLoading: false }>();
  return {
    usePostCounts: (compositeId: string) => {
      const cached = cache.get(compositeId);
      if (cached) return cached;
      const fixture = f.entitiesByCompositeId.get(compositeId);
      const result = { postCounts: fixture?.counts ?? ZERO_COUNTS, isLoading: false as const };
      cache.set(compositeId, result);
      return result;
    },
  };
});

vi.mock('@/hooks/useBookmark/useBookmark', () => {
  const noopToggle = async () => {};
  return {
    useBookmark: (_id: string, options?: { initialIsBookmarked?: boolean }) => ({
      isBookmarked: options?.initialIsBookmarked ?? false,
      isLoading: false,
      isToggling: false,
      toggle: noopToggle,
    }),
  };
});

vi.mock('@/hooks/usePostSaveTargets/usePostSaveTargets', () => {
  const noop = async () => {};
  const result = {
    isBookmarked: false,
    isBookmarkLoading: false,
    isBookmarkToggling: false,
    collections: [],
    isCollectionsLoading: false,
    isCreatingCollection: false,
    toggleBookmark: noop,
    toggleCollection: noop,
    createCollectionWithPost: noop,
  };
  return { usePostSaveTargets: () => result };
});

vi.mock('@/hooks/useUserDetails/useUserDetails', async () => {
  const f = await fixtures;
  const EMPTY = { userDetails: null, isLoading: false } as const;
  const cache = new Map<string, { userDetails: unknown; isLoading: false }>();
  return {
    useUserDetails: (pubky: string | null | undefined) => {
      if (!pubky) return EMPTY;
      const cached = cache.get(pubky);
      if (cached) return cached;
      const profile = f.profiles[pubky] ?? null;
      const result = {
        userDetails: profile ? { ...profile, is_moderated: false, is_blurred: false } : null,
        isLoading: false as const,
      };
      cache.set(pubky, result);
      return result;
    },
  };
});

vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({
  useAvatarUrl: (userDetails: { image: string | null } | null | undefined) => userDetails?.image ?? null,
}));

vi.mock('@/hooks/useRelativeTime/useRelativeTime', () => {
  const result = { formatRelativeTime: formatStableRelative };
  return { useRelativeTime: () => result };
});

vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => {
  const noopRef = () => {};
  const result = { ref: noopRef };
  return { useTtlSubscription: () => result };
});

vi.mock('@/hooks/usePostHeaderVisibility/usePostHeaderVisibility', () => {
  const result = { showRepostHeader: false, shouldShowPostHeader: true, originalPostId: null };
  return { usePostHeaderVisibility: () => result };
});

vi.mock('@/hooks/useRepostInfo/useRepostInfo', () => {
  const result = {
    isRepost: false,
    repostAuthorId: null,
    isReply: false,
    isCurrentUserRepost: false,
    originalPostId: null,
    isLoading: false,
    hasError: false,
  };
  return { useRepostInfo: () => result };
});

vi.mock('@/hooks/useEntityTags/useEntityTags', async () => {
  const f = await fixtures;
  const noopToggle = async () => {};
  const noopAdd = async () => ({ success: true });
  const isViewerTagger = () => false;
  const cache = new Map<string, unknown>();
  return {
    useEntityTags: (taggedId: string) => {
      const cacheKey = `${routeState.pathname}:${taggedId}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      const fixture = f.entitiesByCompositeId.get(taggedId);
      const isGridSurface =
        routeState.pathname === '/collections/bookmarks' ||
        routeState.params.postId === f.singleCollections.grid.postId;
      const fixtureTags = (isGridSurface ? f.collectionItemTags[taggedId] : undefined) ?? fixture?.tags ?? [];
      const tags = fixtureTags.map((tag) => ({ ...tag, taggers_avatars: [] }));
      const result = {
        tags,
        count: tags.length,
        isLoading: false as const,
        isViewerTagger,
        handleTagToggle: noopToggle,
        handleTagAdd: noopAdd,
      };
      cache.set(cacheKey, result);
      return result;
    },
  };
});

vi.mock('@/hooks/useEntityTaggers/useEntityTaggers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useEntityTaggers/useEntityTaggers')>();
  const result: UseEntityTaggersResult = {
    taggerStates: new Map(),
    loadTaggers: async () => {},
    loadMoreTaggers: async () => {},
  };
  return { ...actual, useEntityTaggers: () => result };
});

vi.mock('@/hooks/useThreadReplies/useThreadReplies', () => {
  const result = {
    replyIds: [] as string[],
    totalCount: 0,
    hasMore: false,
    showAll: false,
    isExpandingAll: false,
    expandAll: async () => {},
  };
  return { useThreadReplies: () => result };
});

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/useVisualFeedTiles', async () => {
  const f = await fixtures;
  const result = {
    rows: f.visualRows,
    tail: [] as never[],
    tiles: f.visualRows.flatMap((row) => row.cells.flatMap((cell) => (cell.tile ? [cell.tile] : []))),
    hasPendingSnapshot: false,
    hasPendingTiles: false,
    hasPendingFiles: false,
    hasPendingPostDetails: false,
    hiddenPostCount: 1,
  };
  return { useVisualFeedTiles: () => result };
});

vi.mock('@/hooks/useAuthStatus/useAuthStatus', async () => {
  const types =
    (await import('@/hooks/useAuthStatus/useAuthStatus.types')) as typeof import('@/hooks/useAuthStatus/useAuthStatus.types');
  const result = {
    status: types.AuthStatus.AUTHENTICATED,
    isLoading: false,
    hasKeypair: true,
    hasProfile: true,
    isFullyAuthenticated: true,
  };
  return { useAuthStatus: () => result };
});

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', async () => {
  const f = await fixtures;
  const result = {
    userDetails: f.profiles[f.viewerPubky],
    currentUserPubky: f.viewerPubky,
    isLoading: false,
  };
  return { useCurrentUserProfile: () => result };
});

vi.mock('@/hooks/useCustomFeed/useCustomFeed', () => {
  const result = { feed: null, isLoading: false };
  return { useCustomFeed: () => result };
});

vi.mock('@/hooks/useUserProfile/useUserProfile', async () => {
  const f = await fixtures;
  const cache = new Map<string, { profile: unknown; isLoading: false }>();
  return {
    useUserProfile: (userId: string) => {
      const cached = cache.get(userId);
      if (cached) return cached;
      const details = f.profiles[userId];
      const result = {
        profile: details
          ? {
              name: details.name ?? '',
              bio: details.bio ?? '',
              publicKey: `pk:${userId}`,
              emoji: '🌴',
              status: details.status ?? '',
              avatarUrl: undefined,
              link: `/profile/${userId}`,
              links: details.links,
            }
          : null,
        isLoading: false as const,
      };
      cache.set(userId, result);
      return result;
    },
  };
});

vi.mock('@/hooks/useBookmarksCollectionSummary/useBookmarksCollectionSummary', async () => {
  const f = await fixtures;
  const profile = f.profiles[f.viewerPubky];
  return {
    useBookmarksCollectionSummary: () => ({
      avatarName: profile.name ?? 'U',
      avatarSeed: f.viewerPubky,
      avatarUrl: undefined,
      bookmarkCount: f.bookmarkPostIds.length,
      isProfileResolved: true,
    }),
  };
});

// Keep Collections nav chrome stable (no pulsing NEW treatment).
vi.mock('@/hooks/useCollectionsNavDiscovery/useCollectionsNavDiscovery', () => ({
  useCollectionsNavDiscovery: () => ({
    showCollectionsNew: false,
    markCollectionsNavSeen: () => {},
  }),
}));

vi.mock('@/hooks/useDeletePost/useDeletePost', () => ({
  useDeletePost: () => ({ deletePost: async () => {}, isDeleting: false }),
}));

vi.mock('@/hooks/useHotTags/useHotTags', () => {
  const result = { tags: [], rawTags: [], isLoading: false, error: null, refetch: async () => {} };
  return { useHotTags: () => result };
});

vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', () => {
  const result = { tags: [], users: [], isLoading: false, error: null };
  return { useSearchAutocomplete: () => result };
});

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    requireAuth: (action: () => void) => action(),
    isAuthenticated: true,
  }),
}));

vi.mock('@/application/feed/feed', async () => {
  const f = await fixtures;
  return { FeedApplication: f.mockFeedApplication };
});

vi.mock('@/controllers/file/file', async () => {
  const f = await fixtures;
  return {
    FileController: {
      getAvatarUrl: () => null,
      getFileUrl: ({ fileId }: { fileId: string }) => f.collectionCoverUrls[fileId] ?? null,
      getMetadata: async () => [],
      fetchFiles: async () => [],
    },
  };
});

// Followed / Discover seed from stream slices; live queries read bookmarks + details.
vi.mock('@/controllers/stream/posts/posts', async () => {
  const f = await fixtures;
  return {
    StreamPostsController: {
      prepareStreamForInitialLoad: async () => {},
      getCachedLastPostTimestamp: async () => 0,
      getOrFetchStreamSlice: async ({ streamId }: { streamId: string }) => {
        const isFollowedSeed = String(streamId).includes('bookmarks');
        const nextPageIds = isFollowedSeed ? f.followedCollectionIds : f.discoverCollectionIds;
        return {
          nextPageIds,
          nextCursor: nextPageIds.length,
          reachedEnd: true,
        };
      },
    },
  };
});

vi.mock('@/controllers/bookmark/bookmark', async () => {
  const f = await fixtures;
  return {
    BookmarkController: {
      getAll: async () => [...f.followedCollectionIds],
    },
  };
});

vi.mock('@/controllers/post/post', async () => {
  const f = await fixtures;
  return {
    PostController: {
      getDetailsByIds: async ({ compositeIds }: { compositeIds: string[] }) =>
        compositeIds.map((id) => {
          const fixture = f.collectionsByCompositeId.get(id);
          return fixture ? { ...fixture.details } : undefined;
        }),
      getAuthoredCollections: async () =>
        f.myCollectionIds.map((id) => {
          const fixture = f.collectionsByCompositeId.get(id)!;
          return { id: fixture.postId, author: fixture.details.author };
        }),
      fetchAuthoredCollections: async () => {},
    },
  };
});

// Root layout mounts `<Header />` above the page. `Collections` already wraps
// itself in `ContentLayout` (no left/right sidebars on this route).
function CollectionsWithHeader() {
  return (
    <>
      <Header />
      <Collections />
    </>
  );
}

function CollectionWithHeader({ postId }: { postId: string }) {
  return (
    <>
      <Header />
      <Collection postId={postId} />
    </>
  );
}

function BookmarksWithHeader() {
  return (
    <>
      <Header />
      <BookmarksCollection />
    </>
  );
}

async function expectCollectionsOverviewReady(screen: Awaited<ReturnType<typeof renderForVRT>>) {
  // Sections hydrate via async live queries / stream seeds — wait for known
  // card titles so the screenshot is not a skeleton first-paint.
  await expect.element(screen.getByText('My Collections')).toBeVisible();
  await expect.element(screen.getByText('Local-first notes')).toBeVisible();
  await expect.element(screen.getByText('Followed Collections')).toBeVisible();
  await expect.element(screen.getByText('Golden hour')).toBeVisible();
  await expect.element(screen.getByText('Discover Collections')).toBeVisible();
  await expect.element(screen.getByText('Weekend reads')).toBeVisible();
}

async function renderCollectionsOverview(viewport: { width: number; height: number }) {
  routeState.masonryFixtures = false;
  const f = await fixtures;
  routeState.pathname = '/collections';
  routeState.params = {};
  await preloadImages(Object.values(f.collectionCoverUrls));

  const screen = await renderForVRT(<CollectionsWithHeader />, { viewport });
  await expectCollectionsOverviewReady(screen);
  return screen;
}

async function renderSingleCollection(
  layout: keyof Awaited<typeof fixtures>['singleCollections'],
  viewport: { width: number; height: number },
  masonry = false,
) {
  routeState.masonryFixtures = masonry;
  routeState.failedMedia = false;
  const f = await fixtures;
  const collection = f.singleCollections[layout];
  routeState.pathname = `/collections/${collection.details.author}/${collection.postId}`;
  routeState.params = { userId: collection.details.author, postId: collection.postId };
  // Hero cover is a CSS `background-image`; `renderForVRT` only awaits `<img>`.
  // Preload so readiness is explicit instead of relying on toMatchScreenshot retries.
  await preloadImages(Object.values(f.collectionCoverUrls));

  const screen = await renderForVRT(<CollectionWithHeader postId={collection.compositeId} />, { viewport });
  await expect.element(screen.getByRole('heading', { name: 'Signals from the field' })).toBeVisible();
  if (layout === 'visual' && viewport.width >= 768) {
    await expect.element(screen.getByRole('button', { name: `Open post ${f.collectionItemIds[0]}` })).toBeVisible();
  } else {
    await expect.element(screen.getByRole('feed')).toBeVisible();
  }
  return screen;
}

async function renderBookmarks(viewport: { width: number; height: number }, masonry = false) {
  routeState.masonryFixtures = masonry;
  routeState.failedMedia = false;
  routeState.pathname = '/collections/bookmarks';
  routeState.params = {};

  const screen = await renderForVRT(<BookmarksWithHeader />, { viewport });
  await expect.element(screen.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
  await expect.element(screen.getByRole('feed')).toBeVisible();
  return screen;
}

describe('Collections overview — visual regression', () => {
  it('renders the collections overview at desktop viewport', async () => {
    await renderCollectionsOverview(VRT_VIEWPORT_DESKTOP);
    // Viewport-clamped root: first fold (My + start of Followed/Discover).
    // This is a particularly heavy surface in the VRT suite — increase timeout to give this one more headroom.
    await matchVrtFrameScreenshot('collections-overview-desktop', {
      timeout: 25_000,
    });
  }, 40_000);

  it('renders the collections overview at mobile viewport', async () => {
    await renderCollectionsOverview(VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('collections-overview-mobile');
  });
});

describe('Single collection — grid layout — visual regression', () => {
  it('renders a grid collection at desktop viewport', async () => {
    await renderSingleCollection('grid', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('single-collection-grid-desktop');
  });

  it('renders a grid collection at mobile viewport', async () => {
    await renderSingleCollection('grid', VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('single-collection-grid-mobile');
  });
});

describe('Single collection — list layout — visual regression', () => {
  it('renders a list collection at desktop viewport', async () => {
    await renderSingleCollection('list', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('single-collection-list-desktop');
  });
});

describe('Single collection — visual layout — visual regression', () => {
  it('renders a visual collection at desktop viewport', async () => {
    await renderSingleCollection('visual', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('single-collection-visual-desktop');
  });

  it('shows the phone Grid fallback and restores the Visual preference after resize', async () => {
    await renderSingleCollection('visual', VRT_VIEWPORT_MOBILE);
    await page.getByRole('button', { name: 'Layout: Grid', exact: true }).click();
    await expect.element(page.getByRole('menuitem', { name: 'Visual', exact: true })).not.toBeInTheDocument();
    await page.getByRole('menuitem', { name: 'Masonry', exact: true }).click();
    await expect.poll(() => document.querySelector('[data-cy="timeline-posts-masonry"]')).not.toBeNull();
    await page.viewport(VRT_VIEWPORT_DESKTOP.width, VRT_VIEWPORT_DESKTOP.height);
    await page.getByRole('button', { name: 'Layout: Masonry', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Visual', exact: true }).click();
    const f = await fixtures;
    await expect.element(page.getByRole('button', { name: `Open post ${f.collectionItemIds[0]}` })).toBeVisible();
    await page.viewport(VRT_VIEWPORT_MOBILE.width, VRT_VIEWPORT_MOBILE.height);
    await expect.element(page.getByRole('button', { name: 'Layout: Grid', exact: true })).toBeVisible();
    await page.viewport(VRT_VIEWPORT_DESKTOP.width, VRT_VIEWPORT_DESKTOP.height);
    await expect.element(page.getByRole('button', { name: 'Layout: Visual', exact: true })).toBeVisible();
    await expect.element(page.getByRole('button', { name: `Open post ${f.collectionItemIds[0]}` })).toBeVisible();
  });
});

describe('Bookmarks collection — visual regression', () => {
  it('renders bookmarks at desktop viewport', async () => {
    await renderBookmarks(VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('bookmarks-collection-desktop');
  });

  it('renders bookmarks at mobile viewport', async () => {
    await renderBookmarks(VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('bookmarks-collection-mobile');
  });
});

async function chooseMasonry() {
  await page.getByRole('button', { name: 'Layout: Grid', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Masonry', exact: true }).click();
  await expect.element(page.getByRole('button', { name: 'Layout: Masonry', exact: true })).toBeVisible();
  await expect.poll(() => document.querySelector('[data-cy="timeline-posts-masonry"]')).not.toBeNull();
}

function assertMasonryGeometry() {
  const feed = document.querySelector<HTMLElement>('[data-cy="timeline-posts-masonry"]')!;
  const cards = Array.from(feed.children).map((node) => node.getBoundingClientRect());
  expect(cards.length).toBeGreaterThan(1);
  cards.forEach((card, index) => {
    expect(card.right).toBeLessThanOrEqual(feed.getBoundingClientRect().right + 1);
    for (const other of cards.slice(index + 1)) {
      const overlaps =
        card.left < other.right - 1 &&
        card.right > other.left + 1 &&
        card.top < other.bottom - 1 &&
        card.bottom > other.top + 1;
      expect(overlaps).toBe(false);
    }
  });
  expect(feed.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(Math.max(...cards.map((card) => card.bottom)) - 1);
}

describe('Masonry — mixed content and interactions', () => {
  it.each([
    ['desktop', VRT_VIEWPORT_DESKTOP],
    ['mobile', VRT_VIEWPORT_MOBILE],
  ] as const)('renders a collection on %s', async (name, viewport) => {
    await renderSingleCollection('grid', viewport, true);
    await chooseMasonry();
    await expect
      .poll(() => {
        assertMasonryGeometry();
        return true;
      })
      .toBe(true);
    await matchVrtFrameScreenshot(`single-collection-masonry-${name}`);
  });

  it.each([
    ['desktop', VRT_VIEWPORT_DESKTOP],
    ['mobile', VRT_VIEWPORT_MOBILE],
  ] as const)('renders Bookmarks on %s', async (name, viewport) => {
    await renderBookmarks(viewport, true);
    await chooseMasonry();
    await expect
      .poll(() => {
        assertMasonryGeometry();
        return true;
      })
      .toBe(true);
    await matchVrtFrameScreenshot(`bookmarks-masonry-${name}`);
  });

  it('keeps its frame stable through carousel navigation and opens the selected media', async () => {
    await renderBookmarks(VRT_VIEWPORT_DESKTOP, true);
    await chooseMasonry();
    const carousel = page.getByRole('region', { name: 'Post media' }).first();
    const frame = document.querySelector('[data-cy="timeline-posts-masonry"] [data-slot="carousel"]')!;
    const height = frame.getBoundingClientRect().height;
    await carousel.getByRole('button', { name: 'Next slide' }).click();
    await expect.element(carousel.getByText('2 / 2', { exact: true })).toBeVisible();
    expect(frame.getBoundingClientRect().height).toBeCloseTo(height, 0);
    await carousel.getByRole('button', { name: 'Open image 2 of 2: Collections on a desk' }).click();
    await expect.element(page.getByRole('dialog')).toBeVisible();
    await expect.element(page.getByRole('dialog').getByText('2/2', { exact: true })).toBeVisible();
    assertMasonryGeometry();
  });
});

async function renderMasonryCards(viewport: { width: number; height: number }, failedMedia = false) {
  const { PostMainLayoutProvider } = await import('@/organisms/PostMain/PostMainLayoutContext');
  const { TimelineMasonryPosts } = await import('@/organisms/Timeline/Posts/MasonryPosts/MasonryPosts');
  routeState.masonryFixtures = true;
  routeState.failedMedia = failedMedia;
  routeState.pathname = '/collections';
  const f = await fixtures;
  const cardIds = [0, 4, 5, 1, 2, 3].map((index) => f.collectionItemIds[index]);
  return renderForVRT(
    <PostMainLayoutProvider tagsLayout="inline">
      <TimelineMasonryPosts
        postIds={cardIds}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={async () => {}}
        showEndMessage={false}
      />
    </PostMainLayoutProvider>,
    { viewport },
  );
}

describe('Masonry cards — browser coverage', () => {
  it.each([
    ['desktop', VRT_VIEWPORT_DESKTOP],
    ['mobile', VRT_VIEWPORT_MOBILE],
  ] as const)('loads three pages through the real Masonry sentinel on %s', async (_name, viewport) => {
    const { useState } = await import('react');
    const { PostMainLayoutProvider } = await import('@/organisms/PostMain/PostMainLayoutContext');
    const { TimelineMasonryPosts } = await import('@/organisms/Timeline/Posts/MasonryPosts/MasonryPosts');
    const f = await fixtures;
    routeState.masonryFixtures = true;
    routeState.failedMedia = false;
    routeState.pathname = '/collections';
    const ids = [0, 4, 5, 1, 2, 3].map((index) => f.collectionItemIds[index]);
    type Page = { postIds: string[]; hasMore: boolean };
    const secondPage = Promise.withResolvers<Page>();
    const thirdPage = Promise.withResolvers<Page>();
    const fetchPage = vi
      .fn<() => Promise<Page>>()
      .mockReturnValueOnce(secondPage.promise)
      .mockReturnValueOnce(thirdPage.promise);

    // Only the page-data boundary is controlled. Both layout/scroll hooks,
    // observers, card content and pagination controls use their real implementations.
    function PaginatedMasonry() {
      const [postIds, setPostIds] = useState(ids.slice(0, 2));
      const [loadingMore, setLoadingMore] = useState(false);
      const [hasMore, setHasMore] = useState(true);
      const loadMore = async () => {
        setLoadingMore(true);
        const next = await fetchPage();
        setPostIds((current) => [...current, ...next.postIds]);
        setHasMore(next.hasMore);
        setLoadingMore(false);
      };
      return (
        <PostMainLayoutProvider tagsLayout="inline">
          <div aria-hidden="true" className="h-screen" />
          <TimelineMasonryPosts
            postIds={postIds}
            loading={false}
            loadingMore={loadingMore}
            error={null}
            hasMore={hasMore}
            loadMore={loadMore}
            showEndMessage={false}
          />
        </PostMainLayoutProvider>
      );
    }

    const screen = await renderForVRT(<PaginatedMasonry />, { viewport });
    // The screenshot harness clips its root; make that root scrollable for this interaction test.
    const scroller = screen.getByTestId('vrt-root').element();
    scroller.style.overflowY = 'auto';
    const feed = screen.getByRole('feed').element();
    const sentinel = feed.parentElement!.lastElementChild!;
    const cards = () => Array.from(feed.querySelectorAll<HTMLElement>(':scope > [role="article"]'));
    const assertSentinelPosition = () => {
      assertMasonryGeometry();
      expect(feed.contains(sentinel)).toBe(false);
      expect(sentinel.getBoundingClientRect().height).toBeGreaterThan(0);
      expect(sentinel.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        Math.max(...cards().map((card) => card.getBoundingClientRect().bottom)) - 1,
      );
      return true;
    };
    // Allow observer delivery and the renderer's 20ms debounce before negative call-count assertions.
    const settleScroll = () => new Promise((resolve) => setTimeout(resolve, 100));
    await expect.poll(assertSentinelPosition).toBe(true);
    await settleScroll();
    expect(fetchPage).not.toHaveBeenCalled();
    const initialColumns = cards().map((card) => card.getBoundingClientRect().left);

    scroller.scrollTop = scroller.scrollHeight;
    await expect.poll(() => fetchPage.mock.calls.length).toBe(1);
    scroller.scrollTop = 0;
    await settleScroll();
    scroller.scrollTop = scroller.scrollHeight;
    await settleScroll();
    expect(fetchPage).toHaveBeenCalledTimes(1);

    secondPage.resolve({ postIds: ids.slice(2, 4), hasMore: true });
    await expect.poll(() => cards().length).toBe(4);
    await expect.poll(assertSentinelPosition).toBe(true);
    expect(
      cards()
        .slice(0, 2)
        .map((card) => card.getBoundingClientRect().left),
    ).toEqual(initialColumns);
    scroller.scrollTop = scroller.scrollHeight;
    await expect.poll(() => fetchPage.mock.calls.length).toBe(2);

    const captionCard = cards()[1];
    const collapsedHeight = captionCard.getBoundingClientRect().height;
    await page.getByRole('button', { name: 'Show full post content', exact: true }).click();
    await expect.poll(() => captionCard.getBoundingClientRect().height).toBeGreaterThan(collapsedHeight);
    await expect.poll(assertSentinelPosition).toBe(true);
    scroller.scrollTop = scroller.scrollHeight;
    await settleScroll();
    expect(fetchPage).toHaveBeenCalledTimes(2);

    thirdPage.resolve({ postIds: ids.slice(4), hasMore: false });
    await expect.poll(() => cards().length).toBe(6);
    await expect.poll(() => sentinel.isConnected).toBe(false);
    await expect
      .poll(() => {
        assertMasonryGeometry();
        return true;
      })
      .toBe(true);
    scroller.scrollTop = 0;
    await settleScroll();
    scroller.scrollTop = scroller.scrollHeight;
    await settleScroll();
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('pauses a later video slide when its frame scrolls out while the caption stays visible', async () => {
    const { PostMediaCarousel } = await import('@/molecules/PostMediaCarousel/PostMediaCarousel');
    const videos = [1, 2, 3].map((number) => ({
      name: `Video ${number}`,
      type: 'video/mp4',
      width: 400,
      height: 225,
      urls: { main: '/pubky.mp4' },
    }));
    await renderForVRT(
      <div data-testid="media-scroll" className="h-80 w-80 overflow-y-auto p-4">
        <PostMediaCarousel media={videos} onOpenPreview={() => {}} isPreviewOpen={false} />
        <p className="h-160">The caption remains visible below the video.</p>
      </div>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await page.getByRole('button', { name: 'Next slide' }).click();
    await page.getByRole('button', { name: 'Next slide' }).click();
    await expect.element(page.getByText('3 / 3', { exact: true })).toBeVisible();
    const video = document.querySelectorAll('video')[2];
    video.muted = true;
    await video.play();
    await expect.poll(() => video.currentTime).toBeGreaterThan(0);
    const scroller = document.querySelector<HTMLElement>('[data-testid="media-scroll"]')!;
    scroller.scrollTop = video.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + 1;
    await expect.poll(() => video.paused).toBe(true);
    await expect.element(page.getByText('The caption remains visible below the video.')).toBeVisible();
  });

  it.each([
    ['desktop', VRT_VIEWPORT_DESKTOP],
    ['mobile', VRT_VIEWPORT_MOBILE],
  ] as const)('captures the mixed card treatments on %s', async (name, viewport) => {
    await renderMasonryCards(viewport);
    await expect.element(page.getByText('Designing a useful collection')).toBeVisible();
    await expect
      .poll(() => {
        assertMasonryGeometry();
        return true;
      })
      .toBe(true);
    await matchVrtFrameScreenshot(`masonry-cards-${name}`);
  });

  it('reflows expanded text without moving cards between columns', async () => {
    await renderMasonryCards(VRT_VIEWPORT_DESKTOP);
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('[data-cy="timeline-posts-masonry"] > [role="article"]'),
    );
    const before = cards.map((card) => card.getBoundingClientRect().left);
    await page.getByRole('button', { name: 'Show full post content', exact: true }).click();
    await expect
      .poll(() => {
        assertMasonryGeometry();
        return true;
      })
      .toBe(true);
    expect(cards.map((card) => card.getBoundingClientRect().left)).toEqual(before);
  });

  it('keeps failed media usable', async () => {
    await renderMasonryCards(VRT_VIEWPORT_MOBILE, true);
    await expect.element(page.getByRole('status')).toHaveTextContent('Media unavailable');
    await expect.element(page.getByRole('button', { name: 'Open original' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Reply to post (22)', exact: true })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'More options' }).first()).toBeVisible();
    assertMasonryGeometry();
  });
});
