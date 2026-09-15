'use client';

import { useRef, useState } from 'react';
import { postUriBuilder } from 'pubky-app-specs';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import { isAppError } from '@/libs/error/error.utils';
import { isPostDeleted } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { toast } from '@/molecules/Toaster/toast';
import type { TimelineFeedContextValue } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed.types';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { CollectionPostContent } from '@/pipes/post/post.collection';
import { useAuthStore } from '@/stores/auth/auth.store';

interface UseRemoveDeletedPostResult {
  canRemove: boolean;
  isRemoving: boolean;
  remove: () => Promise<boolean>;
}

type RemovalTarget = { type: 'bookmarks' } | { type: 'collection'; collectionId: string };

function resolveRemovalTarget(
  feed: TimelineFeedContextValue | null,
  currentUserPubky: Pubky | null,
): RemovalTarget | null {
  if (!feed?.removePostsOptimistically || !currentUserPubky) return null;

  if (feed.variant === TIMELINE_FEED_VARIANT.BOOKMARKS) {
    return { type: 'bookmarks' };
  }

  if (feed.variant !== TIMELINE_FEED_VARIANT.COLLECTION || !feed.collectionId) {
    return null;
  }

  try {
    const { pubky } = parseCompositeId(feed.collectionId);
    return pubky === currentUserPubky ? { type: 'collection', collectionId: feed.collectionId } : null;
  } catch {
    return null;
  }
}

async function isPostStillInCollection(collectionId: string, postId: string): Promise<boolean | null> {
  const collection = await PostController.getDetails({ compositeId: collectionId });
  // A missing or tombstoned collection cannot confirm the removal committed —
  // commitUpdateCollectionItem throws NOT_FOUND for this exact state before
  // writing anything, so "already gone" here would misread a failed no-op as
  // success. Unverifiable → caller keeps shouldRestore and rolls back.
  if (!collection || isPostDeleted(collection.content)) return null;

  const content = CollectionPostContent.parse(collection.content);
  if (!content) return null;

  const { pubky, id } = parseCompositeId(postId);
  return (content.items ?? []).includes(postUriBuilder(pubky, id));
}

export function useRemoveDeletedPost(postId: string): UseRemoveDeletedPostResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const feed = useTimelineFeedContext();
  const target = resolveRemovalTarget(feed, currentUserPubky);
  const [isRemoving, setIsRemoving] = useState(false);
  const isRemovingRef = useRef(false);
  const remove = async (): Promise<boolean> => {
    if (!feed?.removePostsOptimistically || !target || !currentUserPubky || isRemovingRef.current) return false;

    isRemovingRef.current = true;
    setIsRemoving(true);
    const optimisticRemoval = feed.removePostsOptimistically(postId);

    try {
      if (target.type === 'bookmarks') {
        await BookmarkController.commitDelete({ postId, userId: currentUserPubky });
        toast({ title: 'Post removed from bookmarks' });
      } else {
        await PostController.commitUpdateCollectionItem({
          collectionId: target.collectionId,
          postId,
          shouldAdd: false,
        });
        toast({ title: 'Post removed from collection.' });
      }

      optimisticRemoval.commit();
      return true;
    } catch (error) {
      let shouldRestore = true;
      if (target.type === 'bookmarks') {
        try {
          shouldRestore = await BookmarkController.exists(postId);
        } catch {
          // Err factories already log; restore the card when local state cannot be verified.
        }
      } else {
        try {
          const isStillInCollection = await isPostStillInCollection(target.collectionId, postId);
          if (isStillInCollection !== null) {
            shouldRestore = isStillInCollection;
          }
        } catch {
          // Err factories already log; restore the card when local state cannot be verified.
        }
      }

      if (shouldRestore) {
        optimisticRemoval.rollback();
        toast({
          variant: 'error',
          description:
            target.type === 'bookmarks'
              ? 'Could not remove bookmark'
              : isAppError(error)
                ? error.message
                : 'Failed to update collection.',
        });
      } else {
        // The local write committed and only the homeserver sync failed, so
        // the card stays removed to match local state. A plain failure toast
        // would contradict the disappearing card — say what actually happened.
        optimisticRemoval.commit();
        toast({
          variant: 'warning',
          description:
            target.type === 'bookmarks'
              ? 'Removed from bookmarks on this device, but syncing failed.'
              : 'Removed from the collection on this device, but syncing failed.',
        });
      }
      return false;
    } finally {
      isRemovingRef.current = false;
      setIsRemoving(false);
    }
  };

  return {
    canRemove: target !== null,
    isRemoving,
    remove,
  };
}
