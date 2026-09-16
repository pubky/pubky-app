// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { formatStableRelative } from '@/test-utils/vrt.clock';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { PostPageShell } from '@/organisms/PostPageShell/PostPageShell';
import { SinglePostPage } from '@/templates/Post/SinglePost/SinglePostPage';

// Direct `/post/[userId]/[postId]` (Header + PostPageShell + SinglePostPage).
// Desktop: columns, wide, list. Phone only has one layout (tags collapse to inline;
// the mobile drawer omits the layout filter). Visual layout is out of scope.
const routeState = vi.hoisted(() => ({
  pathname: '/post',
  params: {} as Record<string, string>,
}));

const uiState = vi.hoisted(() => ({
  layout: 'columns' as 'columns' | 'wide' | 'list',
}));

const CHROME_IMAGE_URLS = ['/pubky-logo.svg'] as const;

// Browser-mode vi.mock factories run before top-level imports resolve and have
// no synchronous require(), so each factory loads its fixture via async import
// the first time the mocked module is consumed.
const fixtures = vi.hoisted(async () => {
  const [postsModule, repliesModule, profilesModule] = await Promise.all([
    import('@/test/fixtures/feed/posts'),
    import('@/test/fixtures/post/threadReplies'),
    import('@/test/fixtures/feed/profiles'),
  ]);

  const featured = postsModule.VRT_SINGLE_POST;
  const threadReplies = repliesModule.VRT_SINGLE_POST_THREAD_REPLIES;
  const allPostFixtures = [featured, ...threadReplies];
  const entitiesByCompositeId = new Map(allPostFixtures.map((post) => [post.compositeId, post] as const));
  const threadReplyIdsByParent = new Map<string, string[]>([
    [featured.compositeId, threadReplies.map((reply) => reply.compositeId)],
  ]);
  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  const branPubky = profilesModule.VRT_AUTHOR_PUBKYS.bran;
  const cleoPubky = profilesModule.VRT_AUTHOR_PUBKYS.cleo;
  const dionPubky = profilesModule.VRT_AUTHOR_PUBKYS.dion;
  const profiles = profilesModule.VRT_AUTHOR_PROFILES;
  const participantIds = [branPubky, viewerPubky, cleoPubky, dionPubky];

  // Side-panel tags for the featured post (`PostTagsPanel` via `usePostTags`).
  // Kept here rather than on `VRT_SINGLE_POST` so Home feed baselines stay put.
  const featuredSideTags = [
    {
      label: 'design',
      taggers_count: 3,
      relationship: true,
      taggers: [
        { id: viewerPubky, name: profiles[viewerPubky].name, avatarUrl: undefined },
        { id: cleoPubky, name: profiles[cleoPubky].name, avatarUrl: undefined },
        { id: dionPubky, name: profiles[dionPubky].name, avatarUrl: undefined },
      ],
    },
    {
      label: 'hierarchy',
      taggers_count: 2,
      relationship: false,
      taggers: [
        { id: branPubky, name: profiles[branPubky].name, avatarUrl: undefined },
        { id: cleoPubky, name: profiles[cleoPubky].name, avatarUrl: undefined },
      ],
    },
    {
      label: 'typography',
      taggers_count: 1,
      relationship: false,
      taggers: [{ id: dionPubky, name: profiles[dionPubky].name, avatarUrl: undefined }],
    },
  ];

  return {
    featured,
    profiles,
    viewerPubky,
    branPubky,
    participantIds,
    featuredSideTags,
    entitiesByCompositeId,
    threadReplyIdsByParent,
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

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: <T,>(fn: () => T | Promise<T>, _deps?: unknown[], initial?: T): T => {
    const result = fn();
    if (result instanceof Promise) return initial as T;
    return result;
  },
}));

// `createZustandLikeHook` snapshots `layout` at mock init. Read `uiState.layout`
// on every call so columns / wide / list tests can share this file.
vi.mock('@/stores/home/home.store', async () => {
  const { VRT_HOME_FILTERS } = await import('@/test/fixtures/feed/feedNavigation');
  const actions = {
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
  };
  const snapshot = () => ({
    ...VRT_HOME_FILTERS,
    layout: uiState.layout,
    ...actions,
  });
  function useHomeStore<T>(selector?: (state: ReturnType<typeof snapshot>) => T) {
    const state = snapshot();
    return selector ? selector(state) : state;
  }
  useHomeStore.getState = () => snapshot();
  useHomeStore.setState = vi.fn();
  useHomeStore.subscribe = vi.fn(() => () => {});
  return { useHomeStore };
});

