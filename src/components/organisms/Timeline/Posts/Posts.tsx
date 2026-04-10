'use client';

import { Virtuoso } from 'react-virtuoso';
import { TIMELINE_VIRTUOSO_OVERSCAN_PX } from '@/config';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import {
  TimelineVirtuosoFooter,
  type TimelineVirtuosoContext,
} from '@/components/molecules/Timeline/TimelineVirtuosoFooter';
import type { TagsLayout } from '../../PostMain/PostMain.types';

interface TimelinePostsProps {
  postIds: string[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  tagsLayout?: TagsLayout;
}

const virtuosoComponents = { Footer: TimelineVirtuosoFooter };

/**
 * Extracted from Virtuoso's `itemContent` so hooks run at component level.
 * Deleted posts are filtered upstream in TimelineFeedContent; this component
 * is a pure renderer that never returns null (Virtuoso requires non-zero-height items).
 */
function TimelinePostItem({ postId, tagsLayout }: { postId: string; tagsLayout?: TagsLayout }) {
  const { navigateToPost } = Hooks.usePostNavigation();

  return (
    <Atoms.Container data-cy="post-card" overrideDefaults className="pb-4">
      <Organisms.PostMain
        postId={postId}
        onClick={() => navigateToPost(postId)}
        isReply={false}
        tagsLayout={tagsLayout}
      />
      <Organisms.TimelinePostReplies postId={postId} />
    </Atoms.Container>
  );
}

/**
 * TimelinePosts
 *
 * Virtualized timeline that only mounts posts near the viewport.
 * Off-screen posts are unmounted, freeing their Dexie subscriptions,
 * IntersectionObservers, and ResizeObservers.
 */
export function TimelinePosts({
  postIds,
  loading,
  loadingMore,
  error,
  hasMore,
  loadMore,
  tagsLayout,
}: TimelinePostsProps) {
  const virtuosoContext: TimelineVirtuosoContext = {
    loadingMore,
    error,
    hasMore,
    itemCount: postIds.length,
  };

  return (
    <Molecules.TimelineStateWrapper loading={loading} error={error} hasItems={postIds.length > 0}>
      <Atoms.Container data-cy="timeline-container">
        <Atoms.Container data-cy="timeline-posts" overrideDefaults>
          <Virtuoso
            useWindowScroll
            data={postIds}
            context={virtuosoContext}
            overscan={TIMELINE_VIRTUOSO_OVERSCAN_PX}
            computeItemKey={(_index, postId) => `main_${postId}`}
            endReached={() => {
              if (!loadingMore && hasMore) {
                void loadMore();
              }
            }}
            itemContent={(_index, postId) => <TimelinePostItem postId={postId} tagsLayout={tagsLayout} />}
            components={virtuosoComponents}
          />
        </Atoms.Container>
      </Atoms.Container>
    </Molecules.TimelineStateWrapper>
  );
}
