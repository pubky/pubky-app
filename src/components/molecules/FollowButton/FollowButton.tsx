'use client';

import { Check, Loader2, UserMinus, UserRoundPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

interface FollowButtonProps {
  isFollowing: boolean;
  isLoading: boolean;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}

/**
 * FollowButton
 *
 * Prop-driven follow/unfollow button: "Following" flips to "Unfollow" on
 * hover, spinner while the action is in flight. Callers own the data
 * (isFollowing/isLoading) and the click handler.
 */
export function FollowButton({ isFollowing, isLoading, onClick, className }: FollowButtonProps) {
  const t = useTranslations('userList');
  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn('group gap-2', className)}
      onClick={onClick}
      disabled={isLoading}
      aria-label={isFollowing ? t('unfollow') : t('follow')}
    >
      {isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : isFollowing ? (
        <>
          <Check className="size-4 group-hover:hidden" />
          <Typography className="text-xs leading-4 font-bold group-hover:hidden" overrideDefaults>
            {t('following')}
          </Typography>
          <UserMinus className="hidden size-4 group-hover:block" />
          <Typography className="hidden text-xs leading-4 font-bold group-hover:block" overrideDefaults>
            {t('unfollow')}
          </Typography>
        </>
      ) : (
        <>
          <UserRoundPlus className="size-4" />
          <Typography className="text-xs leading-4 font-bold" overrideDefaults>
            {t('follow')}
          </Typography>
        </>
      )}
    </Button>
  );
}
