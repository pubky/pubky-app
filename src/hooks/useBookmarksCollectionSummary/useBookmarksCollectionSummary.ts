'use client';

import { FileController } from '@/controllers/file/file';
import { UserController } from '@/controllers/user/user';
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

  // The count comes from the Nexus aggregate counts, not the bookmarks stream:
  // the stream only holds the currently paginated page, so its length
  // under-reports the true total once there is more than one page.
  const { data: userCounts } = useLocalFirstQuery({
    queryFn: () => UserController.getCounts({ userId: currentUserPubky! }),
    fetchFn: () => UserController.fetchCounts({ userId: currentUserPubky! }),
    deps: [currentUserPubky],
    enabled: !!currentUserPubky,
  });

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
    bookmarkCount: userCounts?.bookmarks,
    isProfileResolved: userDetails != null,
  };
}
