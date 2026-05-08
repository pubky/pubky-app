'use client';

import { useRouter } from 'next/navigation';
import { Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getProfileRoute, PROFILE_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { TaggedItem } from '../TaggedItem/TaggedItem';
import { ProfilePageTaggedAsSkeleton } from './ProfilePageTaggedAs.skeleton';
import type { ProfilePageTaggedAsProps } from './ProfilePageTaggedAs.types';

export function ProfilePageTaggedAs({ tags, isLoading = false, onTagClick, pubky }: ProfilePageTaggedAsProps) {
  const t = useTranslations('profile.sidebar');
  const router = useRouter();
  const { requireAuth } = useRequireAuth();

  // Handle button click - require auth for unauthenticated users
  const handleButtonClick = () => {
    requireAuth(() => router.push(getProfileRoute(PROFILE_ROUTES.UNIQUE_TAGS, pubky)));
  };
  return (
    <Container data-cy="profile-tagged-section" overrideDefaults={true} className="flex flex-col gap-2">
      <Heading level={2} size="lg" className="font-light text-muted-foreground">
        {t('taggedAs')}
      </Heading>

      <Container overrideDefaults={true} className="flex flex-col gap-2">
        {isLoading ? (
          <ProfilePageTaggedAsSkeleton />
        ) : (
          <>
            {tags.map((tag) => (
              <TaggedItem key={tag.label} tag={tag} onTagClick={onTagClick} hideAvatars />
            ))}
            {tags.length === 0 && (
              <Typography as="span" className="text-sm font-medium text-muted-foreground">
                {t('noTags')}
              </Typography>
            )}
          </>
        )}
      </Container>

      <Button
        data-cy="profile-tag-btn"
        variant="outline"
        size="sm"
        className="border border-border bg-foreground/5"
        onClick={handleButtonClick}
      >
        <Tag size={16} className="text-foreground" />
        <Typography as="span" className="text-sm font-bold">
          {t('addTag')}
        </Typography>
      </Button>
    </Container>
  );
}
