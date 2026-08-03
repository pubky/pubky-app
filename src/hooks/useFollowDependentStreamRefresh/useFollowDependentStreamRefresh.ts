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
  const followGraphRevision = useStreamInvalidationStore((state) => state.followGraphRevision);
  const friendsRevision = useStreamInvalidationStore((state) => state.friendsRevision);
  const scope = getFollowDependentStreamScope(streamId);
  const revision = scope === 'follow_graph' ? followGraphRevision : scope === 'friends' ? friendsRevision : 0;

  const baselineRef = useRef({ streamId, revision });
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  useEffect(() => {
    const baseline = baselineRef.current;
    baselineRef.current = { streamId, revision };

    if (baseline.streamId !== streamId) {
      refreshQueuedRef.current = false;
      return;
    }

    if (!scope || revision <= baseline.revision) {
      return;
    }

    refreshQueuedRef.current = true;
    if (refreshInFlightRef.current) {
      return;
    }

    const drainRefreshQueue = async () => {
      refreshInFlightRef.current = true;
      try {
        while (refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          await refreshFromNetwork();
        }
      } catch {
        // useStreamPagination owns reporting refresh failures. Stop this drain;
        // the next revision can start a fresh reconciliation attempt.
        refreshQueuedRef.current = false;
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    void drainRefreshQueue();
  }, [refreshFromNetwork, revision, scope, streamId]);
}
