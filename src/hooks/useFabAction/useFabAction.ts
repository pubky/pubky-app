'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { COLLECTION_ROUTES, isCollectionsOverviewRoute, matchSingleCollectionRoute } from '@/app/routes';
import { useSaveCreatedPostToTarget } from '@/hooks/useSaveCreatedPostToTarget/useSaveCreatedPostToTarget';
import { buildCompositeId } from '@/models/models.utils';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useFeedOptimisticStore } from '@/stores/feedOptimistic/feedOptimistic.store';
import { buildFeedKey, type FeedInsertTarget } from '@/stores/feedOptimistic/feedOptimistic.types';
import type { FabAction } from './useFabAction.types';

/**
 * useFabAction
 *
 * Resolves the floating action button's behavior from the current route + auth.
 * Everything is derivable from the URL because the collection owner's pubky is
 * the `userId` route segment — owned ⇔ `userId === currentUserPubky` — so no
 * data fetch is needed.
 *
 * - `/collections`                         -> create a collection
 * - `/collections/bookmarks`               -> create a post + bookmark it
 * - `/collections/[ownPubky]/[postId]`     -> create a post in that collection
 * - everything else (incl. non-owned)      -> default new post
 *
 * For the post-saving variants it binds `onPostCreated`, which adds the new post
 * to the collection / bookmarks and enqueues an optimistic insert for the
 * page-level feed (the FAB lives outside the feed's React tree, so the
 * `feedOptimistic` store is the bridge).
 */
export function useFabAction(): FabAction {
  const pathname = usePathname();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const enqueue = useFeedOptimisticStore((state) => state.enqueue);
  const tFab = useTranslations('fab');
  const saveCreatedPostToTarget = useSaveCreatedPostToTarget();

  const makeOnPostCreated =
    (target: FeedInsertTarget) =>
    (createdPostId: string): Promise<void> =>
      saveCreatedPostToTarget({
        target,
        createdPostId,
        onSaved: (savedPostId) => enqueue(buildFeedKey(target), savedPostId),
      });

  if (isCollectionsOverviewRoute(pathname)) {
    return { kind: 'createCollection', ariaLabel: tFab('newCollection') };
  }

  if (pathname === COLLECTION_ROUTES.BOOKMARKS) {
    const target: FeedInsertTarget = { type: 'bookmarks' };
    return {
      kind: 'createPost',
      ariaLabel: tFab('newBookmark'),
      onPostCreated: makeOnPostCreated(target),
    };
  }

  const single = matchSingleCollectionRoute(pathname);
  if (single && currentUserPubky && single.userId === currentUserPubky) {
    const target: FeedInsertTarget = {
      type: 'collection',
      collectionId: buildCompositeId({ pubky: single.userId, id: single.postId }),
    };
    return {
      kind: 'createPost',
      ariaLabel: tFab('newPostInCollection'),
      onPostCreated: makeOnPostCreated(target),
    };
  }

  return { kind: 'createPost', ariaLabel: tFab('newPost') };
}
