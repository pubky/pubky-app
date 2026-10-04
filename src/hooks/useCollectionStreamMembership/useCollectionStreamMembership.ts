'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import type { UseStreamPaginationResult } from '@/hooks/useStreamPagination/useStreamPagination.types';
import { sortPostIdsByMembership } from '@/libs/post/collectionItemOrder';
import { isPostDeleted } from '@/libs/utils/utils';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import type { PostStreamId } from '@/models/stream/post/postStream.types';

const NO_IDS: string[] = [];

interface UseCollectionStreamMembershipParams {
  /** Whether the feed is a single collection. Every other feed passes its pagination through untouched. */
  enabled: boolean;
  streamId: PostStreamId;
  /** Complete local membership in collection order; undefined while its local read resolves. */
  membershipPostIds: string[] | undefined;
  /** Raw Nexus pagination. Its ids and offsets never include the projected local display. */
  pagination: UseStreamPaginationResult;
  /**
   * The feed stopped eager hydration while the stream still reports more pages (a defensive
   * cap). Counted as settled, so unhydrated members fall back to their own cards.
   */
  hydrationCapped: boolean;
}

interface UseCollectionStreamMembershipResult extends UseStreamPaginationResult {
  /** Nothing can be shown yet: membership is unresolved, or no member is ready while hydration runs. */
  displayLoading: boolean;
  /** Members still wait for batch hydration behind cards that are already shown. */
  isHydratingMembers: boolean;
  /** Retain a collection card while its picker is open or its save is pending. Release on completion/unmount. */
  retainPost?: (postId: string) => () => void;
}

interface MembershipState {
  streamId: PostStreamId;
  identity: object;
  members: string[] | undefined;
  order: string[];
  retained: Map<object, string>;
  hidden: Map<string, number>;
  dismissed: Set<string>;
  explicitAdds: Set<string>;
  displayed: Set<string>;
  shown: string[];
}

function initialState(streamId: PostStreamId, members: string[] | undefined): MembershipState {
  return {
    streamId,
    identity: {},
    members,
    order: [...new Set(members)],
    retained: new Map(),
    hidden: new Map(),
    dismissed: new Set(),
    explicitAdds: new Set(),
    displayed: new Set(),
    shown: NO_IDS,
  };
}

function sameIds(left: string[] | undefined, right: string[] | undefined) {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.length === right.length &&
      left.every((id, i) => id === right[i]))
  );
}

function membershipOrder(state: MembershipState, streamPostIds: string[]) {
  if (state.members === undefined) return [...new Set([...state.explicitAdds, ...streamPostIds])];
  const allowed = new Set([...state.members, ...state.retained.values(), ...state.explicitAdds]);
  const candidates = [...new Set([...state.order.filter((id) => allowed.has(id)), ...allowed])];
  return sortPostIdsByMembership(candidates, state.members);
}

function withoutRetention(retained: Map<object, string>, ids: string[]) {
  return new Map([...retained].filter(([, id]) => !ids.includes(id)));
}

// Stream hydration writes member details before authors and repost originals.
// Wait for those card dependencies too, or mounting a cold card starts singleton
// requests while the stream is still hydrating the same dependencies in batches.
async function getCachedCardIds(postIds: string[]) {
  const [details, relationships] = await Promise.all([
    PostController.getDetailsByIds({ compositeIds: postIds }),
    PostController.getRelationshipsByIds({ compositeIds: postIds }),
  ]);
  if (details.every((detail) => detail === undefined)) return [];
  const originalIds = relationships.map((relationship) =>
    relationship?.reposted
      ? buildCompositeIdFromPubkyUri({ uri: relationship.reposted, domain: CompositeIdDomain.POSTS })
      : null,
  );
  const uniqueOriginalIds = [...new Set(originalIds.filter((id) => id !== null))];
  const [originals, authors] = await Promise.all([
    PostController.getDetailsByIds({ compositeIds: uniqueOriginalIds }),
    UserController.getManyDetails({
      userIds: [...new Set([...postIds, ...uniqueOriginalIds].map((id) => parseCompositeId(id).pubky))],
    }),
  ]);
  const cachedOriginals = new Set(uniqueOriginalIds.filter((_id, index) => originals[index] !== undefined));
  return postIds.filter((id, index) => {
    const originalId = originalIds[index];
    return (
      details[index] !== undefined &&
      (isPostDeleted(details[index].content) ||
        (relationships[index] !== undefined &&
          authors.has(parseCompositeId(id).pubky) &&
          (originalId === null ||
            (cachedOriginals.has(originalId) && authors.has(parseCompositeId(originalId).pubky)))))
    );
  });
}

