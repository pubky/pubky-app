import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import { sortPostIdsByMembership } from '@/libs/post/collectionItemOrder';
import { isPostDeleted } from '@/libs/utils/utils';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import type { CollectionStreamMembership, UseStreamPaginationResult } from './useStreamPagination.types';

interface MembershipState {
  streamId: PostStreamId | undefined;
  viewerId: string | null | undefined;
  identity: object;
  members: string[] | undefined;
  order: string[];
  retained: Map<object, string>;
  hidden: Map<string, number>;
  dismissed: Set<string>;
  explicitAdds: Set<string>;
  displayed: Set<string>;
}

function initialState(
  streamId: PostStreamId | undefined,
  membership: CollectionStreamMembership | undefined,
): MembershipState {
  return {
    streamId,
    viewerId: membership?.viewerId,
    identity: {},
    members: membership?.postIds,
    order: [...new Set(membership?.postIds)],
    retained: new Map(),
    hidden: new Map(),
    dismissed: new Set(),
    explicitAdds: new Set(),
    displayed: new Set(),
  };
}

function sameMembers(left: string[] | undefined, right: string[] | undefined) {
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

// Stream hydration writes member details before authors and repost originals.
// Wait for those card dependencies too, or mounting a cold card starts singleton
// requests while the stream is still hydrating the same dependencies in batches.
async function getCachedCardIds(postIds: string[]) {
  const details = await PostController.getDetailsByIds({ compositeIds: postIds });
  if (details.every((detail) => detail === undefined)) return [];
  const relationships = await Promise.all(
    postIds.map((compositeId) => PostController.getRelationships({ compositeId })),
  );
  const originalIds = relationships.map((relationship) =>
    relationship?.reposted
      ? buildCompositeIdFromPubkyUri({ uri: relationship.reposted, domain: CompositeIdDomain.POSTS })
      : null,
  );
  const uniqueOriginalIds = [...new Set(originalIds.filter((id) => id !== null))];
  const originals = await PostController.getDetailsByIds({ compositeIds: uniqueOriginalIds });
  const cachedOriginals = new Set(uniqueOriginalIds.filter((_id, index) => originals[index] !== undefined));
  const authors = await UserController.getManyDetails({
    userIds: [...new Set([...postIds, ...uniqueOriginalIds].map((id) => parseCompositeId(id).pubky))],
  });
  return postIds.filter((id, index) => {
    const originalId = originalIds[index];
    return (
      details[index] !== undefined &&
      (isPostDeleted(details[index].content) ||
        (relationships[index] !== null &&
          authors.has(parseCompositeId(id).pubky) &&
          (originalId === null ||
            (cachedOriginals.has(originalId) && authors.has(parseCompositeId(originalId).pubky)))))
    );
  });
}

/**
 * Collection membership is a complete local list, independent of Nexus's paginated
 * index. Only user actions can retain an unlisted card or suppress a listed one.
 * Keeping this projection outside the raw pagination arrays preserves server offsets.
 */
export function useCollectionStreamMembership(
  streamId: PostStreamId | undefined,
  membership: CollectionStreamMembership | undefined,
  pagination: UseStreamPaginationResult,
): UseStreamPaginationResult {
  const [state, setState] = useState(() => initialState(streamId, membership));
  if (state.streamId !== streamId || state.viewerId !== membership?.viewerId) {
    setState(initialState(streamId, membership));
  } else if (!sameMembers(state.members, membership?.postIds)) {
    const members = membership?.postIds;
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
    setState({ ...next, order: membershipOrder(next, pagination.postIds) });
  }

  const orderedIds = membershipOrder(state, pagination.postIds);
  const projectedIds = orderedIds.filter((id) => !state.hidden.has(id) && !state.dismissed.has(id));
  const projectedKey = JSON.stringify(projectedIds);
  const enabled = Boolean(membership && streamId);
  // Pagination owns network hydration. This read only watches its local writes,
  // so cached saves render immediately without starting a fetch for every card.
  const cached = useLiveQuery(async () => {
    if (!enabled) return null;
    return {
      identity: state.identity,
      ids: await getCachedCardIds(projectedIds),
    };
  }, [enabled, state.identity, projectedKey]);
  const displayed = new Set(orderedIds.filter((id) => state.displayed.has(id)));
  const ready = new Set([
    ...displayed,
    ...pagination.postIds,
    ...(cached?.identity === state.identity ? cached.ids : []),
  ]);
  const hydrating = pagination.loading || pagination.loadingMore || pagination.hasMore;
  const postIds = projectedIds.filter((id) => !hydrating || ready.has(id));
  if (enabled && (displayed.size !== state.displayed.size || postIds.some((id) => !displayed.has(id)))) {
    setState({ ...state, displayed: new Set([...displayed, ...postIds]) });
  }
  const latest = useRef({ state, pagination, orderedIds, active: true });
  useEffect(() => {
    latest.current = { state, pagination, orderedIds, active: true };
    return () => {
      latest.current.active = false;
    };
  });

  // These are subscription/transaction handles, so their identity lasts for the
  // hook lifetime. Their event-time snapshot follows renders through `latest`.
  const [actions] = useState(() => {
    const update = (identity: object, change: (current: MembershipState) => MembershipState) => {
      setState((current) => (current.identity === identity ? change(current) : current));
    };
    const isCurrent = (identity: object) => latest.current.active && latest.current.state.identity === identity;
    const reveal = (ids: string[]) => {
      const { state: snapshot } = latest.current;
      update(snapshot.identity, (current) => {
        const hidden = new Map(current.hidden);
        const dismissed = new Set(current.dismissed);
        const explicitAdds = new Set(current.explicitAdds);
        for (const id of ids) {
          hidden.delete(id);
          dismissed.delete(id);
          if (!current.members?.includes(id)) explicitAdds.add(id);
        }
        return { ...current, hidden, dismissed, explicitAdds, order: [...new Set([...ids, ...current.order])] };
      });
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
      prependOptimisticPosts: (ids: string | string[]) => {
        reveal(Array.isArray(ids) ? ids : [ids]);
        latest.current.pagination.prependOptimisticPosts(ids);
      },
      prependPosts: async (ids: string | string[]) => {
        reveal(Array.isArray(ids) ? ids : [ids]);
        // Collection order comes from membership. Even the generic insertion
        // entry point must keep local IDs out of the raw skip-paginated rows.
        latest.current.pagination.prependOptimisticPosts(ids);
      },
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
          if (finalized || !isCurrent(snapshot.identity)) return;
          finalized = true;
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
            return { ...current, hidden, dismissed, explicitAdds };
          });
          if (commit) removal.commit();
          else removal.rollback();
        };
        return { commit: () => finish(true), rollback: () => finish(false) };
      },
    };
  });

  return membership && streamId ? { ...pagination, ...actions, postIds } : pagination;
}
