'use client';

import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { isPostDeleted } from '@/libs/utils/utils';
import { PostHeaderTimestamp } from '@/molecules/PostHeaderTimestamp/PostHeaderTimestamp';
import { PostHeaderUserInfo } from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo';
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
  const { postDetails } = usePostDetails(isReplyInput ? null : postId);

  // Fetch user details for avatar and name
  const { userDetails, isLoading: isLoadingUserDetails } = useUserDetails(userId);

  // Compute avatar URL from user details (only if the user has an image)
  const avatarUrl = useAvatarUrl(userDetails);

  const { formatRelativeTime } = useRelativeTime();

  // once the query settles we render regardless of whether it found a
  // profile — a missed local read + failed Nexus fetch must not hide the avatar,
  // pubky and character counter behind a permanent skeleton.
  const isLoading = isLoadingUserDetails || (!isReplyInput && !postDetails);

  // Every parent renders its own header-less deleted state (PostDeleted), but
  // from a separate usePostDetails instance that can resolve after this one.
  // Never commit author data for a deleted post — hold the skeleton until the
  // parent swaps it out, so a username can't flash and then vanish.
  const isDeleted = !isReplyInput && isPostDeleted(postDetails?.content);

  if (isLoading || isDeleted) {
    return <PostHeaderSkeleton />;
  }

  const indexedAt = !isReplyInput && postDetails ? new Date(postDetails.indexed_at) : null;
  const timeAgo = indexedAt ? formatRelativeTime(indexedAt) : null;

  return (
    <Container
      className="grid w-full max-w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3"
      overrideDefaults
    >
      <div className="w-full max-w-full min-w-0">
        <PostHeaderUserInfo
          userId={userId}
          userName={userDetails?.name || ''}
          avatarUrl={avatarUrl}
          showPopover={showPopover}
          size={size}
          timeAgo={timeAgoPlacement === 'bottom-left' ? timeAgo : null}
          indexedAt={timeAgoPlacement === 'bottom-left' ? indexedAt : null}
        />
      </div>
      {characterLimit ? (
        <Typography
          data-cy="post-header-character-count"
          className="shrink-0 text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground tabular-nums"
          overrideDefaults
        >
          {characterLimit.count}/{characterLimit.max}
        </Typography>
      ) : (
        timeAgo && timeAgoPlacement === 'top-right' && <PostHeaderTimestamp timeAgo={timeAgo} indexedAt={indexedAt} />
      )}
    </Container>
  );
}
