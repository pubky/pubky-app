'use client';

import { Typography } from '@/atoms/Typography/Typography';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { cn } from '@/libs/utils/utils';
import { AvatarWithFallback } from '../AvatarWithFallback/AvatarWithFallback';

interface QuickReplyCollapsedContentProps {
  currentUserPubky: string | null;
  displayPlaceholder: string;
  isWideLayout: boolean;
}

/** Minimal top-level reply prompt shown before the composer expands. */
export function QuickReplyCollapsedContent({
  currentUserPubky,
  displayPlaceholder,
  isWideLayout,
}: QuickReplyCollapsedContentProps) {
  const { userDetails } = useUserDetails(currentUserPubky);
  const avatarUrl = useAvatarUrl(userDetails);
  const displayName = userDetails?.name ?? currentUserPubky ?? '';

  return (
    <>
      <AvatarWithFallback
        avatarUrl={avatarUrl}
        name={displayName}
        fallbackSeed={currentUserPubky ?? 'user'}
        size={isWideLayout ? 'xl' : 'default'}
        alt={displayName}
        data-testid={currentUserPubky ? 'quick-reply-avatar' : 'quick-reply-fallback-avatar'}
      />
      <Typography
        overrideDefaults
        className={cn(
          'min-w-0 flex-1 truncate text-left font-medium text-input',
          isWideLayout ? 'text-xl leading-7' : 'text-base leading-6',
        )}
        data-testid="quick-reply-placeholder"
      >
        {displayPlaceholder}
      </Typography>
    </>
  );
}
