// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { formatStableRelative } from '@/test-utils/vrt.clock';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { tryResolveFeedsShellConfig } from '@/app/(feeds)/_shell/configs';
import { Search } from '@/templates/Feed/Search/Search';

// Browser-mode vi.mock factories run before top-level imports resolve and have
// no synchronous require(), so each factory loads its fixture via async import
// the first time the mocked module is consumed.
const fixtures = vi.hoisted(async () => {
  const [postsModule, profilesModule, whoToFollowModule, navModule, collectionsModule, mockApp] = await Promise.all([
    import('@/test/fixtures/feed/posts'),
    import('@/test/fixtures/feed/profiles'),
    import('@/test/fixtures/feed/whoToFollow'),
    import('@/test/fixtures/feed/feedNavigation'),
    import('@/test/fixtures/feed/collections'),
    import('@/test/mocks/feedApplication'),
  ]);
  // Tagged-results case renders the SearchCollections section: 5 fixtures give
  // a deterministic preview-of-4 plus a visible "See all" pill.
  const searchCollections = [
    ...collectionsModule.VRT_MY_COLLECTIONS,
    ...collectionsModule.VRT_DISCOVER_COLLECTIONS.slice(0, 3),
  ];
  const searchCollectionIds = searchCollections.map((collection) => collection.compositeId);
  type SearchVrtEntry = (typeof postsModule.VRT_FEED_POSTS)[number] | (typeof searchCollections)[number];
  const postsByCompositeId = new Map<string, SearchVrtEntry>([
    ...postsModule.VRT_FEED_POSTS.map((post) => [post.compositeId, post] as const),
    ...searchCollections.map((collection) => [collection.compositeId, collection] as const),
  ]);
  // Tagged-results case searches `pubky` + `design` — only return posts that carry those labels.
  const taggedSearchCompositeIds = postsModule.VRT_FEED_POSTS.filter((post) =>
    post.tags.some((tag) => tag.label === 'pubky' || tag.label === 'design'),
  ).map((post) => post.compositeId);
  // People section fixtures: 5 users give a deterministic preview-of-4 plus a
  // visible "See all" pill. Stats/tags are static so baselines stay stable.
  const searchPeopleKeys = ['bran', 'cleo', 'dion', 'eira', 'fynn'] as const;
  const searchPeople = searchPeopleKeys.map((key, index) => {
    const id = profilesModule.VRT_AUTHOR_PUBKYS[key];
    return {
      id,
      name: profilesModule.VRT_AUTHOR_PROFILES[id]?.name ?? key,
      avatarUrl: null,
      stats: { tags: 34 - index * 3, posts: 120 - index * 7 },
      isFollowing: index === 1,
    };
  });
  // Profile tag chips served through the useEntityTags mock, keyed by pubky.
  const userTagsByPubky = Object.fromEntries(
    searchPeople.map((person, index) => [
      person.id,
      [
        {
          label: index % 2 === 0 ? 'pubky' : 'design',
          taggers: [],
          taggers_count: 3 + index,
          relationship: false,
        },
      ],
    ]),
  );
  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  // Profile autocomplete results (same shape as useSearchAutocomplete → SearchUsersSection).
  // Pubky ids follow the existing VRT author convention (`…alice01`, `…bran02`, …).
  // Display names are Ali*-prefixed fixtures for the typed query in the profile-results case.
  const autocompleteUsers = (
    [
      { key: 'alice' as const, name: 'Alice Mercado' },
      { key: 'bran' as const, name: 'Alicia Ortega' },
      { key: 'cleo' as const, name: 'Alina Croft' },
      { key: 'dion' as const, name: 'Ali Reza' },
      { key: 'eira' as const, name: 'Alison Hale' },
    ] as const
  ).map(({ key, name }) => ({
    id: profilesModule.VRT_AUTHOR_PUBKYS[key],
    name,
    avatarUrl: undefined as string | undefined,
  }));
  return {
    postsByCompositeId,
    taggedSearchCompositeIds,
    searchCollectionIds,
    searchPeople,
    userTagsByPubky,
    collectionCoverUrls: collectionsModule.VRT_COLLECTION_COVER_URLS,
    profiles: profilesModule.VRT_AUTHOR_PROFILES,
    viewerPubky,
    whoToFollow: whoToFollowModule.VRT_WHO_TO_FOLLOW,
    homeFilters: navModule.VRT_HOME_FILTERS,
    mockFeedApplication: mockApp.mockFeedApplication,
    autocompleteUsers,
  };
});

