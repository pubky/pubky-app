'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import type { PostHeaderProps } from './PostHeader.types';

const ENABLE_VERIFIED_BADGES = true;

export function formatPostTimestamp(date: Date): string {
  return date.toISOString();
}

export function PostHeader({
  postId,
  isReplyInput = false,
  characterLimit,
  showPopover = true,
  size = 'normal',
  timeAgoPlacement = 'top-right',
}: PostHeaderProps) {
  const t = useTranslations('common');

  const userId = isReplyInput ? postId : postId.split(':')[0];

  const { postDetails } = Hooks.usePostDetails(isReplyInput ? null : postId);

  const { userDetails } = Hooks.useUserDetails(userId);

  const avatarUrl = Hooks.useAvatarUrl(userDetails);

  const { formatRelativeTime } = Hooks.useRelativeTime();

  const displayName = React.useMemo(() => {
    if (!userDetails) return '';
    return userDetails.name || userId.slice(0, 8);
  }, [userDetails, userId]);

  const isLoading = !userDetails || (!isReplyInput && !postDetails);

  if (isLoading) {
    return (
      <Atoms.Container className="text-muted-foreground" overrideDefaults>
        {t('loadingHeader')}
      </Atoms.Container>
    );
  }

  const isVerified = ENABLE_VERIFIED_BADGES ? userDetails?.name !== undefined : false;

  const timeAgo = !isReplyInput && postDetails ? formatRelativeTime(new Date(postDetails.indexed_at)) : null;

  return (
    <Atoms.Container className="flex min-w-0 items-start justify-between gap-3" overrideDefaults>
      <Molecules.PostHeaderUserInfo
        userId={userId}
        userName={isVerified ? displayName : displayName}
        avatarUrl={avatarUrl}
        characterLimit={characterLimit}
        showPopover={showPopover}
        size={size}
        timeAgo={timeAgoPlacement === 'bottom-left' ? timeAgo : null}
      />
      {timeAgo && timeAgoPlacement === 'top-right' && <Molecules.PostHeaderTimestamp timeAgo={timeAgo} />}
    </Atoms.Container>
  );
}
