import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';

/**
 * Sorts a collection feed's post ids to match the collection's membership
 * order (composite post ids, e.g. from `collectionItemsToPostIds`).
 *
 * The envelope is the local-first source of truth for ordering: it updates
 * instantly after an add/remove/reorder commit, while the Nexus `collection`
 * stream re-indexes asynchronously and can serve a stale order for a while.
 * Sorting the stream's ids by the membership closes that gap.
 *
 * Semantics:
 *   - ids present in the membership come first, in membership order
 *     (first occurrence wins for duplicates);
 *   - ids NOT in the membership keep their original stream order, appended;
 *   - membership ids with no matching stream id are ignored.
 *
 * Pure function — safe to call from any layer.
 */
export function sortPostIdsByMembership(postIds: string[], membershipPostIds: string[] | undefined): string[] {
  if (!membershipPostIds?.length || postIds.length < 2) return postIds;

  const orderByPostId = new Map<string, number>();
  membershipPostIds.forEach((postId, index) => {
    if (!orderByPostId.has(postId)) orderByPostId.set(postId, index);
  });

  const inMembership: string[] = [];
  const rest: string[] = [];
  for (const postId of postIds) {
    (orderByPostId.has(postId) ? inMembership : rest).push(postId);
  }

  inMembership.sort((a, b) => (orderByPostId.get(a) ?? 0) - (orderByPostId.get(b) ?? 0));

  return [...inMembership, ...rest];
}

/**
 * Maps a collection envelope's `items` (`pubky://` post URIs) to composite
 * post ids, dropping malformed URIs and duplicates while preserving order.
 * Returns `undefined` when the envelope has not resolved yet so callers can
 * tell "unknown" apart from "empty".
 *
 * Pure function — safe to call from any layer.
 */
export function collectionItemsToPostIds(envelopeItems: string[] | undefined): string[] | undefined {
  if (!envelopeItems) return undefined;

  const postIds: string[] = [];
  const seen = new Set<string>();
  for (const uri of envelopeItems) {
    const compositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS });
    if (compositeId !== null && !seen.has(compositeId)) {
      seen.add(compositeId);
      postIds.push(compositeId);
    }
  }
  return postIds;
}
