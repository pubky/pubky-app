import type { usePostSaveTargets } from '@/hooks/usePostSaveTargets/usePostSaveTargets';

const noop = async () => {};

/**
 * Idle `usePostSaveTargets` result for VRT surfaces that render post cards but never open
 * the save picker: nothing bookmarked, no collections, no pagination in flight.
 * Use with `vi.mock('@/hooks/usePostSaveTargets/usePostSaveTargets', ...)` returning
 * `{ usePostSaveTargets: () => idlePostSaveTargets }`. Typed against the real hook so a
 * field added to its result breaks every VRT mock at compile time instead of at render.
 */
export const idlePostSaveTargets: ReturnType<typeof usePostSaveTargets> = {
  isBookmarked: false,
  isBookmarkLoading: false,
  isBookmarkToggling: false,
  collections: [],
  isCollectionsLoading: false,
  isCreatingCollection: false,
  hasMoreCollections: false,
  isCollectionsLoadingMore: false,
  loadMoreCollections: noop,
  otherCollectionIds: [],
  isOtherCollectionsLoading: false,
  toggleBookmark: noop,
  toggleCollection: noop,
  createCollectionWithPost: noop,
};
