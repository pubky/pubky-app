'use client';

import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { useCollectionsOwner } from '@/hooks/useCollectionsOwner/useCollectionsOwner';
import { BookmarksCollectionHeader } from '@/molecules/Collections/BookmarksCollectionHeader/BookmarksCollectionHeader';
import { BookmarksEmptyState } from '@/molecules/Collections/BookmarksEmptyState/BookmarksEmptyState';
import { BookmarksCollectionPosts } from '@/organisms/Collections/BookmarksCollectionPosts/BookmarksCollectionPosts';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';

/**
 * Bookmarks Page Template
 *
 * Displays the user's bookmarked posts as a system collection detail page.
 * The post data still comes from the existing bookmarks stream.
 */
export function Bookmarks() {
  const t = useTranslations('collections');
  const { avatarUrl, avatarName, avatarSeed, bookmarkCount } = useCollectionsOwner();

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-24 lg:pb-12 xl:!px-0"
      classNameWrapperContent="gap-6"
    >
      <Container overrideDefaults className="flex w-full flex-col gap-6">
        <BookmarksCollectionHeader
          title={t('bookmarks.title')}
          description={t('bookmarks.description')}
          visibilityLabel={t('private')}
          postCount={bookmarkCount}
          ownerAvatarUrl={avatarUrl}
          ownerName={avatarName}
          ownerSeed={avatarSeed}
        />
        <BookmarksCollectionPosts
          emptyComponent={
            <BookmarksEmptyState title={t('bookmarks.emptyTitle')} description={t('bookmarks.emptyDescription')} />
          }
        />
      </Container>
    </ContentLayout>
  );
}
