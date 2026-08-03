'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Typography } from '@/atoms/Typography/Typography';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';

export function TaggedAsHeadline() {
  const t = useTranslations('filters.reach');
  const format = useFormatter();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const taggedAsActive = useHomeStore((state) => state.taggedAsActive);
  const profileTags = useHomeStore((state) => state.profileTags);

  if (!currentUserPubky || !taggedAsActive || profileTags.length === 0) {
    return null;
  }

  const formattedTags = format.list(
    profileTags.map((tag) => t('taggedAsTag', { tag })),
    { type: 'disjunction', style: 'long' },
  );

  return (
    <Typography size="lg" className="font-medium text-muted-foreground" data-testid="tagged-as-headline">
      {t('taggedAsHeadline', { tags: formattedTags })}
    </Typography>
  );
}
