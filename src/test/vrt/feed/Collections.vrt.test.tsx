// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { formatStableRelative } from '@/test-utils/vrt.clock';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { BookmarksCollection } from '@/templates/BookmarksCollection/BookmarksCollection';
import { Collection } from '@/templates/Collection/Collection';
import { Collections } from '@/templates/Collections/Collections';

const routeState = vi.hoisted(() => ({
  pathname: '/collections',
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

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: createZustandLikeHook({
    profile: null,
    posts: {} as Record<string, never>,
    collections: {} as Record<string, never>,
  }),
}));

vi.mock('@/hooks/useKeyboardOffset/useKeyboardOffset', () => ({
  useKeyboardOffset: () => ({ isKeyboardVisible: false, keyboardOffset: 0 }),
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
      const cached = cache.get(compositeId);
      if (cached) return cached;
      const fixture = f.entitiesByCompositeId.get(compositeId);
      if (!fixture) {
        cache.set(compositeId, EMPTY);
        return EMPTY;
      }
      const result = {
        postDetails: { ...fixture.details, is_moderated: false, is_blurred: false },
        isLoading: false as const,
      };
      cache.set(compositeId, result);
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
  const result = { showRepostHeader: false, shouldShowPostHeader: true };
  return { usePostHeaderVisibility: () => result };
});

vi.mock('@/hooks/useRepostInfo/useRepostInfo', () => {
  const result = {
    isRepost: false,
    repostAuthorId: null,
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

vi.mock('@/hooks/usePostTaggers/usePostTaggers', () => {
  const result = {
    taggersByLabel: new Map<string, string[]>(),
    taggerStates: new Map<string, { isLoading: boolean; error: string | null }>(),
    fetchAllTaggers: async () => {},
  };
  return { usePostTaggers: () => result };
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

async function preloadImages(urls: readonly string[]) {
  await Promise.all(
    urls.map(async (url) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => reject(new Error(`Failed to preload VRT image: ${url}`)), { once: true });
        image.src = url;
      });
      await image.decode();
    }),
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
) {
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

async function renderBookmarks(viewport: { width: number; height: number }) {
  routeState.pathname = '/collections/bookmarks';
  routeState.params = {};

  const screen = await renderForVRT(<BookmarksWithHeader />, { viewport });
  await expect.element(screen.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
  await expect.element(screen.getByRole('feed')).toBeVisible();
  return screen;
}

describe('Collections overview — visual regression', () => {
  it('renders the collections overview at desktop viewport', async () => {
    const screen = await renderCollectionsOverview(VRT_VIEWPORT_DESKTOP);
    // Viewport-clamped root: first fold (My + start of Followed/Discover).
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('collections-overview-desktop');
  });

  it('renders the collections overview at mobile viewport', async () => {
    const screen = await renderCollectionsOverview(VRT_VIEWPORT_MOBILE);
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('collections-overview-mobile');
  });
});

describe('Single collection — grid layout — visual regression', () => {
  it('renders a grid collection at desktop viewport', async () => {
    const screen = await renderSingleCollection('grid', VRT_VIEWPORT_DESKTOP);
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('single-collection-grid-desktop');
  });

  it('renders a grid collection at mobile viewport', async () => {
    const screen = await renderSingleCollection('grid', VRT_VIEWPORT_MOBILE);
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('single-collection-grid-mobile');
  });
});

describe('Single collection — list layout — visual regression', () => {
  it('renders a list collection at desktop viewport', async () => {
    const screen = await renderSingleCollection('list', VRT_VIEWPORT_DESKTOP);
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('single-collection-list-desktop');
  });
});

describe('Single collection — visual layout — visual regression', () => {
  it('renders a visual collection at desktop viewport', async () => {
    const screen = await renderSingleCollection('visual', VRT_VIEWPORT_DESKTOP);
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('single-collection-visual-desktop');
  });
});

describe('Bookmarks collection — visual regression', () => {
  it('renders bookmarks at desktop viewport', async () => {
    const screen = await renderBookmarks(VRT_VIEWPORT_DESKTOP);
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('bookmarks-collection-desktop');
  });

  it('renders bookmarks at mobile viewport', async () => {
    const screen = await renderBookmarks(VRT_VIEWPORT_MOBILE);
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('bookmarks-collection-mobile');
  });
});
