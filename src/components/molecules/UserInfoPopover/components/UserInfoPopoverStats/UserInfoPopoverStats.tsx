'use client';

import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { AvatarGroup } from '../../../AvatarGroup/AvatarGroup';

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
    <Container className="flex-1 items-start gap-2">
      <Typography
        className="text-xs leading-4 font-medium tracking-[1.2px] whitespace-pre-wrap text-muted-foreground uppercase"
        overrideDefaults
      >
        <Typography as="span" className="text-foreground" overrideDefaults>
          {count}
        </Typography>{' '}
        {label}
      </Typography>
      {avatars.length > 0 ? <AvatarGroup items={avatars} totalCount={count} maxAvatars={maxAvatars} /> : null}
    </Container>
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
    <Container className="flex items-start gap-2.5" overrideDefaults>
      <StatsColumn count={followersCount} label={t('followers')} avatars={followersAvatars} maxAvatars={maxAvatars} />
      <StatsColumn
        count={followingCount}
        label={t('followingLabel')}
        avatars={followingAvatars}
        maxAvatars={maxAvatars}
      />
    </Container>
  );
}
