// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT, waitForMarkdownEditorReady } from '@/test-utils/vrt';
import { formatStableRelative } from '@/test-utils/vrt.clock';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { COMPOSER_EXPAND_DURATION } from '@/libs/motion/composerMotion';
import { Header } from '@/organisms/Header/Header';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { tryResolveFeedsShellConfig } from '@/app/(main)/(feeds)/_shell/configs';
import { Home } from '@/templates/Feed/Home/Home';
import { Fab } from '@/molecules/Fab/Fab';

// Browser-mode vi.mock factories run before top-level imports resolve and have
// no synchronous require(), so each factory loads its fixture via async import
// the first time the mocked module is consumed. The fixture modules are pure
// data so the per-factory cost is negligible.
//
// Default Home screenshots keep `VRT_FEED_POSTS` only. Article-in-feed tests
// prepend `VRT_ARTICLE` via this flag so existing baselines stay put.
const feedState = vi.hoisted(() => ({
  mode: 'default' as 'default' | 'article',
}));

const fixtures = vi.hoisted(async () => {
  const [postsModule, articleModule, profilesModule, whoToFollowModule, navModule, mockApp] = await Promise.all([
    import('@/test/fixtures/feed/posts'),
    import('@/test/fixtures/post/article'),
    import('@/test/fixtures/feed/profiles'),
    import('@/test/fixtures/feed/whoToFollow'),
    import('@/test/fixtures/feed/feedNavigation'),
    import('@/test/mocks/feedApplication'),
  ]);
  const postsByCompositeId = new Map(postsModule.VRT_FEED_POSTS.map((post) => [post.compositeId, post]));
  postsByCompositeId.set(articleModule.VRT_ARTICLE.compositeId, articleModule.VRT_ARTICLE);
  const orderedCompositeIds = postsModule.VRT_FEED_POSTS.map((post) => post.compositeId);
  const articleFeedPostIds = [articleModule.VRT_ARTICLE.compositeId, ...orderedCompositeIds];
  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  return {
    postsByCompositeId,
    orderedCompositeIds,
    articleFeedPostIds,
    articleTitle: articleModule.VRT_ARTICLE_TITLE,
    articleCoverUrl: articleModule.VRT_ARTICLE_COVER_URL,
    articleCoverName: articleModule.VRT_ARTICLE_COVER_NAME,
    articleCoverByUri: new Map([[articleModule.VRT_ARTICLE_COVER_URI, articleModule.VRT_ARTICLE_COVER_METADATA]]),
    articleCoverUrls: { [articleModule.VRT_ARTICLE_COVER_FILE_ID]: articleModule.VRT_ARTICLE_COVER_URL },
    profiles: profilesModule.VRT_AUTHOR_PROFILES,
    viewerPubky,
    whoToFollow: whoToFollowModule.VRT_WHO_TO_FOLLOW,
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
    usePathname: () => '/home',
    useSearchParams: () => searchParams,
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
  }),
}));

vi.mock('@/hooks/useKeyboardOffset/useKeyboardOffset', () => ({
  useKeyboardOffset: () => ({ isKeyboardVisible: false, keyboardOffset: 0 }),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({ isPublicRoute: false }),
}));

vi.mock('@/hooks/useStreamPagination/useStreamPagination', async () => {
  const f = await fixtures;
  const shared = {
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: false,
    loadMore: async () => {},
    refresh: async () => {},
    prependPosts: async () => {},
    removePosts: () => {},
  };
  const defaultResult = { ...shared, postIds: f.orderedCompositeIds };
  const articleResult = { ...shared, postIds: f.articleFeedPostIds };
  return {
    useStreamPagination: () => (feedState.mode === 'article' ? articleResult : defaultResult),
  };
});

