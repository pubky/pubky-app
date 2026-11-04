// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { WhoToFollowPage } from '@/templates/Feed/WhoToFollowPage/WhoToFollowPage';

// `ready` shows the recommendation list (alternating Follow / Following) plus
// the active-users sidebar. `empty` clears only the recommendation stream.
// `loading` settles neither stream, so both columns stay on their skeletons.
const pageState = vi.hoisted(() => ({
  mode: 'ready' as 'ready' | 'loading' | 'empty',
}));

const fixtures = vi.hoisted(async () => {
  const [profilesModule, whoToFollowModule, navModule] = await Promise.all([
    import('@/test/fixtures/feed/profiles'),
    import('@/test/fixtures/feed/whoToFollow'),
    import('@/test/fixtures/feed/feedNavigation'),
  ]);

  const recommendations = whoToFollowModule.VRT_WHO_TO_FOLLOW_PAGE;
  const activeUsers = whoToFollowModule.VRT_WHO_TO_FOLLOW_ACTIVE_USERS;
  const userTagsById = new Map<string, { label: string; taggers: []; taggers_count: number; relationship: false }[]>();
  for (const user of [...recommendations, ...activeUsers]) {
    if (userTagsById.has(user.id)) continue;
    userTagsById.set(
      user.id,
      (user.tags ?? []).map((label) => ({
        label,
        taggers: [],
        taggers_count: 0,
        relationship: false as const,
      })),
    );
  }

  return {
    recommendations,
    activeUsers,
    userTagsById,
    profiles: profilesModule.VRT_AUTHOR_PROFILES,
    viewerPubky: profilesModule.VRT_AUTHOR_PUBKYS.alice,
    homeFilters: navModule.VRT_HOME_FILTERS,
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
    usePathname: () => '/who-to-follow',
    useSearchParams: () => searchParams,
    useParams: () => ({}),
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
      restoreStatus: 'ready' as const,
      isLoggingOut: false,
      setShowSignInDialog: vi.fn(),
      selectCurrentUserPubky: () => f.viewerPubky,
    }),
  };
});

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

vi.mock('@/hooks/useKeyboardVisible/useKeyboardVisible', () => ({
  useKeyboardVisible: () => false,
}));

vi.mock('@/hooks/useUserStream/useUserStream', async () => {
  const f = await fixtures;
  const refetch = async () => {};
  const empty = {
    users: [] as typeof f.recommendations,
    userIds: [] as string[],
    isLoading: false,
    isLoadingMore: false,
    error: null as string | null,
    refetch,
  };
  const loading = { ...empty, isLoading: true };
  const readyRecommended = {
    ...empty,
    users: f.recommendations,
    userIds: f.recommendations.map((user) => user.id),
  };
  const readyActive = {
    ...empty,
    users: f.activeUsers,
    userIds: f.activeUsers.map((user) => user.id),
  };
  return {
    useUserStream: ({ streamId }: { streamId: string }) => {
      // UserStreamTypes.RECOMMENDED. Literal because this factory is hoisted
      // above the import that would otherwise name the enum.
      if (pageState.mode === 'loading') return loading;
      if (streamId === 'recommended:all:all') {
        return pageState.mode === 'empty' ? empty : readyRecommended;
      }
      return readyActive;
    },
  };
});

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    requireAuth: (action: () => void) => action(),
    isAuthenticated: true,
    waitForAuth: async () => true,
  }),
}));

vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => {
  const result = { ref: () => {} };
  return { useTtlSubscription: () => result };
});

// User rows load tags through ClickableTagsList, not the labels already on the
// stream user. Empty taggers skip the hover popover and any avatar fetch.
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
      const tags = f.userTagsById.get(taggedId) ?? [];
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

vi.mock('@/hooks/useEntityTaggers/useEntityTaggers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useEntityTaggers/useEntityTaggers')>();
  const result = {
    taggerStates: new Map(),
    loadTaggers: async () => {},
    loadMoreTaggers: async () => {},
  };
  return { ...actual, useEntityTaggers: () => result };
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

