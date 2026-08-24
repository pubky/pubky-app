import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';

/**
 * Sorts a collection feed's post ids to match the collection envelope's
 * `items` order (an ordered array of `pubky://` post URIs).
 *
 * The envelope is the local-first source of truth for ordering: it updates
 * instantly after an add/remove/reorder commit, while the Nexus `collection`
 * stream re-indexes asynchronously and can serve a stale order for a while.
 * Sorting the stream's ids by the envelope closes that gap.
 *
 * Semantics:
 *   - ids present in the envelope come first, in envelope order
 *     (first occurrence wins for duplicate URIs);
 *   - ids NOT in the envelope keep their original stream order, appended;
 *   - envelope items with no matching stream id are ignored.
 *
 * Pure function — safe to call from any layer.
 */
export function sortPostIdsByCollectionOrder(postIds: string[], envelopeItems: string[] | undefined): string[] {
  if (!envelopeItems?.length || postIds.length < 2) return postIds;

  const orderByPostId = new Map<string, number>();
  envelopeItems.forEach((uri, index) => {
    const compositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS });
    if (compositeId !== null && !orderByPostId.has(compositeId)) {
      orderByPostId.set(compositeId, index);
    }
  });

  if (orderByPostId.size === 0) return postIds;

  const inEnvelope: string[] = [];
  const rest: string[] = [];
  for (const postId of postIds) {
    (orderByPostId.has(postId) ? inEnvelope : rest).push(postId);
  }

  inEnvelope.sort((a, b) => (orderByPostId.get(a) ?? 0) - (orderByPostId.get(b) ?? 0));

  return [...inEnvelope, ...rest];
}
