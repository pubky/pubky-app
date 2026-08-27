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
import { ProfilePageContainer } from '@/organisms/ProfilePageContainer/ProfilePageContainer';
import type { Pubky } from '@/models/models.types';
import { ProfileProvider } from '@/providers/ProfileProvider/ProfileProvider';
import { ProfileNotificationsPage } from '@/templates/Profile/Notifications/ProfileNotificationsPage';
import { ProfilePostsPage } from '@/templates/Profile/Posts/ProfilePostsPage';
import { ProfileRepliesPage } from '@/templates/Profile/Replies/ProfileRepliesPage';
import { ProfileFollowersPage } from '@/templates/Profile/Followers/ProfileFollowersPage';
import { ProfileFollowingPage } from '@/templates/Profile/Following/ProfileFollowingPage';
import { ProfileFriendsPage } from '@/templates/Profile/Friends/ProfileFriendsPage';
import { ProfileTaggedPage } from '@/templates/Profile/Tagged/ProfileTaggedPage';
import { ProfileCollectionsPage } from '@/templates/Profile/Collections/ProfileCollectionsPage';

const routeState = vi.hoisted(() => ({
  pathname: '/profile',
  params: {} as Record<string, string>,
}));

// Browser-mode vi.mock factories run before top-level imports resolve and have
// no synchronous require(), so each factory loads its fixture via async import
// the first time the mocked module is consumed.
const fixtures = vi.hoisted(async () => {
  const [profilesModule, postsModule, collectionsModule, connectionsModule, notificationsModule, tagsModule, mockApp] =
    await Promise.all([
      import('@/test/fixtures/feed/profiles'),
      import('@/test/fixtures/profile/posts'),
      import('@/test/fixtures/profile/collections'),
      import('@/test/fixtures/profile/connections'),
      import('@/test/fixtures/profile/notifications'),
      import('@/test/fixtures/profile/tags'),
      import('@/test/mocks/feedApplication'),
    ]);

  const viewerPubky = profilesModule.VRT_AUTHOR_PUBKYS.alice;
  const otherPubky = profilesModule.VRT_AUTHOR_PUBKYS.bran;

  const allPostFixtures = [
    ...postsModule.VRT_PROFILE_POSTS,
    ...postsModule.VRT_PROFILE_REPLY_PARENTS,
    ...postsModule.VRT_PROFILE_REPLIES,
    ...postsModule.VRT_PROFILE_THREAD_REPLIES,
    ...postsModule.VRT_NOTIFICATION_POSTS,
    ...postsModule.VRT_OTHER_PROFILE_POSTS,
    ...postsModule.VRT_OTHER_PROFILE_THREAD_REPLIES,
  ];
  const entitiesByCompositeId = new Map<
    string,
    { details: unknown; counts: unknown; tags: unknown[]; relationships?: unknown }
  >([
    ...allPostFixtures.map((post) => [post.compositeId, post] as const),
    ...collectionsModule.VRT_PROFILE_COLLECTIONS.map((collection) => [collection.compositeId, collection] as const),
  ]);

  const postIds = postsModule.VRT_PROFILE_POSTS.map((post) => post.compositeId);
  const otherPostIds = postsModule.VRT_OTHER_PROFILE_POSTS.map((post) => post.compositeId);
  const replyIds = postsModule.VRT_PROFILE_REPLIES.map((post) => post.compositeId);
  const collectionIds = collectionsModule.VRT_PROFILE_COLLECTIONS.map((collection) => collection.compositeId);

  const uriToParentId = new Map(
    [...postsModule.VRT_PROFILE_POSTS, ...postsModule.VRT_OTHER_PROFILE_POSTS].map((parent) => [
      parent.details.uri,
      parent.compositeId,
    ]),
  );
  const threadReplyIdsByParent = new Map<string, string[]>();
  for (const reply of [...postsModule.VRT_PROFILE_THREAD_REPLIES, ...postsModule.VRT_OTHER_PROFILE_THREAD_REPLIES]) {
    const parentId = reply.relationships.replied ? uriToParentId.get(reply.relationships.replied) : undefined;
    if (!parentId) continue;
    const ids = threadReplyIdsByParent.get(parentId) ?? [];
    ids.push(reply.compositeId);
    threadReplyIdsByParent.set(parentId, ids);
  }

  // Decorative per-user tag pills for the Followers/Following/Friends tag row
  // (`UserListItem` → `ClickableTagsList` fetches by `taggedId = user.id`,
  // independently of the `tags` field already on each connection fixture).
  const userTagsById = new Map<
    string,
    { label: string; taggers: string[]; taggers_count: number; relationship: boolean }[]
  >();
  for (const connection of [
    ...connectionsModule.VRT_FOLLOWERS,
    ...connectionsModule.VRT_FOLLOWING,
    ...connectionsModule.VRT_FRIENDS,
  ]) {
    if (userTagsById.has(connection.id)) continue;
    userTagsById.set(
      connection.id,
      (connection.tags ?? []).map((label) => ({
        label,
        taggers: [viewerPubky],
        taggers_count: 1,
        relationship: false,
      })),
    );
  }

  // Own-profile header should show a status with emoji, not the empty "No Status" picker.
  const viewerProfile = {
    ...profilesModule.VRT_AUTHOR_PROFILES[viewerPubky],
    status: 'vacationing',
  };
  const otherProfile = {
    ...profilesModule.VRT_AUTHOR_PROFILES[otherPubky],
    status: 'available',
    links: [{ title: 'Site', url: 'https://example.com/bran' }],
  };

  return {
    profiles: {
      ...profilesModule.VRT_AUTHOR_PROFILES,
      [viewerPubky]: viewerProfile,
      [otherPubky]: otherProfile,
    },
    viewerPubky,
    otherPubky,
    entitiesByCompositeId,
    postIds,
    otherPostIds,
    replyIds,
    collectionIds,
    threadReplyIdsByParent,
    userTagsById,
    profileCollectionCoverUrls: collectionsModule.VRT_PROFILE_COLLECTION_COVER_URLS,
    followers: connectionsModule.VRT_FOLLOWERS,
    following: connectionsModule.VRT_FOLLOWING,
    friends: connectionsModule.VRT_FRIENDS,
    notifications: notificationsModule.VRT_NOTIFICATIONS,
    unreadNotifications: notificationsModule.VRT_UNREAD_NOTIFICATIONS,
    taggedTags: tagsModule.VRT_PROFILE_TAGGED_TAGS,
    otherTaggedTags: tagsModule.VRT_OTHER_PROFILE_TAGGED_TAGS,
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

// Own-profile organisms (RepliesWithParent's parent-post lookup, useProfileConnections'
// cached-stream sync) read Dexie reactively. Resolve promises into React state so
// components leave skeleton states — tests wait for known fixture text first.
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [depsKey]);
      return data;
    },
  };
});