vi.mock('@/hooks/useCustomFeed/useCustomFeed', () => ({
  useCustomFeed: () => undefined,
}));

// Header search fetches hot tags on mount even while the suggestions panel is
// closed. Return a settled empty list so the capture does not wait on Nexus.
vi.mock('@/hooks/useHotTags/useHotTags', () => {
  const result = {
    tags: [] as { name: string; count: number }[],
    rawTags: [] as never[],
    isLoading: false,
    error: null,
    refetch: async () => {},
  };
  return { useHotTags: () => result };
});

vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', () => {
  const result = {
    tags: [] as { name: string }[],
    users: [] as { id: string; name: string }[],
    isLoading: false,
    error: null,
  };
  return { useSearchAutocomplete: () => result };
});

// Root layout mounts <Header /> above the page. WhoToFollowPage already wraps
// itself in ContentLayout (sort sidebar, active users, feedback, mobile chrome).
function WhoToFollowWithHeader() {
  return (
    <>
      <Header />
      <WhoToFollowPage />
    </>
  );
}

const VIEWPORTS = [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const;

async function renderWhoToFollow(viewport: { width: number; height: number }) {
  await preloadImages(['/pubky-logo.svg']);
  return renderForVRT(<WhoToFollowWithHeader />, { viewport });
}

async function expectAppChrome(
  screen: Awaited<ReturnType<typeof renderWhoToFollow>>,
  viewportName: 'desktop' | 'mobile',
) {
  await expect.element(screen.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  if (viewportName === 'desktop') {
    await expect.element(screen.getByRole('heading', { name: 'Sort', exact: true })).toBeVisible();
    await expect.element(screen.getByRole('heading', { name: 'Active users', exact: true })).toBeVisible();
    return;
  }
  await expect.element(screen.getByRole('button', { name: 'Open right panel', exact: true })).toBeVisible();
}

beforeEach(() => {
  pageState.mode = 'ready';
});

describe('Who to follow — visual regression', () => {
  it.each(VIEWPORTS)('renders recommendations on %s', async (name, viewport) => {
    const f = await fixtures;
    const screen = await renderWhoToFollow(viewport);
    await expectAppChrome(screen, name);
    // First row is not followed; the second is. Both button glyphs land in one capture.
    await expect.element(screen.getByText(f.recommendations[0].name)).toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: `Follow ${f.recommendations[0].name}`, exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: `Unfollow ${f.recommendations[1].name}`, exact: true }))
      .toBeVisible();
    if (name === 'desktop') {
      await expect.element(screen.getByText(f.activeUsers[0].name)).toBeVisible();
      await expect
        .element(screen.getByRole('button', { name: `Unfollow ${f.activeUsers[1].name}`, exact: true }))
        .toBeVisible();
    }
    await matchVrtFrameScreenshot(`who-to-follow-${name}`);
  });
});

describe('Who to follow (empty) — visual regression', () => {
  beforeEach(() => {
    pageState.mode = 'empty';
  });

  it.each(VIEWPORTS)('renders the empty state on %s', async (name, viewport) => {
    const f = await fixtures;
    const screen = await renderWhoToFollow(viewport);
    await expectAppChrome(screen, name);
    await expect.element(screen.getByRole('heading', { name: 'No recommendations yet', exact: true })).toBeVisible();
    if (name === 'desktop') {
      await expect.element(screen.getByText(f.activeUsers[0].name)).toBeVisible();
    }
    await matchVrtFrameScreenshot(`who-to-follow-empty-${name}`);
  });
});

describe('Who to follow (loading) — visual regression', () => {
  beforeEach(() => {
    pageState.mode = 'loading';
  });

  it.each(VIEWPORTS)('renders skeletons on %s', async (name, viewport) => {
    const screen = await renderWhoToFollow(viewport);
    await expectAppChrome(screen, name);
    await expect.element(screen.getByTestId('user-list-item-skeleton-full').first()).toBeVisible();
    await matchVrtFrameScreenshot(`who-to-follow-loading-${name}`);
  });
});
