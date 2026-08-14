'use client';
import { MuteFilter } from '@/application/stream/posts/muting/mute-filter';
import { TIMELINE_FEED_VARIANT, type TimelineFeedVariant } from '@/config/feed';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { useIsScrolledFromTop } from '@/hooks/useIsScrolledFromTop/useIsScrolledFromTop';
import { useUnreadPosts } from '@/hooks/useUnreadPosts/useUnreadPosts';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { NewPostsButton } from '@/molecules/NewPostsButton/NewPostsButton';
import { toast } from '@/molecules/Toaster/use-toast';
import { postKindBelongsToStream } from '@/stores/home/home.utils';

interface NewPostsSectionProps {
  streamId: PostStreamId;
  variant: TimelineFeedVariant;
  postIds: string[];
  mutedUserIdSet: Set<Pubky>;
  loading: boolean;
  prependPosts: (postIds: string | string[]) => Promise<void>;
}

/**
 * NewPostsSection
 *
 * Isolated component for the "New Posts" button.
 * Owns useIsScrolledFromTop and useUnreadPosts so neither scroll events
 * nor coordinator polls propagate re-renders to the parent feed content.
 *
 * Bookmarks: unread "new posts" counts must not apply the mute list, so bookmarked
 * posts from muted authors stay consistent with the feed (#1804).
 *
 * Content filter: `prependPosts` only updates the feed's in-memory post list (see
 * `useStreamPagination`) — it does not choose which stream a post belongs to in
 * Dexie. Before prepending, we drop ids whose `kind` does not match the active
 * `streamId` content filter so a post never flashes at the top of the wrong tab.
 * The merge above still persists unread ids into the stream; this gate is UI-only.
 */
export function NewPostsSection({
  streamId,
  variant,
  postIds,
  mutedUserIdSet,
  loading,
  prependPosts,
}: NewPostsSectionProps) {
  const { unreadPostIds } = useUnreadPosts({ streamId });
  const isScrolled = useIsScrolledFromTop();

  const displayedPostIds = new Set(postIds);
  const notDisplayed = unreadPostIds.filter((id) => !displayedPostIds.has(id));
  const actualNewPostIds =
    variant === TIMELINE_FEED_VARIANT.BOOKMARKS
      ? notDisplayed
      : MuteFilter.filterPostsSafe(notDisplayed, mutedUserIdSet);
  const actualNewCount = actualNewPostIds.length;

  const handleNewPostsClick = async () => {
    try {
      await StreamPostsController.mergeUnreadStreamWithPostStream({ streamId });
      await StreamPostsController.clearUnreadStream({ streamId });

      const existingPosts = await StreamPostsController.filterDeletedPosts(actualNewPostIds);
      const displayedPostIdsSet = new Set(postIds);
      let postsToAdd = existingPosts.filter((id) => !displayedPostIdsSet.has(id));

      /*
        Gate optimistic prepend by content kind (e.g. do not show a `short` post
        after "New posts" on `timeline:…:collection`). `!kind` keeps cache misses
        so a not-yet-indexed post can still appear; mirrors `usePostInput`.
        Intentionally NOT gated by WoT source (unlike `usePostInput`, #2308):
        unread ids come from polling this exact stream, so they belong in it.
      */
      if (postsToAdd.length > 0) {
        const details = await PostController.getDetailsByIds({ compositeIds: postsToAdd });
        postsToAdd = postsToAdd.filter((id, index) => {
          const kind = details[index]?.kind;
          return !kind || postKindBelongsToStream(kind, streamId);
        });
      }

      if (postsToAdd.length > 0) {
        prependPosts(postsToAdd);
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      Logger.error('Failed to load new posts:', error);
      toast({
        variant: 'error',
        description: 'Could not load new posts',
      });
    }
  };

  return (
    <NewPostsButton
      count={actualNewCount}
      onClick={handleNewPostsClick}
      visible={actualNewCount > 0 && !loading}
      isScrolled={isScrolled}
    />
  );
}
