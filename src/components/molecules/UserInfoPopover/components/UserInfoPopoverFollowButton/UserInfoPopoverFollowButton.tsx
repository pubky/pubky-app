'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import { Loader2, Check, UserMinus, UserRoundPlus } from 'lucide-react';
interface UserInfoPopoverFollowButtonProps {
  isFollowing: boolean;
  isLoading: boolean;
  onClick: (e: React.MouseEvent) => void;
}
export function UserInfoPopoverFollowButton({ isFollowing, isLoading, onClick }: UserInfoPopoverFollowButtonProps) {
  const t = useTranslations('userList');
  return (
    <Atoms.Button
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
          <Atoms.Typography className="text-xs leading-4 font-bold group-hover:hidden" overrideDefaults>
            {t('following')}
          </Atoms.Typography>
          <UserMinus className="hidden size-4 group-hover:block" />
          <Atoms.Typography className="hidden text-xs leading-4 font-bold group-hover:block" overrideDefaults>
            {t('unfollow')}
          </Atoms.Typography>
        </>
      ) : (
        <>
          <UserRoundPlus className="size-4" />
          <Atoms.Typography className="text-xs leading-4 font-bold" overrideDefaults>
            {t('follow')}
          </Atoms.Typography>
        </>
      )}
    </Atoms.Button>
  );
}
