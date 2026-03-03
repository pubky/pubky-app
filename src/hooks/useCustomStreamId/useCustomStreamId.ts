'use client';

import * as Core from '@/core';
import { useMemo } from 'react';
import { useCustomFeed } from '@/hooks/useCustomFeed';

export function useCustomStreamId(): Core.PostStreamId | undefined {
  const customFeed = useCustomFeed();

  const streamId = useMemo(() => {
    if (!customFeed) return;

    const reach = Core.pubkyReachToHomeReach(customFeed.reach);
    const sort = Core.pubkySortToHomeSort(customFeed.sort);
    const content =
      customFeed.content !== null ? Core.pubkyPostKindToHomeContent(customFeed.content) : Core.CONTENT.ALL;
    const tags = customFeed.tags;

    if (!reach || !sort || !content || !tags.length) return;

    const baseStreamId = Core.getStreamIdFromFilters(sort, reach, content);
    const streamIdWithTags = `${baseStreamId}:${tags.join(Core.POST_STREAM_TAG_DELIMITER)}`;

    return streamIdWithTags as Core.PostStreamId;
  }, [customFeed]);

  return streamId;
}
