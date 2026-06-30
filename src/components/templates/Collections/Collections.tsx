'use client';

import { Container } from '@/atoms/Container/Container';
import { CollectionsSections } from '@/organisms/Collections/CollectionsSections/CollectionsSections';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';

export function Collections() {
  return (
    <ContentLayout showLeftMobileButton={false} showRightMobileButton={false} className="pb-24 lg:pb-12 xl:px-0!">
      <Container overrideDefaults className="flex w-full flex-col gap-6">
        <CollectionsSections showMyCollectionsPublicNote />
      </Container>
    </ContentLayout>
  );
}
