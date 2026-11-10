'use client';

import { useSyncExternalStore } from 'react';
import { TagController } from '@/controllers/tag/tag';
import { useResourceCounts } from '@/hooks/useResourceCounts/useResourceCounts';
import { RESOURCE_TAGS_LIMIT } from '@/services/nexus/resource/resource.constants';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { TResourceRowCounts } from './useResourceRowCounts.types';

/**
 * The tags, comments and posts on a link, for a row of the resource page's Also on, from what the
 * page's read of the other links' tags (`useOtherLinkTags`) already brought in: nothing is fetched.
 * `null` while the link's tags were not read for the viewer, or their read failed.
 *
 * @param uri - The link exactly as written
 */
export function useResourceRowCounts(uri: string): TResourceRowCounts | null {
  const viewerId = useAuthStore((state) => state.currentUserPubky);
  const counts = useResourceCounts(uri);
  const tags = useSyncExternalStore(
    (onChange) => TagController.subscribeResourceTags({ uri, viewerId }, onChange),
    () => TagController.getCachedResourceTags({ uri, viewerId }),
    () => undefined,
  );

  // The tag read brings the counts too; counts alone (another reader's `fetchCounts`) wait for it.
  if (tags === undefined) return null;
  const tagCount = tags.length;
  return {
    tags: tagCount,
    isTagsAtReadLimit: tagCount >= RESOURCE_TAGS_LIMIT,
    // A row shows no 0: a count Nexus does not serve shows nothing either.
    replies: counts?.replies ?? 0,
    posts: counts?.embeds ?? 0,
  };
}
