'use client';

import { Check, Loader2, UserMinus, UserRoundPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';

interface UserInfoPopoverFollowButtonProps {
  isFollowing: boolean;
  isLoading: boolean;
  onClick: (e: React.MouseEvent) => void;
}
export function UserInfoPopoverFollowButton({ isFollowing, isLoading, onClick }: UserInfoPopoverFollowButtonProps) {
  const t = useTranslations('userList');
  return (
    <Button
      variant="secondary"
      size="sm"
      className="group gap-2"
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
