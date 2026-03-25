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
  const { navigateToPost } = Hooks.usePostNavigation();

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
            itemContent={(_index, postId) => (
              <Atoms.Container data-cy="post-card" overrideDefaults className="pb-4">
                <Organisms.PostMain
                  postId={postId}
                  onClick={() => navigateToPost(postId)}
                  isReply={false}
                  tagsLayout={tagsLayout}
                />
                <Organisms.TimelinePostReplies postId={postId} />
              </Atoms.Container>
            )}
            components={virtuosoComponents}
          />
        </Atoms.Container>
      </Atoms.Container>
    </Molecules.TimelineStateWrapper>
  );
}
