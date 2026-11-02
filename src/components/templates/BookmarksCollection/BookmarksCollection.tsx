'use client';

import { Container } from '@/atoms/Container/Container';
import { MOBILE_FAB_CLEARANCE_CLASS } from '@/config/layoutClasses';
import { useBookmarksCollectionSummary } from '@/hooks/useBookmarksCollectionSummary/useBookmarksCollectionSummary';
import { BookmarksHero } from '@/organisms/Bookmarks/BookmarksHero/BookmarksHero';
import { BookmarksItems } from '@/organisms/Bookmarks/BookmarksItems/BookmarksItems';
import { CollectionsSections } from '@/organisms/Collections/CollectionsSections/CollectionsSections';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';

export function BookmarksCollection() {
  const { avatarName, avatarSeed, avatarUrl, bookmarkCount, isProfileResolved } = useBookmarksCollectionSummary();

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className={`${MOBILE_FAB_CLEARANCE_CLASS} lg:pb-12 xl:px-0!`}
    >
      <Container className="gap-12">
        <BookmarksItems
          header={
            <BookmarksHero
              avatarName={avatarName}
              avatarSeed={avatarSeed}
              avatarUrl={avatarUrl}
              bookmarkCount={bookmarkCount}
              isProfileResolved={isProfileResolved}
            />
          }
        />
        <CollectionsSections />
      </Container>
    </ContentLayout>
  );
}
