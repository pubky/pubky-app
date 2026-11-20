'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { FileController } from '@/controllers/file/file';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useResourceBookmarks } from '@/hooks/useResourceBookmarks/useResourceBookmarks';
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

  // Counted locally and live: bookmarks are private, so Nexus has no count of them, and the local
  // table, hydrated from the homeserver listing at bootstrap, names every one (ADR-0028).
  // Undefined until the first read resolves.
  const postBookmarkCount = useLiveQuery(async () => {
    if (!currentUserPubky) return undefined;
    // The model error is already logged; the badge just stays hidden.
    return await BookmarkController.getCount().catch(() => undefined);
  }, [currentUserPubky]);

  // The bookmarked links (external resources) have no local row: their homeserver listing adds them.
  const resourceBookmarks = useResourceBookmarks();
  // No number until both are read, so the badge does not jump when the links arrive.
  const bookmarkCount =
    postBookmarkCount === undefined || resourceBookmarks === undefined
      ? undefined
      : postBookmarkCount + resourceBookmarks.length;

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
