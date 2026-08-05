'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useUnlockedListContext } from '@/providers/UnlockedListProvider/UnlockedListProvider';
import { ProfileUnlockedSkeleton } from './ProfileUnlocked.skeleton';
import { ProfileUnlockedCard } from './ProfileUnlockedCard';

/**
 * The signed-in user's unlocked content, newest unlock first. Reads the list from
 * `UnlockedListProvider` so the sidebar count and this screen share one enumeration.
 */
export function ProfileUnlocked() {
  const { items, isLoading, isError } = useUnlockedListContext();
  const t = useTranslations('profile.unlocked');
  const tLock = useTranslations('post.lock');

  if (isLoading) return <ProfileUnlockedSkeleton />;

  if (isError || items.length === 0) {
    return (
      <Container overrideDefaults data-cy="profile-unlocked-empty" className="w-full">
        <Typography overrideDefaults className="text-center text-base font-medium text-muted-foreground">
          {isError ? t('error') : t('empty')}
        </Typography>
      </Container>
    );
  }

  return (
    <Container data-cy="profile-unlocked" className="gap-4">
      <Container overrideDefaults className="flex items-center gap-1.5 text-brand">
        <Check className="size-4 shrink-0" aria-hidden />
        <Typography overrideDefaults as="span" className="text-xs leading-4 font-medium tracking-[1.2px] uppercase">
          {tLock('unlocked')}
        </Typography>
      </Container>

      {items.map((item) => (
        <ProfileUnlockedCard key={item.lockId} post={item.post} />
      ))}
    </Container>
  );
}
