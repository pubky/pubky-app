'use client';

import { FileController } from '@/controllers/file/file';
import { UserController } from '@/controllers/user/user';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';

/**
 * Shared owner profile and bookmark count for collections surfaces.
 */
export function useCollectionsOwner() {
  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const localAvatarUrl = useLocalFilesStore((state) => state.profile);
  const { data: userCounts, isLoading: isCountsLoading } = useLocalFirstQuery({
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
  const avatarSeed = currentUserPubky ?? avatarName;

  return {
    currentUserPubky,
    avatarUrl,
    avatarName,
    avatarSeed,
    bookmarkCount: userCounts?.bookmarks ?? 0,
    isCountsLoading,
  };
}
