// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  matchVrtFrameScreenshot,
  preloadImages,
  renderForVRT,
  VRT_ROOT_TESTID,
  waitForMarkdownEditorReady,
} from '@/test-utils/vrt';
import { formatStableRelative } from '@/test-utils/vrt.clock';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { DialogEditPost } from '@/organisms/DialogEditPost/DialogEditPost';
import { PostPageShell } from '@/organisms/PostPageShell/PostPageShell';
import { SinglePostPage } from '@/templates/Post/SinglePost/SinglePostPage';

// Creating via the Home composer lives in Home.vrt.test.tsx; the New Article
// dialog lives there too (Home chrome + FAB). This file covers editing
// (DialogEditPost over the published page) and the published article page.
// Desktop: columns + wide. Phone has one layout. List is out of scope.
const routeState = vi.hoisted(() => ({
  pathname: '/post',
  params: {} as Record<string, string>,
}));

const uiState = vi.hoisted(() => ({
  layout: 'columns' as 'columns' | 'wide' | 'list',
}));

const CHROME_IMAGE_URLS = ['/pubky-logo.svg'] as const;

const fixtures = vi.hoisted(async () => {
  const [articleModule, profilesModule] = await Promise.all([
    import('@/test/fixtures/post/article'),
    import('@/test/fixtures/feed/profiles'),
  ]);

  const article = articleModule.VRT_ARTICLE;
  const threadReplies = articleModule.VRT_ARTICLE_THREAD_REPLIES;
  const allPostFixtures = [article, ...threadReplies];
  const entitiesByCompositeId = new Map(allPostFixtures.map((post) => [post.compositeId, post] as const));
  const threadReplyIdsByParent = new Map<string, string[]>([
    [article.compositeId, threadReplies.map((reply) => reply.compositeId)],
  ]);
  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  const branPubky = profilesModule.VRT_AUTHOR_PUBKYS.bran;
  const cleoPubky = profilesModule.VRT_AUTHOR_PUBKYS.cleo;
  const profiles = profilesModule.VRT_AUTHOR_PROFILES;
  const participantIds = [branPubky, viewerPubky, cleoPubky];

  return {
    article,
    articleTitle: articleModule.VRT_ARTICLE_TITLE,
    articleCoverUrl: articleModule.VRT_ARTICLE_COVER_URL,
    articleCoverName: articleModule.VRT_ARTICLE_COVER_NAME,
    articleCoverByUri: new Map([[articleModule.VRT_ARTICLE_COVER_URI, articleModule.VRT_ARTICLE_COVER_METADATA]]),
    articleCoverUrls: { [articleModule.VRT_ARTICLE_COVER_FILE_ID]: articleModule.VRT_ARTICLE_COVER_URL },
    profiles,
    viewerPubky,
    branPubky,
    participantIds,
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
// on every call so columns / wide tests can share this file.
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

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: createZustandLikeHook({
    profile: null,
    posts: {} as Record<string, never>,
  }),
}));

vi.mock('@/hooks/useHotTags/useHotTags', () => {
  const result = { tags: [], rawTags: [], isLoading: false, error: null, refetch: async () => {} };
  return { useHotTags: () => result };
});

vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', () => {
  const result = { tags: [], users: [], isLoading: false, error: null };
  return { useSearchAutocomplete: () => result };
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
    ancestors: [{ postId: f.article.compositeId, userId: f.article.details.author }],
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

vi.mock('@/controllers/file/file', async () => {
  const f = await fixtures;
  return {
    FileController: {
      getAvatarUrl: () => null,
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

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitCreate: async () => 'vrt-created-post',
    commitEdit: async () => {},
    getDetails: async () => null,
    getDetailsByIds: async () => [],
  },
}));

vi.mock('@/controllers/search/search', () => ({
  SearchController: {
    fetchUsersById: async () => [],
    getUsersByName: async () => [],
    getTagsByPrefix: async () => [],
  },
}));

function PublishedArticleWithChrome({ postId }: { postId: string }) {
  return (
    <>
      <Header />
      <PostPageShell postId={postId}>
        <SinglePostPage postId={postId} />
      </PostPageShell>
    </>
  );
}

function EditArticleWithChrome({ postId }: { postId: string }) {
  return (
    <>
      <PublishedArticleWithChrome postId={postId} />
      <DialogEditPost open onOpenChangeAction={() => undefined} postId={postId} />
    </>
  );
}

async function waitForVisibleCollectionsNew() {
  await vi.waitFor(() => {
    const collectionsNew = [...document.querySelectorAll('[aria-label="Collections, New"]')].find(
      (el) => el instanceof HTMLElement && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
    );
    expect(collectionsNew).toBeTruthy();
  });
}

