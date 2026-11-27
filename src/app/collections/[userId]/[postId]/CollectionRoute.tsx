'use client';

import { usePathname } from 'next/navigation';
import { matchSingleCollectionRoute } from '@/app/routes';
import { buildCompositeId } from '@/models/models.utils';
import { Collection } from '@/templates/Collection/Collection';

/**
 * The collection page body, with the post id read from the URL path: the static export prerenders
 * this page once under placeholder params. Malformed ids are passed as-is, so the client-side
 * not-found state handles them.
 */
export function CollectionRoute() {
  const route = matchSingleCollectionRoute(usePathname());
  if (!route) return null;
  return <Collection postId={buildCompositeId({ pubky: route.userId, id: route.postId })} />;
}