/**
 * Projects a single collection's local membership over its Nexus pagination.
 *
 * Membership is a complete local list, independent of Nexus's paginated index. Only user
 * actions can retain an unlisted card or suppress a listed one. Keeping this projection
 * outside the raw pagination arrays preserves server offsets.
 */
export function useCollectionStreamMembership({
  enabled,
  streamId,
  membershipPostIds,
  pagination,
  hydrationCapped,
}: UseCollectionStreamMembershipParams): UseCollectionStreamMembershipResult {
  const { postIds: streamPostIds, loading, loadingMore, hasMore, error } = pagination;
  const members = enabled ? membershipPostIds : undefined;
  const [state, setState] = useState(() => initialState(streamId, members));
  if (state.streamId !== streamId) {
    setState(initialState(streamId, members));
  } else if (!sameIds(state.members, members)) {
    const current = new Set(members);
    const next = {
      ...state,
      members,
      // A genuine leave/rejoin permits a new add. A merely repeated envelope
      // must not resurrect an explicitly deleted or removed card.
      dismissed:
        members === undefined ? state.dismissed : new Set([...state.dismissed].filter((id) => current.has(id))),
      explicitAdds: new Set([...state.explicitAdds].filter((id) => !current.has(id))),
    };
    setState({ ...next, order: membershipOrder(next, streamPostIds) });
  }

  const settled = !loading && !loadingMore && (!hasMore || hydrationCapped);
  // A failed hydration never releases the members it could not load: their cards would
  // fetch one by one against the same outage and settle as unavailable placeholders,
  // which offer the owner a Remove action for posts that still exist.
  const releasesUnhydrated = settled && !error;
  const orderedIds = enabled ? membershipOrder(state, streamPostIds) : NO_IDS;
  const projectedIds = orderedIds.filter((id) => !state.hidden.has(id) && !state.dismissed.has(id));
  const streamIds = new Set(streamPostIds);
  // Only members that are neither shown nor delivered by the stream need a cache check,
  // and only while they are still withheld.
  const pendingIds = releasesUnhydrated
    ? NO_IDS
    : projectedIds.filter((id) => !state.displayed.has(id) && !streamIds.has(id));
  const pendingKey = JSON.stringify(pendingIds);
  // Pagination owns network hydration. This read only watches its local writes,
  // so cached saves render immediately without starting a fetch for every card.
  const cached = useLiveQuery(
    async () => {
      if (pendingIds.length === 0) return null;
      try {
        return { identity: state.identity, ids: await getCachedCardIds(pendingIds) };
      } catch {
        // Model reads already log and capture through `Err.database`. A failed check only
        // means "not ready yet"; rethrowing would replace the page via the error boundary.
        return null;
      }
    },
    [state.identity, pendingKey],
    null,
  );
  const cachedIds = cached?.identity === state.identity ? cached.ids : NO_IDS;
  const displayed = new Set(orderedIds.filter((id) => state.displayed.has(id)));
  const ready = new Set([...displayed, ...streamPostIds, ...cachedIds]);
  const visibleIds = releasesUnhydrated ? projectedIds : projectedIds.filter((id) => ready.has(id));
  // Keep the previous array while its content is unchanged, so a feed render
  // that changes nothing visible does not re-render every card.
  const postIds = sameIds(state.shown, visibleIds) ? state.shown : visibleIds;
  if (
    enabled &&
    (postIds !== state.shown || displayed.size !== state.displayed.size || postIds.some((id) => !displayed.has(id)))
  ) {
    setState({ ...state, shown: postIds, displayed: new Set([...displayed, ...postIds]) });
  }
  const displayLoading = enabled
    ? members === undefined || (projectedIds.length > 0 && postIds.length === 0 && !settled)
    : loading;
  const isHydratingMembers = enabled && !settled && postIds.length > 0 && postIds.length < projectedIds.length;

  const latest = useRef({ state, pagination, orderedIds });
  useEffect(() => {
    latest.current = { state, pagination, orderedIds };
  });

  // An envelope removal of a row the stream already served also leaves the raw page, so
  // the next skip offset follows Nexus's shorter re-indexed list. Erring this way can only
  // re-serve a row (deduplicated); keeping the row would skip a live member.
  const seenMembers = useRef({ streamId, ids: new Set<string>() });
  useEffect(() => {
    if (members === undefined) return;
    if (seenMembers.current.streamId !== streamId) seenMembers.current = { streamId, ids: new Set() };
    const seen = seenMembers.current.ids;
    members.forEach((id) => seen.add(id));
    const current = new Set(members);
    const removed = streamPostIds.filter((id) => seen.has(id) && !current.has(id));
    if (removed.length > 0) latest.current.pagination.removePostsOptimistically(removed).commit();
  }, [streamId, members, streamPostIds]);

  // These are subscription/transaction handles, so their identity lasts for the
  // hook lifetime. Their event-time snapshot follows renders through `latest`.
  const [actions] = useState(() => {
    const update = (identity: object, change: (current: MembershipState) => MembershipState) => {
      setState((current) => (current.identity === identity ? change(current) : current));
    };
    const prepend = (ids: string | string[]) => {
      const added = Array.isArray(ids) ? ids : [ids];
      const { state: snapshot, pagination: raw } = latest.current;
      update(snapshot.identity, (current) => {
        const hidden = new Map(current.hidden);
        const dismissed = new Set(current.dismissed);
        const explicitAdds = new Set(current.explicitAdds);
        for (const id of added) {
          hidden.delete(id);
          dismissed.delete(id);
          if (!current.members?.includes(id)) explicitAdds.add(id);
        }
        return { ...current, hidden, dismissed, explicitAdds, order: [...new Set([...added, ...current.order])] };
      });
      // Collection order comes from membership. Even the generic insertion
      // entry point must keep local IDs out of the raw skip-paginated rows.
      raw.prependOptimisticPosts(added);
    };
    return {
      retainPost: (id: string) => {
        const { state: snapshot, orderedIds: order } = latest.current;
        const token = {};
        update(snapshot.identity, (current) => ({
          ...current,
          order,
          retained: new Map(current.retained).set(token, id),
        }));
        return () =>
          update(snapshot.identity, (current) => {
            if (!current.retained.has(token)) return current;
            const retained = new Map(current.retained);
            retained.delete(token);
            return { ...current, retained };
          });
      },
      prependOptimisticPosts: prepend,
      prependPosts: async (ids: string | string[]) => prepend(ids),
      removePosts: (ids: string | string[]) => {
        const { state: snapshot, pagination: raw } = latest.current;
        const removed = (Array.isArray(ids) ? ids : [ids]).filter((id) => !snapshot.dismissed.has(id));
        if (removed.length === 0) return;
        update(snapshot.identity, (current) => ({
          ...current,
          dismissed: new Set([
            ...current.dismissed,
            ...removed.filter((id) => current.members === undefined || current.members.includes(id)),
          ]),
          explicitAdds: new Set([...current.explicitAdds].filter((id) => !removed.includes(id))),
          retained: withoutRetention(current.retained, removed),
        }));
        // Confirmed removals share the consumed-row accounting with transactional
        // removals, including commits during a page fetch and local-only inserts.
        raw.removePostsOptimistically(removed).commit();
      },
      removePostsOptimistically: (ids: string | string[]) => {
        const { state: snapshot, pagination: raw, orderedIds: candidates } = latest.current;
        const removed = [...new Set(Array.isArray(ids) ? ids : [ids])].filter((id) => candidates.includes(id));
        const removal = raw.removePostsOptimistically(removed);
        update(snapshot.identity, (current) => {
          const hidden = new Map(current.hidden);
          removed.forEach((id) => hidden.set(id, (hidden.get(id) ?? 0) + 1));
          return { ...current, hidden };
        });
        let finalized = false;
        const finish = (commit: boolean) => {
          if (finalized) return;
          finalized = true;
          // `update` ignores a reset projection. The raw removal guards its own stream, so
          // it is always finalized: a row never stays hidden or uncounted in the offset.
          update(snapshot.identity, (current) => {
            const hidden = new Map(current.hidden);
            const dismissed = new Set(current.dismissed);
            const explicitAdds = new Set(current.explicitAdds);
            removed.forEach((id) => {
              const remaining = (hidden.get(id) ?? 1) - 1;
              if (remaining > 0) hidden.set(id, remaining);
              else hidden.delete(id);
              if (commit) {
                if (current.members === undefined || current.members.includes(id)) dismissed.add(id);
                explicitAdds.delete(id);
              }
            });
            // A committed removal also ends any retention, or a retained non-member would
            // reappear once its hidden count drops.
            const retained = commit ? withoutRetention(current.retained, removed) : current.retained;
            return { ...current, hidden, dismissed, explicitAdds, retained };
          });
          if (commit) removal.commit();
          else removal.rollback();
        };
        return { commit: () => finish(true), rollback: () => finish(false) };
      },
    };
  });

  if (!enabled) return { ...pagination, displayLoading: loading, isHydratingMembers: false };
  return { ...pagination, ...actions, postIds, displayLoading, isHydratingMembers };
}
