'use client';

import { usePathname } from 'next/navigation';
import { matchPostRoute } from '@/app/routes';
import { buildCompositeId } from '@/models/models.utils';
import { SinglePostPage } from '@/templates/Post/SinglePost/SinglePostPage';

/**
 * The post page body, with the post id read from the URL path: the static export prerenders this
 * page once under placeholder params. Malformed ids are passed as-is, so the not-found state in
 * {@link SinglePostPage} handles them.
 */
export function SinglePostRoute() {
  const route = matchPostRoute(usePathname());
  if (!route) return null;
  return <SinglePostPage postId={buildCompositeId({ pubky: route.userId, id: route.postId })} />;
}
