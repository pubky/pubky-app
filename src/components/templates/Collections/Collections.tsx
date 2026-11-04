'use client';

import { Container } from '@/atoms/Container/Container';
import { MOBILE_FAB_CLEARANCE_CLASS } from '@/config/layoutClasses';
import { CollectionsSections } from '@/organisms/Collections/CollectionsSections/CollectionsSections';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';

export function Collections() {
  return (
    <ContentLayout
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className={`${MOBILE_FAB_CLEARANCE_CLASS} lg:pb-12 xl:px-0!`}
    >
      <Container overrideDefaults className="flex w-full flex-col gap-6">
        <CollectionsSections />
      </Container>
    </ContentLayout>
  );
}
