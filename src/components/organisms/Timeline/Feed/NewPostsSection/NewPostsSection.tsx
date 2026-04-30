'use client';

import { useIsScrolledFromTop } from '@/hooks/useIsScrolledFromTop/useIsScrolledFromTop';
import { useUnreadPosts } from '@/hooks/useUnreadPosts/useUnreadPosts';
import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import { Logger } from '@/libs/logger/logger';
import { MuteFilter } from '@/application/stream/posts/muting/mute-filter';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
interface NewPostsSectionProps {
  streamId: PostStreamId;
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
  const { unreadPostIds } = useUnreadPosts({ streamId });
  const t = useTranslations('toast.post');
  const isScrolled = useIsScrolledFromTop();

  const displayedPostIds = new Set(postIds);
  const notDisplayed = unreadPostIds.filter((id) => !displayedPostIds.has(id));
  const actualNewPostIds = MuteFilter.filterPostsSafe(notDisplayed, mutedUserIdSet);
  const actualNewCount = actualNewPostIds.length;

  const handleNewPostsClick = async () => {
    try {
      await StreamPostsController.mergeUnreadStreamWithPostStream({ streamId });
      await StreamPostsController.clearUnreadStream({ streamId });

      const existingPosts = await StreamPostsController.filterDeletedPosts(actualNewPostIds);
      const displayedPostIdsSet = new Set(postIds);
      const postsToAdd = existingPosts.filter((id) => !displayedPostIdsSet.has(id));

      if (postsToAdd.length > 0) {
        prependPosts(postsToAdd);
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      Logger.error('Failed to load new posts:', error);
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
