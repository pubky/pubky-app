'use client';

import { Check } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useUnlockedListContext } from '@/providers/UnlockedListProvider/UnlockedListProvider';
import { ProfileUnlockedSkeleton } from './ProfileUnlocked.skeleton';
import { ProfileUnlockedItem } from './ProfileUnlockedItem';

/**
 * The signed-in user's unlocked content, newest unlock first. Reads the list from
 * `UnlockedListProvider` so the sidebar count and this screen share one enumeration.
 */
export function ProfileUnlocked() {
  const { items, isLoading, isError } = useUnlockedListContext();

  if (isLoading) return <ProfileUnlockedSkeleton />;

  if (isError || items.length === 0) {
    return (
      <Container overrideDefaults data-cy="profile-unlocked-empty" className="w-full">
        <Typography overrideDefaults className="text-center text-base font-medium text-muted-foreground">
          {isError ? "Couldn't load your unlocked content. Try again later." : "You haven't unlocked any content yet."}
        </Typography>
      </Container>
    );
  }

  return (
    <Container data-cy="profile-unlocked" className="gap-4">
      <Container overrideDefaults className="flex items-center gap-1.5 text-brand">
        <Check className="size-4 shrink-0" aria-hidden />
        <Typography overrideDefaults as="span" className="text-xs leading-4 font-medium tracking-[1.2px] uppercase">
          {'Unlocked'}
        </Typography>
      </Container>

      {items.map((item) => (
        <ProfileUnlockedItem key={item.lockId} post={item.post} announcementPostId={item.announcementPostId} />
      ))}
    </Container>
  );
}
