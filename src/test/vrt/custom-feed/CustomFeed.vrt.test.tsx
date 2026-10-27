// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import type { UseEntityTaggersResult } from '@/hooks/useEntityTaggers/useEntityTaggers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { formatStableRelative } from '@/test-utils/vrt.clock';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { tryResolveFeedsShellConfig } from '@/app/(feeds)/_shell/configs';
import { Custom } from '@/templates/Feed/Custom/Custom';
import { APP_ROUTES } from '@/app/routes';
import { VRT_BITCOIN_FEED } from '@/test/fixtures/feed/feedNavigation';

// Browser-mode vi.mock factories run before top-level imports resolve and have
// no synchronous require(), so each factory loads its fixture via async import
// the first time the mocked module is consumed.
const feedState = vi.hoisted(() => ({
  mode: 'populated' as 'populated' | 'empty' | 'loading',
}));

const routeState = vi.hoisted(() => ({
  feedId: 'vrt-feed-bitcoin',
}));

const fixtures = vi.hoisted(async () => {
  const [postsModule, profilesModule, whoToFollowModule, navModule, mockApp] = await Promise.all([
    import('@/test/fixtures/feed/posts'),
    import('@/test/fixtures/feed/profiles'),
    import('@/test/fixtures/feed/whoToFollow'),
    import('@/test/fixtures/feed/feedNavigation'),
    import('@/test/mocks/feedApplication'),
  ]);
  const postsByCompositeId = new Map(postsModule.VRT_FEED_POSTS.map((post) => [post.compositeId, post]));
  const orderedCompositeIds = postsModule.VRT_FEED_POSTS.map((post) => post.compositeId);
  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  return {
    postsByCompositeId,
    orderedCompositeIds,
    leadPostContent: postsModule.VRT_FEED_POSTS[0].details.content,
    profiles: profilesModule.VRT_AUTHOR_PROFILES,
    viewerPubky,
    whoToFollow: whoToFollowModule.VRT_WHO_TO_FOLLOW,
    homeFilters: navModule.VRT_HOME_FILTERS,
    mockFeedApplication: mockApp.mockFeedApplication,
  };
});

vi.mock('next/navigation', async () => {
  const { APP_ROUTES } = await import('@/app/routes');
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
    usePathname: () => `${APP_ROUTES.FEED}/${routeState.feedId}`,
    useSearchParams: () => searchParams,
    useParams: () => ({ id: routeState.feedId }),
  };
});

// FeedNavigation and useCustomFeed read Dexie through async live queries.
// Resolve those promises into React state so the tab strip and saved filters
// leave their initial empty frame. Tests wait for the feed name first.
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
      setTaggedAsActive: vi.fn(),
      applyDefaultReach: vi.fn(),
      setContent: vi.fn(),
      setProfileTags: vi.fn(),
      addProfileTag: vi.fn(),
      removeProfileTag: vi.fn(),
      clearProfileTags: vi.fn(),
      setHasHydrated: vi.fn(),
      reset: vi.fn(),
    }),
  };
});

