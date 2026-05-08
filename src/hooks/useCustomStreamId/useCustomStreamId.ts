'use client';

import { useCustomFeed } from '@/hooks/useCustomFeed/useCustomFeed';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { POST_STREAM_TAG_DELIMITER } from '@/services/nexus/stream/posts/postStream.constants';
import { CONTENT } from '@/stores/home/home.types';
import { getStreamIdFromFilters } from '@/stores/home/home.utils';
import {
  pubkyPostKindToHomeContent,
  pubkyReachToHomeReach,
  pubkySortToHomeSort,
} from '@/utils/pubky-app-spec-feed-mappers';

export function useCustomStreamId(): PostStreamId | undefined {
  const customFeed = useCustomFeed();

  if (!customFeed) return;

  const reach = pubkyReachToHomeReach(customFeed.reach);
  const sort = pubkySortToHomeSort(customFeed.sort);
  const content = customFeed.content !== null ? pubkyPostKindToHomeContent(customFeed.content) : CONTENT.ALL;
  const tags = customFeed.tags;

  if (!reach || !sort || !content || !tags.length) return;

  const baseStreamId = getStreamIdFromFilters(sort, reach, content);
  const streamIdWithTags = `${baseStreamId}:${tags.join(POST_STREAM_TAG_DELIMITER)}`;

  return streamIdWithTags as PostStreamId;
}
