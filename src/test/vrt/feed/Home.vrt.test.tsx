// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import type { UseEntityTaggersResult } from '@/hooks/useEntityTaggers/useEntityTaggers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT, waitForMarkdownEditorReady } from '@/test-utils/vrt';
import { formatStableRelative } from '@/test-utils/vrt.clock';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { COMPOSER_EXPAND_DURATION } from '@/libs/motion/composerMotion';
import { Header } from '@/organisms/Header/Header';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { tryResolveFeedsShellConfig } from '@/app/(feeds)/_shell/configs';
import { Home } from '@/templates/Feed/Home/Home';
import { Fab } from '@/molecules/Fab/Fab';
import { PostMain } from '@/organisms/PostMain/PostMain';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { APP_ROUTES } from '@/app/routes';
import { LAYOUT, type LayoutType } from '@/stores/home/home.types';
import { useState } from 'react';

// Browser-mode vi.mock factories run before top-level imports resolve and have
// no synchronous require(), so each factory loads its fixture via async import
// the first time the mocked module is consumed. The fixture modules are pure
// data so the per-factory cost is negligible.
//
// Default Home screenshots keep `VRT_FEED_POSTS` only. Article-in-feed tests
// prepend `VRT_ARTICLE`, collection-in-feed tests prepend a followed
// collection, and the Visual layout swaps in `VRT_IMAGE_ONLY_POSTS` via this
// flag so existing baselines stay put.
const feedState = vi.hoisted(() => ({
  mode: 'default' as 'default' | 'article' | 'collection' | 'imageOnly',
  keyboardVisible: false,
  populatedHotTags: false,
}));
const mockRouterPush = vi.hoisted(() => vi.fn());

const fixtures = vi.hoisted(async () => {
  const [
    postsModule,
    articleModule,
    profilesModule,
    whoToFollowModule,
    navModule,
    mockApp,
    repostsModule,
    imagePostsModule,
    collectionsModule,
  ] = await Promise.all([
    import('@/test/fixtures/feed/posts'),
    import('@/test/fixtures/post/article'),
    import('@/test/fixtures/feed/profiles'),
    import('@/test/fixtures/feed/whoToFollow'),
    import('@/test/fixtures/feed/feedNavigation'),
    import('@/test/mocks/feedApplication'),
    import('@/test/fixtures/feed/reposts'),
    import('@/test/fixtures/feed/imagePosts'),
    import('@/test/fixtures/feed/collections'),
  ]);
  const postsByCompositeId = new Map(postsModule.VRT_FEED_POSTS.map((post) => [post.compositeId, post]));
  postsByCompositeId.set(articleModule.VRT_ARTICLE.compositeId, articleModule.VRT_ARTICLE);
  postsByCompositeId.set(repostsModule.VRT_PLAIN_REPOST.compositeId, repostsModule.VRT_PLAIN_REPOST);
  postsByCompositeId.set(repostsModule.VRT_QUOTE_REPOST.compositeId, repostsModule.VRT_QUOTE_REPOST);
  for (const post of imagePostsModule.VRT_IMAGE_ONLY_POSTS) {
    postsByCompositeId.set(post.compositeId, post);
  }
  // A collection the viewer follows, rendered as a standalone `CollectionCard`
  // in the feed. Collection fixtures carry no relationships; give it the
  // root-post shape the repost/reply mocks below read.
  const feedCollection = collectionsModule.VRT_FOLLOWED_COLLECTIONS[0];
  postsByCompositeId.set(feedCollection.compositeId, {
    ...feedCollection,
    relationships: { replied: null, reposted: null, mentioned: [] },
  });
  const orderedCompositeIds = postsModule.VRT_FEED_POSTS.map((post) => post.compositeId);
  const articleFeedPostIds = [articleModule.VRT_ARTICLE.compositeId, ...orderedCompositeIds];
  const collectionFeedPostIds = [feedCollection.compositeId, ...orderedCompositeIds];
  const feedCollectionContent = JSON.parse(feedCollection.details.content) as { name: string };
  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  return {
    postsByCompositeId,
    plainRepostId: repostsModule.VRT_PLAIN_REPOST.compositeId,
    quoteRepostId: repostsModule.VRT_QUOTE_REPOST.compositeId,
    repostOriginal: postsModule.VRT_SINGLE_POST,
    orderedCompositeIds,
    articleFeedPostIds,
    collectionFeedPostIds,
    feedCollectionName: feedCollectionContent.name,
    imageOnlyPostIds: imagePostsModule.VRT_IMAGE_ONLY_POST_IDS,
    imageOnlyImageUrls: imagePostsModule.VRT_IMAGE_ONLY_IMAGE_URLS,
    imageOnlyVisualRows: imagePostsModule.VRT_IMAGE_ONLY_VISUAL_ROWS,
    articleTitle: articleModule.VRT_ARTICLE_TITLE,
    articleCoverUrl: articleModule.VRT_ARTICLE_COVER_URL,
    articleCoverName: articleModule.VRT_ARTICLE_COVER_NAME,
    // Attachment URI → file metadata and file id → asset URL, shared by the
    // article cover, the image-only posts and the collection cover.
    fileMetadataByUri: new Map<string, { id: string; name: string; content_type: string; uri: string }>([
      [articleModule.VRT_ARTICLE_COVER_URI, articleModule.VRT_ARTICLE_COVER_METADATA],
      ...imagePostsModule.VRT_IMAGE_ONLY_FILE_METADATA_BY_URI,
    ]),
    fileUrls: {
      [articleModule.VRT_ARTICLE_COVER_FILE_ID]: articleModule.VRT_ARTICLE_COVER_URL,
      ...imagePostsModule.VRT_IMAGE_ONLY_FILE_URLS,
      ...collectionsModule.VRT_COLLECTION_COVER_URLS,
    },
    collectionCoverUrls: Object.values(collectionsModule.VRT_COLLECTION_COVER_URLS),
    profiles: profilesModule.VRT_AUTHOR_PROFILES,
    viewerPubky,
    whoToFollow: whoToFollowModule.VRT_WHO_TO_FOLLOW,
    homeFilters: navModule.VRT_HOME_FILTERS,
    mockFeedApplication: mockApp.mockFeedApplication,
  };
});

