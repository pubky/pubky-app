'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { PostDetailsModelSchema, PostRelationshipsModelSchema } from '@/core';
import { PostDetailsModel, PostRelationshipsModel } from '@/core';
import { Logger } from '@/libs';
import { useCurrentUserProfile } from '@/hooks';
import { TIMELINE_ITEM_TYPE } from '@/organisms/Timeline/Posts/Posts.constants';
import { groupPlainReposts } from './utils';
import type { UseRepostGroupingParams, UseRepostGroupingResult } from './useRepostGrouping.types';

/**
 * Hook to transform a list of post IDs into grouped timeline items.
 * Groups plain reposts (no content, no attachments) of the same original post
 * into a single RepostGroup item. Other posts remain as SinglePostItem.
 */
export function useRepostGrouping({ postIds }: UseRepostGroupingParams): UseRepostGroupingResult {
  const { currentUserPubky } = useCurrentUserProfile();

  const items = useLiveQuery(
    async () => {
      try {
        if (postIds.length === 0) return [];

        const [detailsArray, relationshipsArray] = await Promise.all([
          PostDetailsModel.findByIdsPreserveOrder(postIds),
          PostRelationshipsModel.findByIdsPreserveOrder(postIds),
        ]);

        const detailsMap = new Map<string, PostDetailsModelSchema | undefined>();
        const relationshipsMap = new Map<string, PostRelationshipsModelSchema | undefined>();

        postIds.forEach((postId, index) => {
          detailsMap.set(postId, detailsArray[index]);
          relationshipsMap.set(postId, relationshipsArray[index]);
        });

        return groupPlainReposts(postIds, detailsMap, relationshipsMap, currentUserPubky);
      } catch (error) {
        Logger.error('[useRepostGrouping] Failed to group posts', { error });
        return postIds.map((postId) => ({ type: TIMELINE_ITEM_TYPE.SINGLE, postId }));
      }
    },
    [postIds, currentUserPubky],
    undefined,
  );

  return {
    items: items ?? [],
    isGrouping: items === undefined,
  };
}
