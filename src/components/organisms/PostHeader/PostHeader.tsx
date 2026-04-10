'use client';

import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import { PostHeaderSkeleton } from './PostHeader.skeleton';
import type { PostHeaderProps } from './PostHeader.types';

export function PostHeader({
  postId,
  isReplyInput = false,
  characterLimit,
  showPopover = true,
  size = 'normal',
  timeAgoPlacement = 'top-right',
}: PostHeaderProps) {
  // Extract userId from postId (format: userId:postId or just userId if isReplyInput is true)
  const userId = isReplyInput ? postId : postId.split(':')[0];

  // When isReplyInput is true, skip fetching post details since there's no post yet
  const { postDetails } = Hooks.usePostDetails(isReplyInput ? null : postId);

  // Fetch user details for avatar and name
  const { userDetails } = Hooks.useUserDetails(userId);

  // Compute avatar URL from user details (only if the user has an image)
  const avatarUrl = Hooks.useAvatarUrl(userDetails);

  const { formatRelativeTime } = Hooks.useRelativeTime();

  const isLoading = !userDetails || (!isReplyInput && !postDetails);

  if (isLoading) {
    return <PostHeaderSkeleton />;
  }

  const indexedAt = !isReplyInput && postDetails ? new Date(postDetails.indexed_at) : null;
  const timeAgo = indexedAt ? formatRelativeTime(indexedAt) : null;

  return (
    <Atoms.Container className="flex min-w-0 items-start justify-between gap-3" overrideDefaults>
      <Molecules.PostHeaderUserInfo
        userId={userId}
        userName={userDetails.name || ''}
        avatarUrl={avatarUrl}
        characterLimit={characterLimit}
        showPopover={showPopover}
        size={size}
        timeAgo={timeAgoPlacement === 'bottom-left' ? timeAgo : null}
        indexedAt={timeAgoPlacement === 'bottom-left' ? indexedAt : null}
      />
      {timeAgo && timeAgoPlacement === 'top-right' && (
        <Molecules.PostHeaderTimestamp timeAgo={timeAgo} indexedAt={indexedAt} />
      )}
    </Atoms.Container>
  );
}