vi.mock('next/navigation', () => {
  const router = {
    push: mockRouterPush,
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
  const { mockRingSession } = await import('@/test-utils/pubky');
  return {
    useAuthStore: createZustandLikeHook({
      currentUserPubky: f.viewerPubky,
      session: mockRingSession(['/:rw'], f.viewerPubky),
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
    collections: {} as Record<string, never>,
  }),
}));

vi.mock('@/hooks/useKeyboardVisible/useKeyboardVisible', () => ({
  useKeyboardVisible: () => feedState.keyboardVisible,
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
  // One stable object per mode; a fresh `postIds` identity on every call would
  // cascade into effect deps and re-render loops.
  const results = {
    default: { ...shared, postIds: f.orderedCompositeIds },
    article: { ...shared, postIds: f.articleFeedPostIds },
    collection: { ...shared, postIds: f.collectionFeedPostIds },
    imageOnly: { ...shared, postIds: f.imageOnlyPostIds },
  };
  return {
    useStreamPagination: () => results[feedState.mode],
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

// Keep the real header-visibility logic and PostContent/preview composition.
// Mock only repost data so these screenshots catch accidental nested cards.
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

vi.mock('@/hooks/useCustomFeed/useCustomFeed', () => {
  return { useCustomFeed: () => undefined };
});

// Header (and its descendants) hooks. Header → HeaderSignIn → SearchInput pulls
// in fetch-and-cache data hooks that would otherwise hit the network/IndexedDB.
// Default screenshots keep these hooks closed/empty; drawer cases opt into
// populated hot tags to cover the narrow content area.
vi.mock('@/hooks/useHotTags/useHotTags', async () => {
  const { VRT_HOT_TAGS } = await import('@/test/fixtures/feed/hotTags');
  const empty = { tags: [], rawTags: [], isLoading: false, error: null, refetch: async () => {} };
  const rawTags = [{ ...VRT_HOT_TAGS[0], label: 'decentralizedsocial', tagged_count: 1234 }, ...VRT_HOT_TAGS.slice(1)];
  const populated = { ...empty, rawTags, tags: rawTags.map((tag) => ({ name: tag.label, count: tag.tagged_count })) };
  return { useHotTags: () => (feedState.populatedHotTags ? populated : empty) };
});

vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', () => {
  const result = { tags: [], users: [], isLoading: false, error: null };
  return { useSearchAutocomplete: () => result };
});

vi.mock('@/application/feed/feed', async () => {
  const f = await fixtures;
  return { FeedApplication: f.mockFeedApplication };
});

vi.mock('@/hooks/useAttachmentsMetadata/useAttachmentsMetadata', async () => {
  const f = await fixtures;
  return {
    useAttachmentsMetadata: ({ fileUris }: { fileUris: readonly string[] }) => ({
      files: fileUris.flatMap((uri) => {
        const metadata = f.fileMetadataByUri.get(uri);
        return metadata ? [metadata] : [];
      }),
      isLoading: false,
    }),
  };
});

vi.mock('@/controllers/file/file', async () => {
  const f = await fixtures;
  return {
    FileController: {
      getAvatarUrl: (userDetails: { image: string | null } | null | undefined) => userDetails?.image ?? null,
      getFileUrl: ({ fileId }: { fileId: string }) => f.fileUrls[fileId] ?? null,
      getMetadata: async ({ fileAttachments }: { fileAttachments: string[] }) =>
        fileAttachments.flatMap((uri) => {
          const meta = f.fileMetadataByUri.get(uri);
          return meta ? [meta] : [];
        }),
      fetchFiles: async () => [],
    },
  };
});

// `CollectionCard` (collection-in-feed) reads the owner through this hook.
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

// Pre-composed image-only rows keep the Visual mosaic free of media
// metadata/probe timing (same approach as the Collections VRT).
vi.mock('@/organisms/Timeline/Feed/TimelineFeed/useVisualFeedTiles', async () => {
  const f = await fixtures;
  const result = {
    rows: f.imageOnlyVisualRows,
    tail: [] as never[],
    tiles: f.imageOnlyVisualRows.flatMap((row) => row.cells.flatMap((cell) => (cell.tile ? [cell.tile] : []))),
    hasPendingSnapshot: false,
    hasPendingTiles: false,
    hasPendingFiles: false,
    hasPendingPostDetails: false,
    hiddenPostCount: 0,
  };
  return { useVisualFeedTiles: () => result };
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

// Keep ContentLayout mounted while a real HotTags click changes the route config.
function FeedDrawerNavigation({ initialPathname }: { initialPathname: string }) {
  const [pathname, setPathname] = useState(initialPathname);
  mockRouterPush.mockImplementation((href: string) => setPathname(href.split('?')[0]));
  return (
    <ContentLayout {...tryResolveFeedsShellConfig(pathname)!}>
      <input aria-label="Feed draft" defaultValue="" />
      <button onClick={() => setPathname(initialPathname)}>Return to feed</button>
    </ContentLayout>
  );
}

describe('Feed right drawer', () => {
  beforeEach(() => {
    feedState.populatedHotTags = true;
    mockRouterPush.mockReset();
  });

  afterEach(() => {
    feedState.populatedHotTags = false;
    mockRouterPush.mockReset();
  });

  const cases = [
    { name: 'home-phone', pathname: APP_ROUTES.HOME, viewport: VRT_VIEWPORT_MOBILE },
    { name: 'custom-feed-phone', pathname: `${APP_ROUTES.FEED}/test-feed`, viewport: VRT_VIEWPORT_MOBILE },
    { name: 'home-wide-phone', pathname: APP_ROUTES.HOME, viewport: { width: 700, height: 420 } },
    { name: 'home-tablet', pathname: APP_ROUTES.HOME, viewport: { width: 768, height: 1024 } },
  ];

  it.each(cases)('preserves the expected layout and actions on $name', async ({ name, pathname, viewport }) => {
    const config = tryResolveFeedsShellConfig(pathname)!;
    await renderForVRT(<ContentLayout {...config}>Feed content</ContentLayout>, { viewport });
    await page.getByRole('button', { name: 'Open right panel' }).click();

    const panel = document.querySelector<HTMLElement>('.fixed.right-0')!;
    const scrollArea = panel.firstElementChild as HTMLElement;
    const content = scrollArea.firstElementChild as HTMLElement;
    const isPhone = viewport.width < 768;
    await expect.poll(() => panel.getBoundingClientRect().right).toBeCloseTo(viewport.width);
    expect(panel.getBoundingClientRect().width).toBe(isPhone ? 256 : 385);
    expect(getComputedStyle(panel).paddingTop).toBe(isPhone ? '24px' : '48px');
    expect(getComputedStyle(panel).paddingLeft).toBe(isPhone ? '24px' : '48px');
    if (isPhone) {
      expect(content.getBoundingClientRect().width).toBe(180);
      expect(panel.querySelector('[data-testid="active-users"]')).toBeNull();
    } else {
      expect(panel.querySelector('[data-testid="active-users"]')).not.toBeNull();
    }
    expect(Array.from(content.children).map((section) => section.getAttribute('data-testid'))).toEqual(
      isPhone
        ? ['who-to-follow', 'hot-tags', 'feedback-card']
        : ['who-to-follow', 'active-users', 'hot-tags', 'feedback-card'],
    );
    const tag = content.querySelector<HTMLElement>('[data-testid="tag-0"]')!;
    const tagName = tag.querySelector<HTMLElement>('[data-testid="tag-name"]')!;
    const tagCount = tag.querySelector<HTMLElement>('[data-testid="tag-count"]')!;
    expect(tagName.textContent).toBe('decentralizedsocial');
    expect(tagCount.textContent).toBe('1234');
    expect(tag.getBoundingClientRect().right).toBeLessThanOrEqual(content.getBoundingClientRect().right);
    expect(tagCount.getBoundingClientRect().right).toBeLessThanOrEqual(tag.getBoundingClientRect().right);
    if (isPhone) {
      expect(tagName.scrollWidth).toBeGreaterThan(tagName.clientWidth);
    }
    await expect.element(page.getByRole('button', { name: 'Explore all' }).last()).toBeVisible();
    if (viewport.height === 420) {
      expect(scrollArea.scrollHeight).toBeGreaterThan(scrollArea.clientHeight);
      scrollArea.scrollTop = scrollArea.scrollHeight;
      expect(scrollArea.scrollTop).toBeGreaterThan(0);
      await expect.element(page.getByRole('button', { name: 'What do you think about Pubky?' }).last()).toBeVisible();
    } else if (isPhone) {
      await matchVrtFrameScreenshot(`feed-right-drawer-${name}`);
    }

    await page.elementLocator(document.querySelector<HTMLElement>('.absolute.inset-0.bg-black')!).click({
      position: { x: 1, y: 1 },
    });
    await expect.poll(() => document.querySelector('.fixed.right-0')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it.each([APP_ROUTES.HOME, `${APP_ROUTES.FEED}/test-feed`])(
    'closes the phone drawer after selecting a hot tag on %s',
    async (initialPathname) => {
      await renderForVRT(<FeedDrawerNavigation initialPathname={initialPathname} />, { viewport: VRT_VIEWPORT_MOBILE });
      await page.getByRole('textbox', { name: 'Feed draft' }).fill('Keep this draft');
      await page.getByRole('button', { name: 'Open right panel' }).click();
      await page.getByTestId('tag-0').last().click();

      expect(mockRouterPush).toHaveBeenCalledWith(`${APP_ROUTES.SEARCH}?tags=decentralizedsocial`);
      await expect.poll(() => document.querySelector('.fixed.right-0')).toBeNull();
      expect(document.body.style.overflow).toBe('');
      await expect.element(page.getByRole('button', { name: 'Open right panel' })).not.toBeInTheDocument();
      await expect.element(page.getByRole('textbox', { name: 'Feed draft' })).toHaveValue('Keep this draft');

      await page.getByRole('button', { name: 'Return to feed' }).click();
      expect(document.querySelector('.fixed.right-0')).toBeNull();
      await page.getByRole('button', { name: 'Open right panel' }).click();
      await expect.poll(() => document.querySelector('.fixed.right-0')).not.toBeNull();
      await page.elementLocator(document.querySelector<HTMLElement>('.absolute.inset-0.bg-black')!).click({
        position: { x: 1, y: 1 },
      });
      await expect.poll(() => document.querySelector('.fixed.right-0')).toBeNull();
      expect(document.body.style.overflow).toBe('');
    },
  );
});

describe('Repost cards — visual regression', () => {
  const cases = [
    { layout: 'inline', viewport: VRT_VIEWPORT_DESKTOP, name: 'inline-desktop' },
    { layout: 'side', viewport: VRT_VIEWPORT_DESKTOP, name: 'side-desktop' },
    { layout: 'list', viewport: VRT_VIEWPORT_DESKTOP, name: 'list-desktop' },
    { layout: 'inline', viewport: VRT_VIEWPORT_MOBILE, name: 'inline-mobile' },
  ] as const;

  it.each(cases)('keeps simple reposts flat and quote context intact ($name)', async ({ layout, viewport, name }) => {
    const f = await fixtures;
    await renderForVRT(
      <PostMainLayoutProvider tagsLayout={layout}>
        <div className={`mx-auto space-y-6 p-4 ${layout === 'side' ? 'max-w-7xl' : 'max-w-[840px]'}`}>
          <div data-testid="plain-repost">
            <PostMain postId={f.plainRepostId} />
          </div>
          <div data-testid="quote-repost">
            <PostMain postId={f.quoteRepostId} />
          </div>
        </div>
      </PostMainLayoutProvider>,
      { viewport },
    );
    const plain = page.getByTestId('plain-repost');
    const quote = page.getByTestId('quote-repost');
    await expect.element(plain.getByText('You reposted', { exact: true })).toBeVisible();
    await expect.element(plain.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await expect
      .element(plain.getByRole('button', { name: `Reply to post (${f.repostOriginal.counts.replies})` }))
      .toBeVisible();
    expect(plain.element().querySelector('[data-cy="post-preview-card"]')).toBeNull();
    expect(quote.element().querySelector('[data-testid="repost-header"]')).toBeNull();
    if (layout !== 'list') {
      await expect.element(plain.getByText(f.repostOriginal.details.content)).toBeVisible();
      await expect.element(quote.getByRole('link', { name: 'View original post' })).toBeVisible();
    }
    await matchVrtFrameScreenshot(`repost-cards-${name}`);
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

describe('Mobile keyboard navigation visibility', () => {
  beforeEach(() => {
    feedState.mode = 'default';
    feedState.keyboardVisible = false;
  });

  it.each([false, true])('renders mobile controls with keyboard visibility %s', async (keyboardVisible) => {
    feedState.keyboardVisible = keyboardVisible;
    await renderForVRT(<HomeWithFab />, { viewport: VRT_VIEWPORT_MOBILE });
    if (keyboardVisible) {
      await expect.element(page.getByTestId('new-post-cta')).not.toBeVisible();
      await expect.element(page.getByRole('link', { name: 'Home', exact: true })).not.toBeInTheDocument();
    } else {
      await expect.element(page.getByTestId('new-post-cta')).toBeVisible();
      await expect.element(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
    }
    feedState.keyboardVisible = false;
  });

  it('keeps the desktop plus button visible when the visual viewport shrinks', async () => {
    feedState.keyboardVisible = true;
    await renderForVRT(<HomeWithFab />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect.element(page.getByTestId('new-post-cta')).toBeVisible();
    feedState.keyboardVisible = false;
  });
});

// The home store mock is a shared snapshot, so a layout swap must be undone
// after the screenshot or it leaks into every later Home test in this file.
async function withHomeLayout(layout: LayoutType, run: () => Promise<void>) {
  const { useHomeStore } = await import('@/stores/home/home.store');
  const state = useHomeStore.getState();
  const previousLayout = state.layout;
  state.layout = layout;
  try {
    await run();
  } finally {
    state.layout = previousLayout;
  }
}

describe('Cards layout — home', () => {
  it.each([
    ['desktop', VRT_VIEWPORT_DESKTOP],
    ['mobile', VRT_VIEWPORT_MOBILE],
  ] as const)('renders Cards on %s', async (name, viewport) => {
    feedState.mode = 'default';
    await withHomeLayout(LAYOUT.CARDS, async () => {
      await renderForVRT(<HomeWithLayout />, { viewport });
      await expect.poll(() => document.querySelector('[data-cy="timeline-posts-cards"]')).not.toBeNull();
      await expect
        .poll(() => {
          const feed = document.querySelector<HTMLElement>('[data-cy="timeline-posts-cards"]')!;
          const cards = Array.from(feed.children).map((card) => card.getBoundingClientRect());
          expect(cards.length).toBeGreaterThan(1);
          expect(feed.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(
            Math.max(...cards.map((card) => card.bottom)) - 1,
          );
          for (const [index, card] of cards.entries()) {
            expect(card.right).toBeLessThanOrEqual(feed.getBoundingClientRect().right + 1);
            for (const other of cards.slice(index + 1)) {
              expect(
                card.left < other.right - 1 &&
                  card.right > other.left + 1 &&
                  card.top < other.bottom - 1 &&
                  card.bottom > other.top + 1,
              ).toBe(false);
            }
          }
          return true;
        })
        .toBe(true);
      await matchVrtFrameScreenshot(`home-cards-${name}`);
    });
  });
});

// Wide, List and Visual are desktop-only: phones resolve every layout to
// Columns (`resolveFeedLayout`), which the default Home mobile snapshot covers.
describe('Wide layout — home', () => {
  it('renders Wide on desktop', async () => {
    feedState.mode = 'default';
    await withHomeLayout(LAYOUT.WIDE, async () => {
      await renderForVRT(<HomeWithLayout />, { viewport: VRT_VIEWPORT_DESKTOP });
      await expect.element(page.getByRole('feed')).toBeVisible();
      await expect.poll(() => document.querySelectorAll('[data-cy="post-card"]').length).toBeGreaterThan(1);
      await matchVrtFrameScreenshot('home-wide-desktop');
    });
  });
});

describe('List layout — home', () => {
  it('renders List on desktop', async () => {
    feedState.mode = 'default';
    await withHomeLayout(LAYOUT.LIST, async () => {
      await renderForVRT(<HomeWithLayout />, { viewport: VRT_VIEWPORT_DESKTOP });
      await expect.element(page.getByRole('feed')).toBeVisible();
      await expect.poll(() => document.querySelectorAll('[data-cy="post-card"]').length).toBeGreaterThan(1);
      await matchVrtFrameScreenshot('home-list-desktop');
    });
  });
});

describe('Visual layout — home', () => {
  // Image-only posts: the mosaic is media-first, so the fixture carries no
  // text content at all.
  it('renders Visual on desktop', async () => {
    const f = await fixtures;
    feedState.mode = 'imageOnly';
    await withHomeLayout(LAYOUT.VISUAL, async () => {
      await preloadImages(f.imageOnlyImageUrls);
      await renderForVRT(<HomeWithLayout />, { viewport: VRT_VIEWPORT_DESKTOP });
      await expect.element(page.getByRole('button', { name: `Open post ${f.imageOnlyPostIds[0]}` })).toBeVisible();
      expect(document.querySelector('[data-cy="visual-feed-container"]')).not.toBeNull();
      expect(document.querySelectorAll('[data-cy="visual-feed-tile"]').length).toBe(f.imageOnlyPostIds.length);
      await matchVrtFrameScreenshot('home-visual-desktop');
    });
  });
});

describe('Home — collection in feed — visual regression', () => {
  beforeEach(() => {
    feedState.mode = 'collection';
  });

  async function renderHomeWithCollection(viewport: { width: number; height: number }) {
    const f = await fixtures;
    // The collection cover is a CSS `background-image`; `renderForVRT` only awaits `<img>`.
    await preloadImages(f.collectionCoverUrls);
    await renderForVRT(<HomeWithLayout />, { viewport });
    const card = page.getByRole('link', { name: f.feedCollectionName, exact: true });
    await expect.element(card).toBeVisible();
    expect(card.element().getAttribute('data-cy')).toBe('collection-card');
    expect(card.element().getAttribute('data-presentation')).toBe('landing');
  }

  it('renders a collection card at desktop viewport', async () => {
    await renderHomeWithCollection(VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('home-feed-collection-desktop');
  });

  it('renders a collection card at mobile viewport', async () => {
    await renderHomeWithCollection(VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('home-feed-collection-mobile');
  });
});
