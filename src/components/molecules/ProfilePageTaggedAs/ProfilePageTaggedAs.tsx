'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import { useRouter } from 'next/navigation';
import { PROFILE_ROUTES, getProfileRoute } from '@/app/routes';
import type { ProfilePageTaggedAsProps } from './ProfilePageTaggedAs.types';
import { ProfilePageTaggedAsSkeleton } from './ProfilePageTaggedAs.skeleton';
import { Tag } from 'lucide-react';
export function ProfilePageTaggedAs({ tags, isLoading = false, onTagClick, pubky }: ProfilePageTaggedAsProps) {
  const t = useTranslations('profile.sidebar');
  const router = useRouter();
  const { requireAuth } = Hooks.useRequireAuth();

  // Handle button click - require auth for unauthenticated users
  const handleButtonClick = () => {
    requireAuth(() => router.push(getProfileRoute(PROFILE_ROUTES.UNIQUE_TAGS, pubky)));
  };
  return (
    <Atoms.Container data-cy="profile-tagged-section" overrideDefaults={true} className="flex flex-col gap-2">
      <Atoms.Heading level={2} size="lg" className="font-light text-muted-foreground">
        {t('taggedAs')}
      </Atoms.Heading>

      <Atoms.Container overrideDefaults={true} className="flex flex-col gap-2">
        {isLoading ? (
          <ProfilePageTaggedAsSkeleton />
        ) : (
          <>
            {tags.map((tag) => (
              <Molecules.TaggedItem key={tag.label} tag={tag} onTagClick={onTagClick} hideAvatars />
            ))}
            {tags.length === 0 && (
              <Atoms.Typography as="span" className="text-sm font-medium text-muted-foreground">
                {t('noTags')}
              </Atoms.Typography>
            )}
          </>
        )}
      </Atoms.Container>

      <Atoms.Button
        data-cy="profile-tag-btn"
        variant="outline"
        size="sm"
        className="border border-border bg-foreground/5"
        onClick={handleButtonClick}
      >
        <Tag size={16} className="text-foreground" />
        <Atoms.Typography as="span" className="text-sm font-bold">
          {t('addTag')}
        </Atoms.Typography>
      </Atoms.Button>
    </Atoms.Container>
  );
}