vi.mock('@/stores/home/home.store', () => {
  return {
    useHomeStore: createZustandLikeHook({
      layout: 'columns' as const,
      sort: 'recent' as const,
      reach: 'all' as const,
      content: 'all' as const,
      profileTags: [] as string[],
      taggedAsActive: false,
      hasHydrated: true,
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
      session: { pubky: f.viewerPubky },
      sessionExport: null,
      hasProfile: true,
      hasHydrated: true,
      isRestoringSession: false,
      isLoggingOut: false,
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

// MobileFooter (mounted by ProfilePageLayout) pulls notification + local-files
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

vi.mock('@/hooks/useKeyboardOffset/useKeyboardOffset', () => ({
  useKeyboardOffset: () => ({ isKeyboardVisible: false, keyboardOffset: 0 }),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({
    isPublicRoute: false,
    isCoreExploreRoute: false,
    isDynamicPublicRoute: false,
    isPublicExploreRoute: false,
  }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    requireAuth: (action: () => void) => action(),
    isAuthenticated: true,
  }),
}));

// Posts/Collections tabs (`TimelineFeed`) and the Replies tab (`RepliesWithParent`)
// share this pagination hook — route by stream-id prefix so each tab gets its
// own stable fixture slice.
vi.mock('@/hooks/useStreamPagination/useStreamPagination', async () => {
  const f = await fixtures;
  const buildResult = (postIds: string[]) => ({
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
  });
  return {
    useStreamPagination: ({ streamId }: { streamId: string }) => {
      const id = String(streamId);
      if (id.startsWith('author_replies:')) return buildResult(f.replyIds);
      if (id.endsWith(':author:collection')) return buildResult(f.collectionIds);
      if (id === `author:${f.otherPubky}`) return buildResult(f.otherPostIds);
      if (id.startsWith('author:')) return buildResult(f.postIds);
      return buildResult([]);
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

// Pin the unfollowed CTA so the other-user header shows Follow rather than Following.
vi.mock('@/hooks/useIsFollowing/useIsFollowing', () => {
  const result = { isFollowing: false, isLoading: false };
  return { useIsFollowing: () => result };
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
        postDetails: { ...(fixture.details as object), is_moderated: false, is_blurred: false },
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
      const result = { postCounts: (fixture?.counts as typeof ZERO_COUNTS) ?? ZERO_COUNTS, isLoading: false as const };
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

vi.mock('@/hooks/usePostHeaderVisibility/usePostHeaderVisibility', async () => {
  const f = await fixtures;
  const cache = new Map<string, { showRepostHeader: boolean; shouldShowPostHeader: boolean }>();
  return {
    usePostHeaderVisibility: (compositeId: string) => {
      const cached = cache.get(compositeId);
      if (cached) return cached;
      const fixture = f.entitiesByCompositeId.get(compositeId) as
        | { relationships?: { reposted?: string | null } }
        | undefined;
      const result = {
        showRepostHeader: !!fixture?.relationships?.reposted,
        shouldShowPostHeader: true,
      };
      cache.set(compositeId, result);
      return result;
    },
  };
});

// Shared by post/collection tags (`PostTagsPanel`) and user tags (`UserListItem`
// → `ClickableTagsList` on the Followers/Following/Friends tabs) — keyed by
// composite id first, falling back to a per-user decorative tag list.
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
      const entityFixture = f.entitiesByCompositeId.get(taggedId) as { tags?: unknown[] } | undefined;
      const rawTags = entityFixture?.tags ?? f.userTagsById.get(taggedId) ?? [];
      const tags = rawTags.map((tag) => ({ ...(tag as object), taggers_avatars: [] }));
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

vi.mock('@/hooks/usePostTaggers/usePostTaggers', () => {
  const result = {
    taggersByLabel: new Map<string, string[]>(),
    taggerStates: new Map<string, { isLoading: boolean; error: string | null }>(),
    fetchAllTaggers: async () => {},
  };
  return { usePostTaggers: () => result };
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
      const fixture = f.entitiesByCompositeId.get(postId) as { counts?: { replies?: number } } | undefined;
      const totalCount = fixture?.counts?.replies ?? allIds.length;
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

vi.mock('@/hooks/useDeletePost/useDeletePost', () => ({
  useDeletePost: () => ({ deletePost: async () => {}, isDeleting: false }),
}));

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

// Header (and its descendants) hooks — same rationale as Home/Collections VRT:
// each mock returns the closed/empty state since the screenshot shows the
// header in its default unfocused form.
vi.mock('@/hooks/useHotTags/useHotTags', () => {
  const result = { tags: [], rawTags: [], isLoading: false, error: null, refetch: async () => {} };
  return { useHotTags: () => result };
});

vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', () => {
  const result = { tags: [], users: [], isLoading: false, error: null };
  return { useSearchAutocomplete: () => result };
});

// --- Profile-specific hooks -------------------------------------------------

vi.mock('@/hooks/useUserProfile/useUserProfile', async () => {
  const f = await fixtures;
  const EMPTY = { profile: null, isLoading: false } as const;
  const cache = new Map<string, { profile: unknown; isLoading: false }>();
  return {
    useUserProfile: (userId: string) => {
      if (!userId) return EMPTY;
      const cached = cache.get(userId);
      if (cached) return cached;
      const details = f.profiles[userId];
      if (!details) {
        cache.set(userId, EMPTY);
        return EMPTY;
      }
      const result = {
        profile: {
          name: details.name ?? '',
          bio: details.bio ?? '',
          publicKey: details.id,
          emoji: '🌴',
          status: details.status ?? '',
          avatarUrl: undefined,
          link: `/profile/${details.id}`,
          links: details.links,
        },
        isLoading: false as const,
      };
      cache.set(userId, result);
      return result;
    },
  };
});

vi.mock('@/hooks/useProfileStats/useProfileStats', async () => {
  const f = await fixtures;
  const ownStats = {
    notifications: f.unreadNotifications.length,
    posts: f.postIds.length,
    replies: f.replyIds.length,
    collections: f.collectionIds.length,
    followers: f.followers.length,
    following: f.following.length,
    friends: f.friends.length,
    uniqueTags: f.taggedTags.length,
  };
  const otherStats = {
    notifications: 0,
    posts: f.otherPostIds.length,
    replies: 8,
    collections: 2,
    followers: 11,
    following: 9,
    friends: 4,
    uniqueTags: f.otherTaggedTags.length,
  };
  return {
    useProfileStats: (userId?: string) => ({
      stats: userId === f.otherPubky ? otherStats : ownStats,
      isLoading: false,
    }),
  };
});

vi.mock('@/hooks/useProfileActions/useProfileActions', () => ({
  useProfileActions: () => ({
    onEdit: () => {},
    onCopyPublicKey: () => {},
    onCopyLink: () => {},
    onSignOut: () => {},
    onStatusChange: () => {},
    isLoggingOut: false,
  }),
}));

vi.mock('@/hooks/useNotifications/useNotifications', async () => {
  const f = await fixtures;
  const unreadKeys = new Set(f.unreadNotifications);
  return {
    useNotifications: () => ({
      notifications: f.notifications,
      unreadNotifications: f.unreadNotifications,
      count: f.notifications.length,
      unreadCount: f.unreadNotifications.length,
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null as string | null,
      loadMore: async () => {},
      refresh: async () => {},
      markAllAsRead: () => {},
      isNotificationUnread: (notification: unknown) => unreadKeys.has(notification as never),
    }),
  };
});

vi.mock('@/hooks/useProfileConnections/useProfileConnections', async () => {
  const f = await fixtures;
  const byType: Record<string, readonly unknown[]> = {
    followers: f.followers,
    following: f.following,
    friends: f.friends,
  };
  return {
    useProfileConnections: (type: string) => {
      const connections = byType[type] ?? [];
      return {
        connections,
        count: connections.length,
        isLoading: false,
        isLoadingMore: false,
        error: null as string | null,
        hasMore: false,
        loadMore: async () => {},
        refresh: async () => {},
      };
    },
  };
});

vi.mock('@/hooks/useTagged/useTagged', async () => {
  const f = await fixtures;
  return {
    useTagged: (pubky?: string) => {
      const tags = pubky === f.otherPubky ? f.otherTaggedTags : f.taggedTags;
      return {
        tags,
        count: tags.length,
        isLoading: false,
        isLoadingMore: false,
        hasMore: false,
        loadMore: async () => {},
        handleTagAdd: async () => ({ success: true }),
        handleTagToggle: async () => {},
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
      getAvatarUrl: () => null,
      getFileUrl: ({ fileId }: { fileId: string }) => f.profileCollectionCoverUrls[fileId] ?? null,
      getMetadata: async () => [],
      fetchFiles: async () => [],
    },
  };
});

// `RepliesWithParent` reads relationships/details straight from `PostController`
// (not a data hook) to resolve a reply's parent post.
vi.mock('@/controllers/post/post', async () => {
  const f = await fixtures;
  return {
    PostController: {
      getRelationships: async ({ compositeId }: { compositeId: string }) => {
        const fixture = f.entitiesByCompositeId.get(compositeId) as { relationships?: unknown } | undefined;
        if (!fixture) return null;
        return fixture.relationships ?? { replied: null, reposted: null, mentioned: [] };
      },
      getDetails: async ({ compositeId }: { compositeId: string }) => {
        const fixture = f.entitiesByCompositeId.get(compositeId);
        return fixture ? { ...(fixture.details as object) } : null;
      },
      getOrFetch: async ({ compositeId }: { compositeId: string }) => {
        const fixture = f.entitiesByCompositeId.get(compositeId);
        return fixture ? { ...(fixture.details as object) } : null;
      },
    },
  };
});

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

function ProfileWithChrome({ children, pubky }: { children: React.ReactNode; pubky?: Pubky }) {
  return (
    <>
      <Header />
      <ProfileProvider pubky={pubky}>
        <ProfilePageContainer>{children}</ProfilePageContainer>
      </ProfileProvider>
    </>
  );
}

async function renderProfileTab(
  pathname: string,
  page: React.ReactNode,
  viewport: { width: number; height: number },
  pubky?: Pubky,
) {
  routeState.pathname = pathname;
  routeState.params = pubky ? { pubky } : {};
  return renderForVRT(<ProfileWithChrome pubky={pubky}>{page}</ProfileWithChrome>, { viewport });
}

async function renderOwnProfileTab(
  pathname: string,
  page: React.ReactNode,
  viewport: { width: number; height: number },
) {
  return renderProfileTab(pathname, page, viewport);
}

function resetVrtRootScroll() {
  const root = document.querySelector(`[data-testid="${VRT_ROOT_TESTID}"]`);
  if (root instanceof HTMLElement) {
    root.scrollTop = 0;
    root.scrollLeft = 0;
  }
  window.scrollTo(0, 0);
}

describe('Own profile — notifications — visual regression', () => {
  it('renders notifications at desktop viewport', async () => {
    const screen = await renderOwnProfileTab('/profile', <ProfileNotificationsPage />, VRT_VIEWPORT_DESKTOP);
    // "Hana Voss" appears twice (Follow + PostEdited actor) — scope to the first match.
    await expect.element(screen.getByText('Hana Voss').first()).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-notifications-desktop');
  });

  it('renders notifications at mobile viewport', async () => {
    const screen = await renderOwnProfileTab('/profile', <ProfileNotificationsPage />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByText('Hana Voss').first()).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-notifications-mobile');
  });
});

describe('Own profile — posts — visual regression', () => {
  it('renders posts at desktop viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/posts', <ProfilePostsPage />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByRole('feed').first()).toBeVisible();
    await expect.element(screen.getByText(/The round-trip used to be the whole conversation/)).toBeVisible();
    await expect.element(screen.getByText('9 more replies')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-posts-desktop');
  });

  it('renders posts at mobile viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/posts', <ProfilePostsPage />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByRole('feed').first()).toBeVisible();
    await expect.element(screen.getByText(/The round-trip used to be the whole conversation/)).toBeVisible();
    await expect.element(screen.getByText('9 more replies')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-posts-mobile');
  });

  it('truncates a long profile name before the status emoji at desktop viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/posts', <ProfilePostsPage />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByRole('feed').first()).toBeVisible();

    const header = screen.getByTestId('profile-page-header');
    const name = header.element().querySelector('[data-cy="profile-username-header"]');
    const statusEmoji = header.getByRole('button', { name: 'Vacationing status' }).element();

    expect(name).toBeInstanceOf(HTMLElement);
    if (!(name instanceof HTMLElement)) return;

    // Exercise truncation and descenders without changing the shared profile fixture and every profile baseline.
    name.textContent = `Orange-Otter-Phoenix-${'gypqj'.repeat(16)}`;

    const nameStyle = getComputedStyle(name);

    expect(nameStyle.lineHeight).toBe('60px');
    expect(nameStyle.overflow).toBe('hidden');
    // Descender room comes from padding (0.15em at 60px), cancelled out of layout
    // by the matching negative margin — works in WebKit too, unlike the previous
    // overflow-clip-margin approach (unsupported there, so Safari kept clipping).
    expect(nameStyle.paddingBottom).toBe('9px');
    expect(nameStyle.marginBottom).toBe('-9px');
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    expect(name.getBoundingClientRect().right).toBeLessThan(statusEmoji.getBoundingClientRect().left);
  });
});

describe('Own profile — replies — visual regression', () => {
  it('renders replies at desktop viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/replies', <ProfileRepliesPage />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByRole('feed')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-replies-desktop');
  });

  it('renders replies at mobile viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/replies', <ProfileRepliesPage />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByRole('feed')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-replies-mobile');
  });
});

describe('Own profile — followers — visual regression', () => {
  it('renders followers at desktop viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/followers', <ProfileFollowersPage />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByText('Bran Ó Conaill')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-followers-desktop');
  });

  it('renders followers at mobile viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/followers', <ProfileFollowersPage />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByText('Bran Ó Conaill')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-followers-mobile');
  });
});

describe('Own profile — following — visual regression', () => {
  it('renders following at desktop viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/following', <ProfileFollowingPage />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByText('Bran Ó Conaill')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-following-desktop');
  });

  it('renders following at mobile viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/following', <ProfileFollowingPage />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByText('Bran Ó Conaill')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-following-mobile');
  });
});

describe('Own profile — friends — visual regression', () => {
  it('renders friends at desktop viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/friends', <ProfileFriendsPage />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByText('Bran Ó Conaill')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-friends-desktop');
  });

  it('renders friends at mobile viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/friends', <ProfileFriendsPage />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByText('Bran Ó Conaill')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-friends-mobile');
  });
});

