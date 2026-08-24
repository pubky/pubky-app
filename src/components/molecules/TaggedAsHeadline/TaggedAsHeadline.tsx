'use client';

import { Typography } from '@/atoms/Typography/Typography';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';

// Long-form disjunction list formatting: "a, b, or c".
const disjunctionList = new Intl.ListFormat('en-US', { style: 'long', type: 'disjunction' });

export function TaggedAsHeadline() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const taggedAsActive = useHomeStore((state) => state.taggedAsActive);
  const profileTags = useHomeStore((state) => state.profileTags);

  if (!currentUserPubky || !taggedAsActive || profileTags.length === 0) {
    return null;
  }

  const formattedTags = disjunctionList.format(profileTags.map((tag) => `‘${tag}’`));

  return (
    <Typography size="lg" className="font-medium text-muted-foreground" data-testid="tagged-as-headline">
      {`Posts from people tagged as ${formattedTags} by my network`}
    </Typography>
  );
}
