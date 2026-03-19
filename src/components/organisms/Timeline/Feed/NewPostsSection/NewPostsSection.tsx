'use client';

import { useTranslations } from 'next-intl';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';

interface NewPostsSectionProps {
  streamId: Core.PostStreamId;
  postIds: string[];
  mutedUserIdSet: Set<string>;
  loading: boolean;
  prependPosts: (postIds: string | string[]) => Promise<void>;
}

/**
 * NewPostsSection
 *
 * Isolated component for the "New Posts" button.
 * Owns useIsScrolledFromTop and useUnreadPosts so neither scroll events
 * nor coordinator polls propagate re-renders to the parent feed content.
 */
export function NewPostsSection({ streamId, postIds, mutedUserIdSet, loading, prependPosts }: NewPostsSectionProps) {
  const { unreadPostIds } = Hooks.useUnreadPosts({ streamId });
  const t = useTranslations('toast.post');
  const isScrolled = Hooks.useIsScrolledFromTop();

  const displayedPostIds = new Set(postIds);
  const notDisplayed = unreadPostIds.filter((id) => !displayedPostIds.has(id));
  const actualNewPostIds = Core.MuteFilter.filterPostsSafe(notDisplayed, mutedUserIdSet);
  const actualNewCount = actualNewPostIds.length;

  const handleNewPostsClick = async () => {
    try {
      await Core.StreamPostsController.mergeUnreadStreamWithPostStream({ streamId });
      await Core.StreamPostsController.clearUnreadStream({ streamId });

      const existingPosts = await Core.StreamPostsController.filterDeletedPosts(actualNewPostIds);
      const displayedPostIdsSet = new Set(postIds);
      const postsToAdd = existingPosts.filter((id) => !displayedPostIdsSet.has(id));

      if (postsToAdd.length > 0) {
        prependPosts(postsToAdd);
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      Libs.Logger.error('Failed to load new posts:', error);
      Molecules.showErrorToast({
        title: t('failedToLoadPosts'),
        description: t('failedToLoadPostsDesc'),
      });
    }
  };

  return (
    <Molecules.NewPostsButton
      count={actualNewCount}
      onClick={handleNewPostsClick}
      visible={actualNewCount > 0 && !loading}
      isScrolled={isScrolled}
    />
  );
}
