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
 *   - ids present in the membership take the slots those ids occupy in the
 *     stream, in membership order (first occurrence wins for duplicates);
 *   - ids NOT in the membership keep their original stream position, so a
 *     post the owner just unlisted (the save picker keeps its card mounted
 *     until the menu closes) stays put instead of jumping to the end;
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

  const members = postIds.filter((postId) => orderByPostId.has(postId));
  if (members.length < 2) return postIds;
  members.sort((a, b) => (orderByPostId.get(a) ?? 0) - (orderByPostId.get(b) ?? 0));

  let nextMember = 0;
  return postIds.map((postId) => (orderByPostId.has(postId) ? members[nextMember++] : postId));
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