vi.mock('@/hooks/useUserStream/useUserStream', async () => {
  const f = await fixtures;
  // Compute these once so the mock returns stable references; new array
  // identities on every call cascade into useEffect deps and trigger render
  // loops.
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

// Intentionally NOT mocked: the real `useElementHeight` uses ResizeObserver,
// which is available in Chromium. Mocking it with a fixed `height` value
// breaks layout — `PostThreadConnector` consumes that height, and because the
// connector sits in a flex row with the card under `align-items: stretch`, a
// hardcoded connector height stretches the card to match (e.g., the
// `QuickReply` "Do you agree?" card visibly oversized at >200px).

vi.mock('@/hooks/usePostHeaderVisibility/usePostHeaderVisibility', async () => {
  const f = await fixtures;
  const cache = new Map<string, { showRepostHeader: boolean; shouldShowPostHeader: boolean }>();
  return {
    usePostHeaderVisibility: (compositeId: string) => {
      const cached = cache.get(compositeId);
      if (cached) return cached;
      const result = {
        showRepostHeader: !!f.postsByCompositeId.get(compositeId)?.relationships.reposted,
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

// Header (and its descendants) hooks. Header → HeaderSignIn → SearchInput pulls
// in fetch-and-cache data hooks that would otherwise hit the network/IndexedDB.
// Each mock returns the closed/empty state since the screenshot shows the
// header in its default unfocused form.
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

vi.mock('@/controllers/file/file', async () => {
  const f = await fixtures;
  return {
    FileController: {
      getAvatarUrl: (userDetails: { image: string | null } | null | undefined) => userDetails?.image ?? null,
      getFileUrl: ({ fileId }: { fileId: string }) => f.articleCoverUrls[fileId] ?? null,
      getMetadata: async ({ fileAttachments }: { fileAttachments: string[] }) =>
        fileAttachments.flatMap((uri) => {
          const meta = f.articleCoverByUri.get(uri);
          return meta ? [meta] : [];
        }),
      fetchFiles: async () => [],
    },
  };
});

vi.mock('@/controllers/search/search', () => ({
  SearchController: {
    fetchUsersById: async () => [],
    getUsersByName: async () => [],
    getTagsByPrefix: async () => [],
  },
}));

// Home only renders the center column; sidebars live in (feeds)/layout.tsx's
// ContentLayout. Resolve the same shell config here so VRT matches prod.
const homeShellConfig = tryResolveFeedsShellConfig('/home')!;

function HomeWithLayout() {
  return (
    <>
      <Header />
      <ContentLayout {...homeShellConfig}>
        <Home />
      </ContentLayout>
    </>
  );
}

function HomeWithFab() {
  return (
    <>
      <HomeWithLayout />
      <Fab />
    </>
  );
}

async function waitForComposerMotion() {
  // Expand tween is 280ms plus a 100ms settle in `useComposerHeightAnimation`.
  // A shorter wait can screenshot while the card still clips the textarea.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, Math.ceil(COMPOSER_EXPAND_DURATION * 1000) + 150);
  });
}

async function expandFirstQuickReply(screen: Awaited<ReturnType<typeof renderForVRT>>) {
  const textarea = screen.getByTestId('quick-reply-textarea').first();
  await textarea.click();
  await expect(screen.getByTestId('quick-reply-expanded-content')).toBeVisible();
  await waitForComposerMotion();
  // Re-click after the expand tween so `:focus-within` hides the prompt.
  // `matchVrtFrameScreenshot` parks the pointer only — it must not steal focus.
  await textarea.click();
  await expect.element(textarea).toHaveFocus();
}

async function waitForArticleComposer() {
  await expect.element(page.getByPlaceholder('Article Title')).toBeVisible();
  await expect.element(page.getByText('Add image')).toBeVisible();
  await expect.element(page.getByText('Publish')).toBeVisible();
  await waitForMarkdownEditorReady();
}

describe('Home (global feed) — visual regression', () => {
  beforeEach(() => {
    feedState.mode = 'default';
  });

  it('renders the global feed at desktop viewport', async () => {
    await renderForVRT(<HomeWithLayout />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtFrameScreenshot('home-feed-desktop');
  });

  it('renders the global feed at mobile viewport', async () => {
    await renderForVRT(<HomeWithLayout />, { viewport: VRT_VIEWPORT_MOBILE });
    await matchVrtFrameScreenshot('home-feed-mobile');
  });

  it('renders an expanded QuickReply at desktop viewport', async () => {
    const screen = await renderForVRT(<HomeWithLayout />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expandFirstQuickReply(screen);
    await matchVrtFrameScreenshot('home-feed-quick-reply-expanded-desktop');
  });

  it('renders an expanded QuickReply at mobile viewport', async () => {
    const screen = await renderForVRT(<HomeWithLayout />, { viewport: VRT_VIEWPORT_MOBILE });
    await expandFirstQuickReply(screen);
    await matchVrtFrameScreenshot('home-feed-quick-reply-expanded-mobile');
  });
});

describe('Home — article in feed — visual regression', () => {
  beforeEach(() => {
    feedState.mode = 'article';
  });

  async function renderHomeWithArticle(viewport: { width: number; height: number }) {
    const f = await fixtures;
    await preloadImages(['/pubky-logo.svg', f.articleCoverUrl]);
    const screen = await renderForVRT(<HomeWithLayout />, { viewport });
    await expect.element(screen.getByText(f.articleTitle)).toBeVisible();
    await expect.element(screen.getByAltText(f.articleCoverName)).toBeVisible();
  }

  it('renders an article card at desktop viewport', async () => {
    await renderHomeWithArticle(VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('home-feed-article-desktop');
  });

  it('renders an article card at mobile viewport', async () => {
    await renderHomeWithArticle(VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('home-feed-article-mobile');
  });
});

describe('Home — creating article via feed composer — visual regression', () => {
  beforeEach(() => {
    feedState.mode = 'default';
  });

  async function renderHomeCreatingArticle(viewport: { width: number; height: number }) {
    const screen = await renderForVRT(<HomeWithLayout />, { viewport });
    await screen.getByPlaceholder("What's on your mind?").click();
    await expect.element(screen.getByLabelText('Add article')).toBeVisible();
    await waitForComposerMotion();
    await screen.getByLabelText('Add article').click();
    await waitForArticleComposer();
    await waitForComposerMotion();
  }

  it('renders article mode in the feed composer at desktop viewport', async () => {
    await renderHomeCreatingArticle(VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('home-feed-create-article-desktop');
  });

  it('renders article mode in the feed composer at mobile viewport', async () => {
    await renderHomeCreatingArticle(VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('home-feed-create-article-mobile');
  });
});

describe('New article dialog — visual regression', () => {
  beforeEach(() => {
    feedState.mode = 'default';
  });

  async function renderNewArticleDialog(viewport: { width: number; height: number }) {
    await renderForVRT(<HomeWithFab />, { viewport });
    await page.getByTestId('new-post-cta').click();
    await expect.element(page.getByTestId('dialog-content')).toBeVisible();
    await page.getByLabelText('Add article').click();
    await waitForArticleComposer();
    await waitForComposerMotion();
  }

  it('renders the new article dialog at desktop viewport', async () => {
    await renderNewArticleDialog(VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('dialog-new-article-desktop');
  });

  it('renders the new article dialog at mobile viewport', async () => {
    await renderNewArticleDialog(VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('dialog-new-article-mobile');
  });
});
