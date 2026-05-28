'use client';

import { Bookmark, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { COLLECTION_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { useCollectionsOwner } from '@/hooks/useCollectionsOwner/useCollectionsOwner';
import { CollectionCard } from '@/molecules/Collections/CollectionCard/CollectionCard';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { NewCollectionDialog } from '@/organisms/NewCollectionDialog/NewCollectionDialog';

export function Collections() {
  const t = useTranslations('collections');
  const { avatarUrl, avatarName, avatarSeed, bookmarkCount } = useCollectionsOwner();

  return (
    <ContentLayout showLeftMobileButton={false} showRightMobileButton={false} className="pb-24 lg:pb-12 xl:!px-0">
      <Container overrideDefaults className="flex w-full flex-col gap-6">
        <Container overrideDefaults className="flex flex-wrap items-center gap-3">
          <Heading level={1} size="lg" className="font-light text-muted-foreground">
            {t('title')}
          </Heading>
          <NewCollectionDialog>
            <Button variant="secondary" size="sm">
              <Plus />
              {t('new.cta')}
            </Button>
          </NewCollectionDialog>
        </Container>

        <Container overrideDefaults className="flex flex-wrap gap-6">
          <CollectionCard
            href={COLLECTION_ROUTES.BOOKMARKS}
            title={t('bookmarks.title')}
            description={t('bookmarks.description')}
            icon={Bookmark}
            count={bookmarkCount}
            visibilityLabel={t('private')}
            avatarUrl={avatarUrl}
            avatarName={avatarName}
            avatarSeed={avatarSeed}
          />
        </Container>
      </Container>
    </ContentLayout>
  );
}