// Mutable so empty / tagged / profile cases share one mock graph.
const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

// Forces the search suggestions panel open with a typed query for profile results.
// Empty/tagged leave these defaults so the dropdown stays closed.
const searchInputUi = vi.hoisted(() => ({
  inputValue: '',
  isFocused: false,
}));

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
  return {
    useRouter: () => router,
    usePathname: () => '/search',
    useSearchParams: () => navigation.searchParams,
    useParams: () => params,
  };
});

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: <T,>(fn: () => T | Promise<T>, _deps?: unknown[], initial?: T): T => {
    const result = fn();
    if (result instanceof Promise) return initial as T;
    return result;
  },
}));

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
      setShowSignInDialog: vi.fn(),
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
  usePublicRoute: () => ({ isPublicRoute: false }),
}));

// SearchCollections queries the tagged collection stream; the posts feed
// queries everything else. Route by stream shape so each surface gets its own
// stable fixture slice.
vi.mock('@/hooks/useStreamPagination/useStreamPagination', async () => {
  const f = await fixtures;
  const cache = new Map<string, unknown>();
  return {
    useStreamPagination: ({ streamId }: { streamId: string }) => {
      const cached = cache.get(streamId);
      if (cached) return cached;
      const result = {
        postIds: streamId.includes(':collection:') ? f.searchCollectionIds : f.taggedSearchCompositeIds,
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: async () => {},
        refresh: async () => {},
        prependPosts: async () => {},
        removePosts: () => {},
      };
      cache.set(streamId, result);
      return result;
    },
  };
});

vi.mock('@/hooks/useUserStream/useUserStream', async () => {
  const f = await fixtures;
  const usersSnapshot = [...f.whoToFollow];
  const userIdsSnapshot = f.whoToFollow.map((user) => user.id);
  const result = {
    users: usersSnapshot,
    userIds: userIdsSnapshot,
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: null,
    loadMore: async () => {},
    refetch: async () => {},
  };
  return { useUserStream: () => result };
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
      const fixture = f.postsByCompositeId.get(compositeId);
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
      const fixture = f.postsByCompositeId.get(compositeId);
      const result = { postCounts: fixture?.counts ?? ZERO_COUNTS, isLoading: false as const };
      cache.set(compositeId, result);
      return result;
    },
  };
});

