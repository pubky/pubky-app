'use client';

import { Bookmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { COLLECTION_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { FileController } from '@/controllers/file/file';
import { UserController } from '@/controllers/user/user';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { CollectionCard } from '@/molecules/Collections/CollectionCard/CollectionCard';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';

export function Collections() {
  const t = useTranslations('collections');
  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const localAvatarUrl = useLocalFilesStore((state) => state.profile);
  const { data: userCounts } = useLocalFirstQuery({
    queryFn: () => UserController.getCounts({ userId: currentUserPubky! }),
    fetchFn: () => UserController.fetchCounts({ userId: currentUserPubky! }),
    deps: [currentUserPubky],
    enabled: !!currentUserPubky,
  });
  const avatarUrl =
    localAvatarUrl ??
    (currentUserPubky && userDetails?.image
      ? FileController.getAvatarUrl(currentUserPubky, userDetails.indexed_at)
      : undefined);
  const avatarName = userDetails?.name || 'U';

  return (
    <ContentLayout showLeftMobileButton={false} showRightMobileButton={false} className="pb-24 lg:pb-12 xl:!px-0">
      <Container overrideDefaults className="flex w-full flex-col gap-6">
        <Heading level={1} size="lg" className="font-light text-muted-foreground">
          {t('title')}
        </Heading>

        <Container overrideDefaults className="flex flex-wrap gap-6">
          <CollectionCard
            href={COLLECTION_ROUTES.BOOKMARKS}
            title={t('bookmarks.title')}
            description={t('bookmarks.description')}
            icon={Bookmark}
            count={userCounts?.bookmarks}
            visibilityLabel={t('private')}
            avatarUrl={avatarUrl}
            avatarName={avatarName}
            avatarSeed={currentUserPubky ?? avatarName}
          />
        </Container>
      </Container>
    </ContentLayout>
  );
}
