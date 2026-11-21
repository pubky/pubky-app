'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { FileController } from '@/controllers/file/file';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';

interface UseBookmarksCollectionSummaryResult {
  avatarName: string;
  avatarSeed: string;
  avatarUrl?: string;
  bookmarkCount?: number;
  isProfileResolved: boolean;
}

export function useBookmarksCollectionSummary(): UseBookmarksCollectionSummaryResult {
  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const localAvatarUrl = useLocalFilesStore((state) => state.profile);

  // A bookmark counts as a post until its cached details say it is a followed collection, so the
  // number is right only once every bookmarked post is cached. That is the local-first read: a
  // miss (`null`) while a bookmarked post has no details, which fetches them through `by_ids`, and
  // settled when the fetch is, whatever came back. A post Nexus does not serve stays a miss, so it is
  // asked for on every mount, and keeps counting as a post, as the Bookmarks list shows it. When
  // every bookmarked post is cached nothing is fetched.
  const { isLoading: isClassifying } = useLocalFirstQuery<true>({
    queryFn: async () => ((await BookmarkController.getMissingPostIds()).length === 0 ? true : null),
    fetchFn: () => BookmarkController.fetchMissingPosts(),
    deps: [currentUserPubky],
    enabled: !!currentUserPubky,
  });

  // Counted locally and live: bookmarks are private, so Nexus has no count of them, and the local
  // table, hydrated from the homeserver listing at bootstrap, names every one (ADR-0028). Read only
  // once the bookmarks are classified, so the first number is one read after the fetch stored its
  // posts; undefined until then.
  const liveCount = useLiveQuery(async () => {
    if (!currentUserPubky || isClassifying) return undefined;
    // The model error is already logged; the badge just stays hidden.
    return await BookmarkController.getCount().catch(() => undefined);
  }, [currentUserPubky, isClassifying]);
  // The live query keeps its last result while a new read is pending: never show it across one.
  const bookmarkCount = isClassifying ? undefined : liveCount;

  const avatarUrl =
    localAvatarUrl ??
    (currentUserPubky && userDetails?.image
      ? FileController.getAvatarUrl(currentUserPubky, userDetails.indexed_at)
      : undefined);
  const avatarName = userDetails?.name || 'U';

  return {
    avatarName,
    avatarSeed: currentUserPubky ?? avatarName,
    avatarUrl,
    bookmarkCount,
    isProfileResolved: userDetails != null,
  };
}
