'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useParams, usePathname } from 'next/navigation';
import { APP_ROUTES } from '@/app/routes';
import { Logger } from '@/libs/logger/logger';
import { FeedController } from '@/controllers/feed/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
export function useCustomFeed(): FeedModelSchema | undefined {
  const pathname = usePathname();
  const isFeedRoute = pathname.startsWith(APP_ROUTES.FEED);
  const { id } = useParams<{ id: string }>();

  const customFeed = useLiveQuery(async () => {
    if (!isFeedRoute || !id) return undefined;
    try {
      return await FeedController.get({ feedId: id });
    } catch (error) {
      Logger.error('[useCustomFeed] Failed to query custom feed', { error });
      return undefined;
    }
  }, [isFeedRoute, id]);

  return customFeed;
}
