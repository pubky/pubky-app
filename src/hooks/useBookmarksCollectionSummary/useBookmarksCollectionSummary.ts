'use client';

import { FileController } from '@/controllers/file/file';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';

interface UseBookmarksCollectionSummaryResult {
  currentUserPubky: string | null;
  avatarName: string;
  avatarSeed: string;
  avatarUrl?: string;
  bookmarkCount?: number;
  isBookmarkCountLoading: boolean;
}

export function useBookmarksCollectionSummary(): UseBookmarksCollectionSummaryResult {
  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const localAvatarUrl = useLocalFilesStore((state) => state.profile);

  const { data: bookmarksStream, isLoading: isBookmarkCountLoading } = useLocalFirstQuery({
    queryFn: () => StreamPostsController.getLocalStream({ streamId: PostStreamTypes.TIMELINE_BOOKMARKS_ALL }),
    fetchFn: async () => undefined,
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
    currentUserPubky,
    avatarName,
    avatarSeed: currentUserPubky ?? avatarName,
    avatarUrl,
    bookmarkCount: bookmarksStream?.stream.length,
    isBookmarkCountLoading,
  };
}