vi.mock('@/stores/auth/auth.store', async () => {
  const f = await fixtures;
  const { mockRingSession } = await import('@/test-utils/pubky');
  return {
    useAuthStore: createZustandLikeHook({
      currentUserPubky: f.viewerPubky,
      session: mockRingSession(['/:rw'], f.viewerPubky),
      restoreStatus: 'ready',
      sessionExport: null,
      hasProfile: true,
      hasHydrated: true,
      isRestoringSession: false,
      isLoggingOut: false,
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

// MobileFooter (mounted by ContentLayout) pulls notification + local-files
// snapshots; return empty/zero state so the footer renders a neutral chrome.
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

vi.mock('@/hooks/useKeyboardVisible/useKeyboardVisible', () => ({
  useKeyboardVisible: () => false,
}));

vi.mock('@/hooks/useStreamPagination/useStreamPagination', async () => {
  const f = await fixtures;
  const shared = {
    error: null,
    hasMore: false,
    loadMore: async () => {},
    refresh: async () => {},
    prependPosts: async () => {},
    removePosts: () => {},
  };
  // One stable object per mode. A fresh `postIds` identity on every call would
  // cascade into effect deps and re-render loops.
  const results = {
    populated: { ...shared, postIds: f.orderedCompositeIds, loading: false, loadingMore: false },
    empty: { ...shared, postIds: [] as string[], loading: false, loadingMore: false },
    loading: { ...shared, postIds: [] as string[], loading: true, loadingMore: false },
  };
  return {
    useStreamPagination: () => results[feedState.mode],
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

vi.mock('@/hooks/useRelativeTime/useRelativeTime', () => {
  const result = { formatRelativeTime: formatStableRelative };
  return { useRelativeTime: () => result };
});

vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => {
  const noopRef = () => {};
  const result = { ref: noopRef };
  return { useTtlSubscription: () => result };
});

// Keep the real header-visibility logic. Mock only repost data so these
// screenshots catch accidental nested cards.
vi.mock('@/hooks/useRepostInfo/useRepostInfo', async () => {
  const f = await fixtures;
  const { buildCompositeIdFromPubkyUri } = await import('@/models/models.utils');
  const { CompositeIdDomain } = await import('@/models/models.types');
  const cache = new Map();
  return {
    useRepostInfo: (compositeId: string) => {
      const cached = cache.get(compositeId);
      if (cached) return cached;
      const fixture = f.postsByCompositeId.get(compositeId);
      const uri = fixture?.relationships.reposted;
      const result = {
        isRepost: !!uri,
        isReply: false,
        isCurrentUserRepost: !!uri && fixture?.details.author === f.viewerPubky,
        repostAuthorId: uri ? fixture?.details.author : null,
        originalPostId: uri ? buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS }) : null,
        isLoading: false,
        hasError: false,
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
    useEntityTags: (taggedId: string) => {
      const cached = cache.get(taggedId);
      if (cached) return cached;
      const fixture = f.postsByCompositeId.get(taggedId);
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

vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: (tags: unknown[]) => ({ enrichedTags: tags, isLoading: false }),
}));

vi.mock('@/hooks/usePostTags/usePostTags', async () => {
  const f = await fixtures;
  const empty = {
    tags: [] as unknown[],
    count: 0,
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    loadMore: async () => {},
    handleTagAdd: async () => ({ success: true }),
    handleTagToggle: async () => {},
  };
  const cache = new Map<string, typeof empty>();
  return {
    usePostTags: (postId: string) => {
      const cached = cache.get(postId);
      if (cached) return cached;
      const tags = (f.postsByCompositeId.get(postId)?.tags ?? []).map((tag) => ({
        ...tag,
        taggers: (tag.taggers ?? []).map((id) => ({ id, name: f.profiles[id]?.name, avatarUrl: undefined })),
      }));
      const result = { ...empty, tags, count: tags.length };
      cache.set(postId, result);
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

// Header search stays closed. The right rail's Hot tags section renders empty.
vi.mock('@/hooks/useHotTags/useHotTags', () => {
  const result = { tags: [], rawTags: [], isLoading: false, error: null, refetch: async () => {} };
  return { useHotTags: () => result };
});

vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', () => {
  const result = { tags: [], users: [], isLoading: false, error: null };
  return { useSearchAutocomplete: () => result };
});

vi.mock('@/application/feed/feed', async () => {
  const f = await fixtures;
  return { FeedApplication: f.mockFeedApplication };
});

// Attachment metadata is unused by these captures (no resolved files), but the
// hook must not hit IndexedDB. A stable result keeps post cards from looping.
vi.mock('@/hooks/useAttachmentsMetadata/useAttachmentsMetadata', () => {
  const result = { files: [] as [], isLoading: false };
  return { useAttachmentsMetadata: () => result };
});

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: () => null,
    getFileUrl: () => null,
    getMetadata: async () => [],
    fetchFiles: async () => [],
  },
}));

vi.mock('@/controllers/search/search', () => ({
  SearchController: {
    fetchUsersById: async () => [],
    getUsersByName: async () => [],
    getTagsByPrefix: async () => [],
  },
}));

const MISSING_FEED_ID = 'vrt-feed-missing';

const VIEWPORTS = [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const;

// The shell depends only on the `/feed/` prefix, not the id.
const customFeedShell = tryResolveFeedsShellConfig(`${APP_ROUTES.FEED}/${VRT_BITCOIN_FEED.id}`)!;

function CustomFeedPage() {
  return (
    <>
      <Header />
      <ContentLayout {...customFeedShell}>
        <Custom />
      </ContentLayout>
    </>
  );
}

async function leadPostContent() {
  return (await fixtures).leadPostContent;
}

/** Tabs mount only after the feed list resolves; icon chunks load after that. */
async function waitForFeedTabs() {
  await expect.element(page.getByRole('link', { name: VRT_BITCOIN_FEED.name, exact: true })).toBeVisible();
  await expect
    .poll(() => document.querySelector(`[data-testid="${VRT_ROOT_TESTID}"] svg.lucide:not(:has(*))`), {
      timeout: 8_000,
    })
    .toBeNull();
}

async function renderCustomFeed(viewport: { width: number; height: number }) {
  await preloadImages(['/pubky-logo.svg']);
  const screen = await renderForVRT(<CustomFeedPage />, { viewport });
  await waitForFeedTabs();
  return screen;
}

function isDesktop(viewport: { width: number }) {
  return viewport.width >= VRT_VIEWPORT_DESKTOP.width;
}

async function expectSavedFeedFilters() {
  const reach = page.getByTestId('filter-reach-radiogroup');
  const sort = page.getByTestId('filter-sort-radiogroup');
  const content = page.getByTestId('filter-content-radiogroup');
  await expect
    .element(reach.getByRole('radio', { name: 'Following', exact: true }))
    .toHaveAttribute('aria-checked', 'true');
  await expect
    .element(sort.getByRole('radio', { name: 'Popularity', exact: true }))
    .toHaveAttribute('aria-checked', 'true');
  await expect
    .element(content.getByRole('radio', { name: 'Posts', exact: true }))
    .toHaveAttribute('aria-checked', 'true');
  await expect.element(page.getByTestId('custom-feed-post-tags').getByText('bitcoin', { exact: true })).toBeVisible();
  await expect.element(page.getByTestId('custom-feed-post-tags').getByText('lightning', { exact: true })).toBeVisible();
  await expect
    .element(page.getByTestId('custom-feed-profile-tags').getByText('bitcoiner', { exact: true }))
    .toBeVisible();
}

beforeEach(() => {
  feedState.mode = 'populated';
  routeState.feedId = VRT_BITCOIN_FEED.id;
});

describe('Custom feed — populated', () => {
  it.each(VIEWPORTS)('renders a saved feed on %s', async (name, viewport) => {
    await renderCustomFeed(viewport);
    await expect
      .element(page.getByRole('link', { name: VRT_BITCOIN_FEED.name, exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(page.getByText(await leadPostContent())).toBeVisible();
    if (isDesktop(viewport)) await expectSavedFeedFilters();
    await matchVrtFrameScreenshot(`custom-feed-populated-${name}`);
  });
});

describe('Custom feed — empty', () => {
  it.each(VIEWPORTS)('renders no matching posts on %s', async (name, viewport) => {
    feedState.mode = 'empty';
    const screen = await renderCustomFeed(viewport);
    await expect
      .element(page.getByRole('link', { name: VRT_BITCOIN_FEED.name, exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(screen.getByPlaceholder("What's on your mind?")).toBeVisible();
    await expect.element(page.getByText('No posts found')).toBeVisible();
    await expect.element(page.getByText(await leadPostContent())).not.toBeInTheDocument();
    if (isDesktop(viewport)) await expectSavedFeedFilters();
    await matchVrtFrameScreenshot(`custom-feed-empty-${name}`);
  });
});

describe('Custom feed — loading', () => {
  it.each(VIEWPORTS)('renders timeline skeletons on %s', async (name, viewport) => {
    feedState.mode = 'loading';
    const screen = await renderCustomFeed(viewport);
    await expect
      .element(page.getByRole('link', { name: VRT_BITCOIN_FEED.name, exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(screen.getByPlaceholder("What's on your mind?")).toBeVisible();
    await expect.element(page.getByText(await leadPostContent())).not.toBeInTheDocument();
    await expect.element(page.getByText('No posts found')).not.toBeInTheDocument();
    if (isDesktop(viewport)) await expectSavedFeedFilters();
    await matchVrtFrameScreenshot(`custom-feed-loading-${name}`);
  });
});

// An unknown id never resolves a stream (`useCustomStreamId` returns undefined),
// so the body stays on the timeline skeleton and the composer is not mounted.
// The tab strip still lists the saved feeds, none of them current.
describe('Custom feed — not found', () => {
  it.each(VIEWPORTS)('renders an unknown feed id on %s', async (name, viewport) => {
    routeState.feedId = MISSING_FEED_ID;
    const screen = await renderCustomFeed(viewport);
    await expect
      .element(page.getByRole('link', { name: VRT_BITCOIN_FEED.name, exact: true }))
      .not.toHaveAttribute('aria-current', 'page');
    await expect.element(screen.getByPlaceholder("What's on your mind?")).not.toBeInTheDocument();
    await expect.element(page.getByText('No posts found')).not.toBeInTheDocument();
    if (isDesktop(viewport)) {
      await expect
        .element(page.getByTestId('filter-reach-radiogroup').getByRole('radio', { name: 'All', exact: true }))
        .toHaveAttribute('aria-checked', 'true');
      await expect
        .element(page.getByTestId('filter-sort-radiogroup').getByRole('radio', { name: 'Recent', exact: true }))
        .toHaveAttribute('aria-checked', 'true');
      await expect
        .element(page.getByTestId('filter-content-radiogroup').getByRole('radio', { name: 'All', exact: true }))
        .toHaveAttribute('aria-checked', 'true');
      expect(document.querySelector('[data-testid="custom-feed-post-tags"]')).toBeNull();
      expect(document.querySelector('[data-testid="custom-feed-profile-tags"]')).toBeNull();
    }
    await matchVrtFrameScreenshot(`custom-feed-not-found-${name}`);
  });
});
