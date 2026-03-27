'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import type { AvatarGroupItem } from '@/molecules/AvatarGroup/AvatarGroup.types';

interface UserInfoPopoverStatsProps {
  followersCount: number;
  followingCount: number;
  followersAvatars: AvatarGroupItem[];
  followingAvatars: AvatarGroupItem[];
  maxAvatars: number;
}

function StatsColumn({
  count,
  label,
  avatars,
  maxAvatars,
}: {
  count: number;
  label: string;
  avatars: AvatarGroupItem[];
  maxAvatars: number;
}) {
  return (
    <Atoms.Container className="flex-1 items-start gap-2">
      <Atoms.Typography
        className="text-xs leading-4 font-medium tracking-[1.2px] whitespace-pre-wrap text-muted-foreground uppercase"
        overrideDefaults
      >
        <Atoms.Typography as="span" className="text-foreground" overrideDefaults>
          {count}
        </Atoms.Typography>{' '}
        {label}
      </Atoms.Typography>
      {avatars.length > 0 ? <Molecules.AvatarGroup items={avatars} totalCount={count} maxAvatars={maxAvatars} /> : null}
    </Atoms.Container>
  );
}

export function UserInfoPopoverStats({
  followersCount,
  followingCount,
  followersAvatars,
  followingAvatars,
  maxAvatars,
}: UserInfoPopoverStatsProps) {
  const t = useTranslations('userList');

  return (
    <Atoms.Container className="flex items-start gap-2.5" overrideDefaults>
      <StatsColumn count={followersCount} label={t('followers')} avatars={followersAvatars} maxAvatars={maxAvatars} />
      <StatsColumn
        count={followingCount}
        label={t('followingLabel')}
        avatars={followingAvatars}
        maxAvatars={maxAvatars}
      />
    </Atoms.Container>
  );
}
