'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useParams, usePathname } from 'next/navigation';
import * as Core from '@/core';
import * as Libs from '@/libs';
import { APP_ROUTES } from '@/app/routes';

export function useCustomFeed(): Core.FeedModelSchema | undefined {
  const pathname = usePathname();
  const isFeedRoute = pathname.startsWith(APP_ROUTES.FEED);
  const { id } = useParams<{ id: string }>();

  const customFeed = useLiveQuery(async () => {
    if (!isFeedRoute || !id) return undefined;
    try {
      return await Core.FeedController.get({ feedId: id });
    } catch (error) {
      Libs.Logger.error('[useCustomFeed] Failed to query custom feed', { error });
      return undefined;
    }
  }, [isFeedRoute, id]);

  return customFeed;
}
