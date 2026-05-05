'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { APP_ROUTES } from '@/app/routes';
import { FeedController } from '@/controllers/feed/feed';
import { Logger } from '@/libs/logger/logger';
import type { FeedModelSchema } from '@/models/feed/feed.schema';

export function useCustomFeed(): FeedModelSchema | undefined {
  const pathname = usePathname();
  const isFeedRoute = pathname.startsWith(APP_ROUTES.FEED);
  const { id } = useParams<{ id: string }>();

  // Latch the last known feed id so that intercepted post navigation
  // (URL → /post/...) does not clear it and reset downstream stream state.
  // Without the latch, streamId becomes undefined on interception → useStreamPagination
  // wipes loaded posts → document height collapses → browser scroll position is lost on back.
  // Latch lives in state (not a ref) to stay safe under concurrent rendering.
  const [latchedId, setLatchedId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (isFeedRoute && id) setLatchedId(id);
  }, [isFeedRoute, id]);

  // While on /feed/[id], use the live id; during intercepted /post/... use the latched id.
  const activeFeedId = isFeedRoute ? id : latchedId;

  const customFeed = useLiveQuery(async () => {
    if (!activeFeedId) return undefined;
    try {
      return await FeedController.get({ feedId: activeFeedId });
    } catch (error) {
      Logger.error('[useCustomFeed] Failed to query custom feed', { error });
      return undefined;
    }
  }, [activeFeedId]);

  return customFeed;
}
