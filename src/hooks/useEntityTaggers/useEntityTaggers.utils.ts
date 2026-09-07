import type { Pubky } from '@/models/models.types';
import type { MergeTaggerIdsParams } from './useEntityTaggers.types';

/**
 * Builds the tagger list to display for an expanded tag.
 *
 * Keep the preview until the first response, then use the fetched list. Viewer
 * membership comes from that response unless a recent local mutation overrides
 * it while Nexus catches up. Cached preview relationships are not authoritative.
 */
export function mergeTaggerIds({ fetchedIds, previewIds, viewerId, isViewerTagger }: MergeTaggerIdsParams): Pubky[] {
  const merged = new Set<Pubky>(fetchedIds ?? previewIds);

  if (viewerId && isViewerTagger !== undefined) {
    if (isViewerTagger) {
      merged.add(viewerId);
    } else {
      merged.delete(viewerId);
    }
  }

  return Array.from(merged);
}
