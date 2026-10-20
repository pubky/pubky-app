'use client';

import { Store } from 'lucide-react';
import { IllustratedEmptyState } from '@/molecules/IllustratedEmptyState/IllustratedEmptyState';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';

export function ShopUnavailable() {
  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
    >
      <IllustratedEmptyState
        imageSrc="/images/tagged-empty-state.webp"
        imageAlt=""
        icon={Store}
        title="Shop unavailable"
        subtitle="Shop is temporarily unavailable. It will reopen automatically when the connection is restored."
      />
    </ContentLayout>
  );
}
