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
import { Collections } from '@/templates/Collections/Collections';

// Browser-mode vi.mock factories run before top-level imports resolve and have
// no synchronous require(), so each factory loads its fixture via async import
// the first time the mocked module is consumed.
const fixtures = vi.hoisted(async () => {
  const [collectionsModule, profilesModule, navModule, mockApp] = await Promise.all([
    import('@/test/fixtures/feed/collections'),
    import('@/test/fixtures/feed/profiles'),
    import('@/test/fixtures/feed/feedNavigation'),
    import('@/test/mocks/feedApplication'),
  ]);
  const collectionsByCompositeId = new Map(
    collectionsModule.VRT_ALL_COLLECTIONS.map((collection) => [collection.compositeId, collection]),
  );
  const myCollectionIds = collectionsModule.VRT_MY_COLLECTIONS.map((c) => c.compositeId);
  const followedCollectionIds = collectionsModule.VRT_FOLLOWED_COLLECTIONS.map((c) => c.compositeId);
  const discoverCollectionIds = collectionsModule.VRT_DISCOVER_COLLECTIONS.map((c) => c.compositeId);
  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  return {
    collectionsByCompositeId,
    myCollectionIds,
    followedCollectionIds,
    discoverCollectionIds,
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
  const params = {};
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => router,
    usePathname: () => '/collections',
    useSearchParams: () => searchParams,
    useParams: () => params,
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

// My Collections paginates authored collection posts via this hook.
vi.mock('@/hooks/useStreamPagination/useStreamPagination', async () => {
  const f = await fixtures;
  const result = {
    postIds: f.myCollectionIds,
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: false,
    loadMore: async () => {},
    refresh: async () => {},
    prependPosts: async () => {},
    removePosts: () => {},
  };
  return { useStreamPagination: () => result };
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
      const fixture = f.collectionsByCompositeId.get(compositeId);
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
      const fixture = f.collectionsByCompositeId.get(compositeId);
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

vi.mock('@/hooks/useEntityTags/useEntityTags', async () => {
  const f = await fixtures;
  const noopToggle = async () => {};
  const noopAdd = async () => ({ success: true });
  const isViewerTagger = () => false;
  const cache = new Map<string, unknown>();
  return {
    useEntityTags: (taggedId: string) => {
      const cached = cache.get(taggedId);
      if (cached) return cached;
      const fixture = f.collectionsByCompositeId.get(taggedId);
      const tags = (fixture?.tags ?? []).map((tag) => ({ ...tag, taggers_avatars: [] }));
      const result = {
        tags,
        count: tags.length,
        isLoading: false as const,
        isViewerTagger,
        handleTagToggle: noopToggle,
        handleTagAdd: noopAdd,
      };
      cache.set(taggedId, result);
      return result;
    },
  };
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
      bookmarkCount: 12,
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

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: () => null,
    getFileUrl: () => null,
  },
}));

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

describe('Collections overview — visual regression', () => {
  it('renders the collections overview at desktop viewport', async () => {
    const screen = await renderForVRT(<CollectionsWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expectCollectionsOverviewReady(screen);
    // Viewport-clamped root: first fold (My + start of Followed/Discover).
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('collections-overview-desktop');
  });

  it('renders the collections overview at mobile viewport', async () => {
    const screen = await renderForVRT(<CollectionsWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await expectCollectionsOverviewReady(screen);
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('collections-overview-mobile');
  });
});