describe('Own profile — tagged — visual regression', () => {
  it('renders tagged at desktop viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/tagged', <ProfileTaggedPage />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByText('localfirst')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-tagged-desktop');
  });

  it('renders tagged at mobile viewport', async () => {
    const screen = await renderOwnProfileTab('/profile/tagged', <ProfileTaggedPage />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByText('localfirst')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-tagged-mobile');
  });
});

describe('Own profile — collections — visual regression', () => {
  // `CollectionCard` paints its cover via CSS `background-image`, which
  // `renderForVRT` does not wait on (only `<img>` elements) — preload
  // explicitly so the cover is decoded before the screenshot.
  it('renders collections at desktop viewport', async () => {
    const f = await fixtures;
    await preloadImages(Object.values(f.profileCollectionCoverUrls));
    const screen = await renderOwnProfileTab('/profile/collections', <ProfileCollectionsPage />, VRT_VIEWPORT_DESKTOP);
    await expect.element(screen.getByRole('feed')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-collections-desktop');
  });

  it('renders collections at mobile viewport', async () => {
    const f = await fixtures;
    await preloadImages(Object.values(f.profileCollectionCoverUrls));
    const screen = await renderOwnProfileTab('/profile/collections', <ProfileCollectionsPage />, VRT_VIEWPORT_MOBILE);
    await expect.element(screen.getByRole('feed')).toBeVisible();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('own-profile-collections-mobile');
  });
});

describe('Other profile — posts — visual regression', () => {
  // Default `/profile/[pubky]` tab. Chrome differs from own profile (Follow CTA,
  // no notifications tab / status picker). Other tabs reuse the same shells.
  // Other-user mobile posts auto-scroll the feed under the sticky menu; reset
  // to the top so the screenshot keeps the header and Follow button in frame.
  async function renderOtherProfilePosts(viewport: { width: number; height: number }) {
    const f = await fixtures;
    const screen = await renderProfileTab(`/profile/${f.otherPubky}`, <ProfilePostsPage />, viewport, f.otherPubky);
    await expect.element(screen.getByText('Bran Ó Conaill').first()).toBeVisible();
    await expect.element(screen.getByRole('button', { name: /^Follow$/ })).toBeVisible();
    await expect.element(screen.getByText(/Cold brew helps both/)).toBeVisible();
    await expect.element(screen.getByText(/Cold brew as a consensus primitive/)).toBeVisible();
    await expect.element(screen.getByText('5 more replies')).toBeVisible();
    await expect.element(screen.getByRole('feed').first()).toBeVisible();
    resetVrtRootScroll();
    return screen;
  }

  it("renders another user's posts at desktop viewport", async () => {
    const screen = await renderOtherProfilePosts(VRT_VIEWPORT_DESKTOP);
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('other-profile-posts-desktop');
  });

  it("renders another user's posts at mobile viewport", async () => {
    const screen = await renderOtherProfilePosts(VRT_VIEWPORT_MOBILE);
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('other-profile-posts-mobile');
  });
});