vi.mock('@/stores/auth/auth.store', async () => {
  const f = await fixtures;
  return {
    useAuthStore: createZustandLikeHook({
      currentUserPubky: f.viewerPubky,
      session: { pubky: f.viewerPubky },
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

// Header SearchInput fetches on mount. Collections nav would show a NEW badge
// from empty localStorage. Current-user profile would miss IndexedDB and skeleton.
vi.mock('@/hooks/useHotTags/useHotTags', () => {
  const result = { tags: [], rawTags: [], isLoading: false, error: null, refetch: async () => {} };
  return { useHotTags: () => result };
});

vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', () => {
  const result = { tags: [], users: [], isLoading: false, error: null };
  return { useSearchAutocomplete: () => result };
});

vi.mock('@/hooks/useCollectionsNavDiscovery/useCollectionsNavDiscovery', () => ({
  useCollectionsNavDiscovery: () => ({
    showCollectionsNew: false,
    markCollectionsNavSeen: () => {},
  }),
}));

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', async () => {
  const f = await fixtures;
  const result = {
    userDetails: f.profiles[f.viewerPubky],
    currentUserPubky: f.viewerPubky,
    isLoading: false,
  };
  return { useCurrentUserProfile: () => result };
});

vi.mock('@/hooks/useIsFollowing/useIsFollowing', async () => {
  const f = await fixtures;
  return {
    useIsFollowing: (userId: string) => ({
      isFollowing: userId === f.branPubky,
      isLoading: false,
    }),
  };
});

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
// breaks layout — `PostThreadConnector` consumes that height.

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
      const cached = cache.get(taggedId);
      if (cached) return cached;
      const fixture = f.entitiesByCompositeId.get(taggedId);
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

// Wide layout's `PostTagsPanel` reads this hook (not `useEntityTags`). Without
// it the panel stays on the loading skeleton.
vi.mock('@/hooks/usePostTags/usePostTags', async () => {
  const f = await fixtures;
  const noopToggle = async () => {};
  const noopAdd = async () => ({ success: true });
  const EMPTY = {
    tags: [] as unknown[],
    count: 0,
    isLoading: false as const,
    isLoadingMore: false,
    hasMore: false,
    loadMore: async () => {},
    handleTagAdd: noopAdd,
    handleTagToggle: noopToggle,
  };
  const cache = new Map<string, typeof EMPTY>();
  return {
    usePostTags: (postId: string | null | undefined) => {
      if (!postId) return EMPTY;
      const cached = cache.get(postId);
      if (cached) return cached;
      if (postId === f.featured.compositeId) {
        const result = {
          ...EMPTY,
          tags: f.featuredSideTags,
          count: f.featuredSideTags.length,
        };
        cache.set(postId, result);
        return result;
      }
      const fixture = f.entitiesByCompositeId.get(postId);
      const tags = (fixture?.tags ?? []).map((tag) => ({
        ...tag,
        taggers: (tag.taggers ?? []).map((id) => ({
          id,
          name: f.profiles[id]?.name,
          avatarUrl: undefined,
        })),
      }));
      const result = { ...EMPTY, tags, count: tags.length };
      cache.set(postId, result);
      return result;
    },
  };
});

vi.mock('@/hooks/useThreadReplies/useThreadReplies', async () => {
  const f = await fixtures;
  const { DEFAULT_MAX_THREAD_REPLIES } = await import('@/hooks/useThreadReplies/useThreadReplies.constants');
  const EMPTY = {
    replyIds: [] as string[],
    totalCount: 0,
    hasMore: false,
    showAll: false,
    isExpandingAll: false,
    expandAll: async () => {},
  };
  const cache = new Map<string, typeof EMPTY>();
  return {
    useThreadReplies: (postId: string | null | undefined) => {
      if (!postId) return EMPTY;
      const cached = cache.get(postId);
      if (cached) return cached;
      const allIds = f.threadReplyIdsByParent.get(postId) ?? [];
      const fixture = f.entitiesByCompositeId.get(postId);
      const totalCount = fixture?.counts.replies ?? allIds.length;
      const replyIds = allIds.slice(0, DEFAULT_MAX_THREAD_REPLIES);
      const result = {
        replyIds,
        totalCount,
        hasMore: totalCount > replyIds.length,
        showAll: false,
        isExpandingAll: false,
        expandAll: async () => {},
      };
      cache.set(postId, result);
      return result;
    },
  };
});

// Nested (Level 2+) replies stay empty so Dexie/Nexus fetch cannot race the screenshot.
vi.mock('@/hooks/useNestedReplies/useNestedReplies', () => {
  const result = {
    nestedReplyIds: [] as string[],
    hasMoreReplies: false,
    hasNestedReplies: false,
    replyCount: 0,
    showAll: false,
    isExpandingAll: false,
    expandAll: async () => {},
  };
  return { useNestedReplies: () => result };
});

vi.mock('@/hooks/usePostAncestors/usePostAncestors', async () => {
  const f = await fixtures;
  const result = {
    ancestors: [{ postId: f.featured.compositeId, userId: f.featured.details.author }],
    isLoading: false,
    hasError: false,
  };
  return { usePostAncestors: () => result };
});

vi.mock('@/hooks/useUserDetailsFromIds/useUserDetailsFromIds', async () => {
  const f = await fixtures;
  const cache = new Map<string, { users: { id: string; name: string; avatarUrl: undefined }[]; isLoading: false }>();
  return {
    useUserDetailsFromIds: ({ userIds }: { userIds: string[] }) => {
      const key = userIds.join(',');
      const cached = cache.get(key);
      if (cached) return cached;
      const users = userIds.flatMap((id) => {
        const profile = f.profiles[id];
        return profile ? [{ id, name: profile.name, avatarUrl: undefined }] : [];
      });
      const result = { users, isLoading: false as const };
      cache.set(key, result);
      return result;
    },
  };
});

vi.mock('@/hooks/usePostParticipants/usePostParticipants', async () => {
  const f = await fixtures;
  const participants = f.participantIds.map((id) => {
    const profile = f.profiles[id];
    return {
      id,
      name: profile.name,
      image: profile.image ?? undefined,
      counts: { tags: 0, posts: 0 },
    };
  });
  const result = {
    participants,
    author: participants[0] ?? null,
    isLoading: false,
    error: null,
  };
  return { usePostParticipants: () => result };
});

function SinglePostWithChrome({ postId }: { postId: string }) {
  return (
    <>
      <Header />
      <PostPageShell postId={postId}>
        <SinglePostPage postId={postId} />
      </PostPageShell>
    </>
  );
}

async function renderSinglePost(layout: 'columns' | 'wide' | 'list', viewport: { width: number; height: number }) {
  const f = await fixtures;
  uiState.layout = layout;
  routeState.pathname = `/post/${f.featured.details.author}/${f.featured.postId}`;
  routeState.params = { userId: f.featured.details.author, postId: f.featured.postId };
  await preloadImages(CHROME_IMAGE_URLS);

  const screen = await renderForVRT(<SinglePostWithChrome postId={f.featured.compositeId} />, { viewport });
  await expect.element(screen.getByTestId('post-page-title')).toBeVisible();
  await expect.element(screen.getByText(/timestamps live in the corner/)).toBeVisible();
  await expect.element(screen.getByText(/Corner timestamps win on desktop/)).toBeVisible();
  await expect.element(screen.getByText('1 more reply')).toBeVisible();

  const isDesktop = viewport.width >= 1024;
  if (layout === 'columns' && isDesktop) {
    await expect.element(screen.getByTestId('single-post-participants')).toBeVisible();
  }
  if ((layout === 'wide' || layout === 'list') && isDesktop) {
    expect(document.querySelector('[data-cy="button-filters-left"]')).toBeTruthy();
  }
  if (layout === 'wide' && isDesktop) {
    // Parent card mounts a `lg:hidden` tags panel first; `.first()` would hit that
    // hidden input. Assert against a displayed panel instead.
    const visiblePanel = [...document.querySelectorAll('[data-cy="post-tags-panel"]')].find(
      (el) => el instanceof HTMLElement && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
    );
    expect(visiblePanel).toBeTruthy();
    expect(visiblePanel?.querySelector('[data-cy="add-tag-input"]')).toBeTruthy();
    expect(visiblePanel?.textContent).toContain('design');
    expect(visiblePanel?.textContent).toContain('hierarchy');
    expect(visiblePanel?.textContent).toContain('typography');
  }
  return screen;
}

describe('Single post — columns layout — visual regression', () => {
  it('renders a post at desktop viewport', async () => {
    await renderSinglePost('columns', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('single-post-columns-desktop');
  });

  it('renders a post at mobile viewport', async () => {
    await renderSinglePost('columns', VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('single-post-mobile');
  });
});

describe('Single post — wide layout — visual regression', () => {
  it('renders a post at desktop viewport', async () => {
    await renderSinglePost('wide', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('single-post-wide-desktop');
  });
});

describe('Single post — list layout — visual regression', () => {
  it('renders a post at desktop viewport', async () => {
    await renderSinglePost('list', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('single-post-list-desktop');
  });
});