vi.mock('@/hooks/useBookmark/useBookmark', () => {
  const noopToggle = async () => {};
  const result = { isBookmarked: false, isLoading: false, isToggling: false, toggle: noopToggle };
  return { useBookmark: () => result };
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

// CollectionCard resolves its author through useUserProfile.
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

vi.mock('@/hooks/useDeletePost/useDeletePost', () => ({
  useDeletePost: () => ({ deletePost: async () => {}, isDeleting: false }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    requireAuth: (action: () => void) => action(),
    isAuthenticated: true,
  }),
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

vi.mock('@/hooks/usePostHeaderVisibility/usePostHeaderVisibility', async () => {
  const f = await fixtures;
  const cache = new Map<string, { showRepostHeader: boolean; shouldShowPostHeader: boolean }>();
  return {
    usePostHeaderVisibility: (compositeId: string) => {
      const cached = cache.get(compositeId);
      if (cached) return cached;
      // Collection fixtures carry no relationships — only feed posts can repost.
      const entry = f.postsByCompositeId.get(compositeId);
      const result = {
        showRepostHeader: !!(entry && 'relationships' in entry && entry.relationships.reposted),
        shouldShowPostHeader: true,
      };
      cache.set(compositeId, result);
      return result;
    },
  };
});

vi.mock('@/hooks/useEntityTags/useEntityTags', async () => {
  const f = await fixtures;
  const noopToggle = async () => {};
  const noopAdd = async () => ({ success: true });
  const isViewerTagger = () => false;
  const cache = new Map<string, unknown>();
  return {
    useEntityTags: (taggedId: string, taggedKind?: string) => {
      const cacheKey = `${taggedKind ?? 'post'}:${taggedId}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      // Dispatch on the kind production passes: user profile chips (People
      // section) resolve by pubky, everything else by post composite id.
      const rawTags =
        taggedKind === 'user' ? (f.userTagsByPubky[taggedId] ?? []) : (f.postsByCompositeId.get(taggedId)?.tags ?? []);
      const tags = rawTags.map((tag) => ({ ...tag, taggers_avatars: [] }));
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

// People section data — served fully hydrated so the section renders without
// touching the search/user controllers.
vi.mock('@/hooks/useSearchPeople/useSearchPeople', async () => {
  const f = await fixtures;
  const result = {
    users: f.searchPeople,
    loading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: async () => {},
  };
  return { useSearchPeople: () => result };
});

vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: <T,>(tags: T[]) => ({ enrichedTags: tags, isLoading: false }),
}));

vi.mock('@/hooks/usePostTaggers/usePostTaggers', () => {
  const result = {
    taggersByLabel: new Map<string, string[]>(),
    taggerStates: new Map<string, { isLoading: boolean; error: string | null }>(),
    fetchAllTaggers: async () => {},
  };
  return { usePostTaggers: () => result };
});

vi.mock('@/hooks/useThreadReplies/useThreadReplies', () => {
  const result = { replyIds: [] as string[], isLoading: false, hasMore: false, loadMore: async () => {} };
  return { useThreadReplies: () => result };
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

vi.mock('@/hooks/useHotTags/useHotTags', () => {
  const result = { tags: [], rawTags: [], isLoading: false, error: null, refetch: async () => {} };
  return { useHotTags: () => result };
});

// Deterministic open/closed search field for profile-results snapshots. Empty and
// tagged cases leave `searchInputUi` cleared so suggestions stay closed.
vi.mock('@/hooks/useSearchInput/useSearchInput', async () => {
  const React = await import('react');
  // Stable function identities, matching the real hook's contract: `setInputValue`
  // is a useState setter, and SearchInput's URL-sync effect lists it as a dep — a
  // per-render vi.fn() here refires that effect every render and loops the store sync.
  const handleInputChange = vi.fn();
  const handleKeyDown = vi.fn();
  const handleFocus = () => {
    searchInputUi.isFocused = true;
  };
  const setFocus = (focused: boolean) => {
    searchInputUi.isFocused = focused;
  };
  return {
    useSearchInput: () => {
      // Real state seeded from the per-case preset: `setInputValue` must be
      // LIVE (not inert) so the full-text case exercises SearchInput's URL
      // seeding for real — if `?q=` ever stops reaching the input, the
      // content baselines show an empty bar and the diff fails.
      const [inputValue, setInputValue] = React.useState(searchInputUi.inputValue);
      const containerRef = React.useRef<HTMLDivElement>(null);
      const inputRef = React.useRef<HTMLInputElement>(null);
      return {
        inputValue,
        isFocused: searchInputUi.isFocused,
        containerRef,
        inputRef,
        handleInputChange,
        handleKeyDown,
        handleFocus,
        clearInputValue: () => setInputValue(''),
        setInputValue,
        setFocus,
      };
    },
  };
});

// Tags pivot row on the full-text results page — deterministic prefix matches
// for the `bitcoin design` query (exact terms first, then extensions).
vi.mock('@/hooks/useContentSearchTags/useContentSearchTags', () => ({
  useContentSearchTags: (query: string | null) => ({
    tags: query === null ? [] : ['bitcoin', 'design', 'bitcoiners', 'design-systems'],
    isLoading: false,
  }),
}));

// When the field is focused with a query, return fixture users (by_name / by_id path).
vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', async () => {
  const f = await fixtures;
  const empty = { tags: [] as { name: string }[], users: [] as typeof f.autocompleteUsers, isLoading: false };
  return {
    useSearchAutocomplete: ({ query, enabled = true }: { query: string; enabled?: boolean }) => {
      if (!enabled || !query.trim()) return empty;
      return {
        tags: [{ name: 'alice' }, { name: 'alias' }],
        users: f.autocompleteUsers.filter((user) => user.name.toLowerCase().startsWith(query.trim().toLowerCase())),
        isLoading: false,
      };
    },
  };
});

vi.mock('@/application/feed/feed', async () => {
  const f = await fixtures;
  return { FeedApplication: f.mockFeedApplication };
});

vi.mock('@/controllers/file/file', async () => {
  const f = await fixtures;
  return {
    FileController: {
      getAvatarUrl: (userDetails: { image: string | null } | null | undefined) => userDetails?.image ?? null,
      // Collection card covers resolve through getFileUrl.
      getFileUrl: ({ fileId }: { fileId: string }) => f.collectionCoverUrls[fileId] ?? null,
      getMetadata: async () => [],
      fetchFiles: async () => [],
    },
  };
});

const searchShellConfig = tryResolveFeedsShellConfig('/search')!;

function SearchWithLayout() {
  return (
    <>
      <Header />
      <ContentLayout {...searchShellConfig}>
        <Search />
      </ContentLayout>
    </>
  );
}

function setSearchTags(tags: string[]) {
  navigation.searchParams = tags.length ? new URLSearchParams({ tags: tags.join(',') }) : new URLSearchParams();
}

function setContentSearchQuery(query: string) {
  navigation.searchParams = new URLSearchParams({ q: query });
}

function resetSearchInputUi() {
  searchInputUi.inputValue = '';
  searchInputUi.isFocused = false;
}

beforeEach(() => {
  setSearchTags([]);
  resetSearchInputUi();
});

describe('Search (empty state) — visual regression', () => {
  it('renders the search empty state at desktop viewport', async () => {
    await renderForVRT(<SearchWithLayout />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtFrameScreenshot('search-empty-desktop');
  });

  it('renders the search empty state at mobile viewport', async () => {
    await renderForVRT(<SearchWithLayout />, { viewport: VRT_VIEWPORT_MOBILE });
    await matchVrtFrameScreenshot('search-empty-mobile');
  });
});

// Tagged results = Collections section (preview + "See all") above the posts
// feed. Card covers are CSS backgrounds `renderForVRT` cannot await, so they
// are preloaded; explicit waits keep the screenshot off the skeleton first-paint.
async function renderTaggedSearch(viewport: { width: number; height: number }) {
  const f = await fixtures;
  await preloadImages(Object.values(f.collectionCoverUrls));

  const screen = await renderForVRT(<SearchWithLayout />, { viewport });
  await expect.element(screen.getByRole('heading', { name: 'People' })).toBeVisible();
  // The same author can also appear in the posts feed — assert the card copy.
  await expect.element(screen.getByText('Bran Ó Conaill').first()).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Collections' })).toBeVisible();
  await expect.element(screen.getByText('Local-first notes')).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Posts' })).toBeVisible();
  return screen;
}

describe('Search (tagged results) — visual regression', () => {
  // Tags mirror labels on VRT feed fixtures (`pubky`, `design`) so the section
  // content reads as a realistic `/search?tags=…` query.
  beforeEach(() => {
    setSearchTags(['pubky', 'design']);
  });

  it('renders tagged search results at desktop viewport', async () => {
    await renderTaggedSearch(VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('search-tagged-desktop');
  });

  it('renders tagged search results at mobile viewport', async () => {
    await renderTaggedSearch(VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('search-tagged-mobile');
  });
});

describe('Search (full-text results) — visual regression', () => {
  // No input preset here on purpose: SearchInput's URL-sync effect must seed
  // `?q=` into the bar itself (the mocked `setInputValue` is live), so these
  // baselines show — and guard — the query text in the input.
  beforeEach(() => {
    setContentSearchQuery('bitcoin design');
  });

  it('renders relevance-ranked content results at desktop viewport', async () => {
    const screen = await renderForVRT(<SearchWithLayout />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect.element(screen.getByPlaceholder('Search').first()).toHaveValue('bitcoin design');
    // exact: the accessible-name match is a substring match, so plain 'Tags'
    // also resolves the right sidebar's 'Hot tags' heading (strict-mode error).
    await expect.element(screen.getByRole('heading', { name: 'Tags', exact: true })).toBeVisible();
    await matchVrtFrameScreenshot('search-content-desktop');
  });

  it('renders relevance-ranked content results at mobile viewport', async () => {
    const screen = await renderForVRT(<SearchWithLayout />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect.element(screen.getByPlaceholder('Search').first()).toHaveValue('bitcoin design');
    await expect.element(screen.getByRole('heading', { name: 'Tags', exact: true })).toBeVisible();
    await matchVrtFrameScreenshot('search-content-mobile');
  });
});

describe('Search (profile results) — visual regression', () => {
  // Autocomplete users panel — UI for Nexus `search/users/by_name` / `by_id`.
  // Empty URL (no ?tags=); focused input with a name prefix opens suggestions.
  beforeEach(() => {
    searchInputUi.inputValue = 'Ali';
    searchInputUi.isFocused = true;
  });

  it('renders profile search suggestions at desktop viewport', async () => {
    const screen = await renderForVRT(<SearchWithLayout />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect.element(screen.getByRole('button', { name: 'Clear and close search' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Show all results' })).toBeVisible();
    await matchVrtFrameScreenshot('search-profiles-desktop');
  });

  it('renders profile search suggestions at mobile viewport', async () => {
    const screen = await renderForVRT(<SearchWithLayout />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect.element(screen.getByRole('button', { name: 'Clear and close search' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Show all results' })).toBeVisible();
    await matchVrtFrameScreenshot('search-profiles-mobile');
  });
});
