'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { FileController } from '@/controllers/file/file';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
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
  const bookmarkCount = useLiveQuery(async () => {
    if (!currentUserPubky) return undefined;
    // The model error is already logged; the badge just stays hidden.
    return await BookmarkController.getCount().catch(() => undefined);
  }, [currentUserPubky]);

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
