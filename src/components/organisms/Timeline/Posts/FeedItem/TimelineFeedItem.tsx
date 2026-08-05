'use client';

import type React from 'react';
import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import type { UsePostListKeyboardResult } from '@/hooks/usePostListKeyboard/usePostListKeyboard.types';
import { parseCompositeId } from '@/models/models.utils';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { PostMain } from '@/organisms/PostMain/PostMain';
import { TimelinePostReplies } from '@/organisms/Timeline/PostReplies/PostReplies';
import { useTimelineFeedContext } from '../../Feed/TimelineFeed/TimelineFeedContext';

interface TimelineFeedItemProps {
  postId: string;
  index: number;
  totalCount: number;
  setCardRef: UsePostListKeyboardResult['setCardRef'];
  onPostKeyDown: (postId: string, event: React.KeyboardEvent) => void;
}

/**
 * Picks which feed body to mount once `kind` is known.
 *
 * This layer only routes — it does not render loading placeholders itself.
 * `PostMain` and `CollectionCard` are self-contained: each calls `usePostDetails`
 * internally and owns its skeleton, missing, deleted, and blurred states.
 *
 * The local `usePostDetails` here exists solely to branch before mount:
 * - `undefined` / `null` — kind unknown or post missing; default to `PostMain`
 *   (mixed feeds are mostly non-collection). `PostMain` shows its own skeleton
 *   or `PostUnavailable`. Replies are omitted until kind is known.
 * - `kind === 'collection'` — standalone `CollectionCard` (no replies). Once
 *   mounted, `CollectionCard` reads the same Dexie row and usually skips its
 *   skeleton because the cache is already warm.
 * - any other kind — `PostMain`, plus `TimelinePostReplies` outside single
 *   collection feeds.
 */
function TimelineFeedItemBody({ postId }: { postId: string }) {
  const { postDetails } = usePostDetails(postId);
  const timelineFeed = useTimelineFeedContext();
  const shouldShowReplies = timelineFeed?.variant !== TIMELINE_FEED_VARIANT.COLLECTION;

  if (postDetails === undefined || postDetails === null) {
    return <PostMain postId={postId} isReply={false} />;
  }

  if (postDetails.kind === 'collection') {
    const { pubky, id } = parseCompositeId(postId);
    return <CollectionCard authorPubky={pubky} postId={id} />;
  }

  return (
    <>
      <PostMain postId={postId} isReply={false} />
      {shouldShowReplies ? <TimelinePostReplies postId={postId} /> : null}
    </>
  );
}

/**
 * TimelineFeedItem
 *
 * Accessible feed article (`role="article"`) with keyboard navigation.
 * Delegates body rendering to `TimelineFeedItemBody`, which routes between
 * `CollectionCard` (collection posts) and `PostMain` (regular posts), with
 * inline replies omitted when those regular posts are collection items.
 */
export function TimelineFeedItem({ postId, index, totalCount, setCardRef, onPostKeyDown }: TimelineFeedItemProps) {
  return (
    <Container
      data-cy="post-card"
      ref={setCardRef(index)}
      role="article"
      aria-posinset={index + 1}
      aria-setsize={totalCount}
      tabIndex={0}
      onKeyDown={(e) => onPostKeyDown(postId, e)}
      className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TimelineFeedItemBody postId={postId} />
    </Container>
  );
}
