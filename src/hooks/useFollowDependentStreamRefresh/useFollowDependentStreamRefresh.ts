'use client';

import { useEffect, useRef } from 'react';
import { getFollowDependentStreamScope, type PostStreamId } from '@/models/stream/post/postStream.types';
import { useStreamInvalidationStore } from '@/stores/streamInvalidation/streamInvalidation.store';

interface UseFollowDependentStreamRefreshParams {
  streamId: PostStreamId;
  refreshFromNetwork: () => Promise<void>;
}

/**
 * Reconciles a mounted follow-dependent feed after follow/unfollow mutations.
 * Cache invalidation handles inactive feeds; this hook replaces the React-owned
 * pagination state that remains mounted independently of Dexie.
 */
export function useFollowDependentStreamRefresh({
  streamId,
  refreshFromNetwork,
}: UseFollowDependentStreamRefreshParams): void {
  const scope = getFollowDependentStreamScope(streamId);
  const revision = useStreamInvalidationStore((state) => {
    if (scope === 'follow_graph') return state.followGraphRevision;
    if (scope === 'friends') return state.friendsRevision;
    return 0;
  });

  const baselineRef = useRef({ streamId, revision });
  const refreshRef = useRef(refreshFromNetwork);
  const drainOwnerRef = useRef<{ streamId: PostStreamId; token: symbol } | null>(null);
  const refreshQueuedRef = useRef(false);
  refreshRef.current = refreshFromNetwork;

  useEffect(() => {
    const baseline = baselineRef.current;
    baselineRef.current = { streamId, revision };

    if (baseline.streamId !== streamId) {
      refreshQueuedRef.current = false;
      drainOwnerRef.current = null;
      return;
    }

    if (!scope || revision <= baseline.revision) {
      return;
    }

    refreshQueuedRef.current = true;
    if (drainOwnerRef.current?.streamId === streamId) {
      return;
    }

    const owner = { streamId, token: Symbol('follow-dependent-refresh') };
    drainOwnerRef.current = owner;

    const drainRefreshQueue = async () => {
      try {
        while (refreshQueuedRef.current && drainOwnerRef.current === owner) {
          refreshQueuedRef.current = false;
          await refreshRef.current();
        }
      } catch {
        // useStreamPagination owns reporting refresh failures. Stop this drain;
        // the next revision can start a fresh reconciliation attempt.
        if (drainOwnerRef.current === owner) {
          refreshQueuedRef.current = false;
        }
      } finally {
        if (drainOwnerRef.current === owner) {
          drainOwnerRef.current = null;
        }
      }
    };

    void drainRefreshQueue();
  }, [revision, scope, streamId]);
}
