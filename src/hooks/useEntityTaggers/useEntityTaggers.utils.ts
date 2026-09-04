import type { Pubky } from '@/models/models.types';
import type { MergeTaggerIdsParams } from './useEntityTaggers.types';

/**
 * Builds the tagger list to display for an expanded tag.
 *
 * Nexus pages are the base. The local-first preview is merged in so taggers the
 * viewer just added show up before Nexus indexes them, and the viewer is added or
 * removed according to the local `relationship` so their own toggles are reflected
 * without waiting for a refetch.
 */
export function mergeTaggerIds({ fetchedIds, previewIds, viewerId, isViewerTagger }: MergeTaggerIdsParams): Pubky[] {
  const merged = new Set<Pubky>([...(fetchedIds ?? []), ...previewIds]);

  if (viewerId && isViewerTagger !== undefined) {
    if (isViewerTagger) {
      merged.add(viewerId);
    } else {
      merged.delete(viewerId);
    }
  }

  return Array.from(merged);
}