async function renderPublishedArticle(layout: 'columns' | 'wide', viewport: { width: number; height: number }) {
  const f = await fixtures;
  uiState.layout = layout;
  routeState.pathname = `/post/${f.article.details.author}/${f.article.postId}`;
  routeState.params = { userId: f.article.details.author, postId: f.article.postId };
  await preloadImages([...CHROME_IMAGE_URLS, f.articleCoverUrl]);

  const screen = await renderForVRT(<PublishedArticleWithChrome postId={f.article.compositeId} />, { viewport });
  await expect.element(screen.getByText(f.articleTitle)).toBeVisible();
  await expect.element(screen.getByAltText(f.articleCoverName)).toBeVisible();
  await expect.element(screen.getByText('A feed is a scanning surface, not a document.')).toBeVisible();
  await expect.element(screen.getByText('Replies')).toBeVisible();
  await expect.element(screen.getByText(/newspaper mark next to the title/)).toBeVisible();

  const isDesktop = viewport.width >= 1024;
  if (layout === 'columns' && isDesktop) {
    await expect.element(screen.getByTestId('single-post-participants')).toBeVisible();
  }
  if (layout === 'wide' && isDesktop) {
    expect(document.querySelector('[data-cy="button-filters-left"]')).toBeTruthy();
    // Parent card mounts a `lg:hidden` tags panel first; `.first()` would hit that
    // hidden input. Assert against a displayed panel instead.
    const visiblePanel = [...document.querySelectorAll('[data-cy="post-tags-panel"]')].find(
      (el) => el instanceof HTMLElement && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
    );
    expect(visiblePanel).toBeTruthy();
    expect(visiblePanel?.querySelector('[data-cy="add-tag-input"]')).toBeTruthy();
    expect(visiblePanel?.textContent).toContain('design');
    expect(visiblePanel?.textContent).toContain('hierarchy');
  }

  await waitForVisibleCollectionsNew();
  return screen;
}

async function renderEditArticle(viewport: { width: number; height: number }) {
  const f = await fixtures;
  uiState.layout = 'columns';
  routeState.pathname = `/post/${f.article.details.author}/${f.article.postId}`;
  routeState.params = { userId: f.article.details.author, postId: f.article.postId };
  await preloadImages([...CHROME_IMAGE_URLS, f.articleCoverUrl]);

  await renderForVRT(<EditArticleWithChrome postId={f.article.compositeId} />, { viewport });
  await expect.element(page.getByTestId('dialog-content')).toBeVisible();
  await expect.element(page.getByPlaceholder('Article Title')).toHaveValue(f.articleTitle);
  await expect.element(page.getByAltText('Image preview')).toBeVisible();
  const dialog = document.querySelector('[data-testid="dialog-content"]') ?? document;
  await waitForMarkdownEditorReady(dialog);
  await waitForVisibleCollectionsNew();
}

describe('Article — editing — visual regression', () => {
  it('renders the edit article dialog at desktop viewport', async () => {
    await renderEditArticle(VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('article-editing-desktop');
  });

  it('renders the edit article dialog at mobile viewport', async () => {
    await renderEditArticle(VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('article-editing-mobile');
  });
});

// The default frame shows the article page from the top, where the body sits
// below the fold. Scroll the clipped VRT root so the body typography (paragraph
// spacing, loose numbered list, soft line breaks — issue #1762) is what the
// frame captures.
function scrollArticleBodyIntoView() {
  const root = document.querySelector(`[data-testid="${VRT_ROOT_TESTID}"]`);
  const body = document.querySelector('[data-cy="post-text"]');
  if (!(root instanceof HTMLElement) || !(body instanceof HTMLElement)) {
    throw new Error('VRT root or article body not found');
  }
  root.scrollTop += body.getBoundingClientRect().top - root.getBoundingClientRect().top - 24;
}

describe('Article — published page — body typography — visual regression', () => {
  it('renders the article body at desktop viewport', async () => {
    await renderPublishedArticle('columns', VRT_VIEWPORT_DESKTOP);
    scrollArticleBodyIntoView();
    await matchVrtFrameScreenshot('article-page-body-desktop');
  });

  it('renders the article body at mobile viewport', async () => {
    await renderPublishedArticle('columns', VRT_VIEWPORT_MOBILE);
    scrollArticleBodyIntoView();
    await matchVrtFrameScreenshot('article-page-body-mobile');
  });
});

describe('Article — published page — columns layout — visual regression', () => {
  it('renders a published article at desktop viewport', async () => {
    await renderPublishedArticle('columns', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('article-page-columns-desktop');
  });

  it('renders a published article at mobile viewport', async () => {
    await renderPublishedArticle('columns', VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('article-page-mobile');
  });
});

describe('Article — published page — wide layout — visual regression', () => {
  it('renders a published article at desktop viewport', async () => {
    await renderPublishedArticle('wide', VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('article-page-wide-desktop');
  });
});
