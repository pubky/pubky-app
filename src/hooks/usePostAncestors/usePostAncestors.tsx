'use client';

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import type { Ancestor, UsePostAncestorsResult } from './usePostAncestors.types';
import { Logger } from '@/libs/logger/logger';

/** Maximum depth to traverse to prevent infinite loops */
const MAX_ANCESTOR_DEPTH = 10;

/**
 * Internal result from the local-only `useLiveQuery` traversal.
 * Separates the read-only chain from the fetch signal.
 */
interface LocalTraversalResult {
  /** Ancestors resolved so far (root → current order) */
  ancestors: Ancestor[];
  /**
   * Composite ID of the first post in the chain whose relationships
   * are not yet in IndexedDB. `null` when the chain is complete.
   */
  nextMissingPostId: string | null;
}

/**
 * Hook to fetch the ancestor chain for a post.
 *
 * Follows the local-first pattern (ADR-0011):
 * - `useLiveQuery` traverses the reply chain using only local IndexedDB reads.
 *   When it encounters a post whose relationships are not cached, it reports
 *   its composite ID as `nextMissingPostId`.
 * - `useEffect` reacts to `nextMissingPostId` by calling
 *   `PostController.fetch`, which fetches from Nexus and persists to
 *   IndexedDB. Dexie reactivity then re-fires `useLiveQuery`, extending the
 *   chain by one level. This iterates until the chain reaches a root post.
 *
 * Ancestors are buffered internally — consumers see `isLoading: true` until
 * the chain is fully settled (complete, stalled at a gap, or errored).
 *
 * @param postId - Composite post ID in format "userId:postId"
 * @returns Ancestor chain and loading state
 *
 * @example
 * ```tsx
 * const { ancestors, isLoading } = usePostAncestors(postId);
 *
 * // ancestors = [
 * //   { postId: 'user1:post1', userId: 'user1' },  // root (John)
 * //   { postId: 'user2:post2', userId: 'user2' },  // parent (Satoshi)
 * //   { postId: 'user3:post3', userId: 'user3' },  // current (Anna)
 * // ]
 * ```
 */
export function usePostAncestors(postId: string | null | undefined): UsePostAncestorsResult {
  const [hasError, setHasError] = useState(false);

  // Tracks the composite ID for which `fetch` returned `null` (post not
  // found anywhere). Compared against `nextMissingPostId` to distinguish
  // "actively fetching" from "stalled at an unresolvable gap".
  const [stalledAtId, setStalledAtId] = useState<string | null>(null);

  // Reset state when postId changes
  useEffect(() => {
    setHasError(false);
    setStalledAtId(null);
  }, [postId]);

  // ── Local-only read ────────────────────────────────────────────────
  // Traverses the ancestor chain using cached relationships in IndexedDB.
  // Pure, read-only — no network calls (ADR-0011).
  const result = useLiveQuery(
    async (): Promise<LocalTraversalResult | null> => {
      if (!postId) {
        return { ancestors: [], nextMissingPostId: null };
      }

      try {
        // Validate the input postId before traversing
        try {
          Core.parseCompositeId(postId);
        } catch (error) {
          Logger.error('[usePostAncestors] Invalid postId', { postId, error });
          return null;
        }

        const ancestors: Ancestor[] = [];
        let currentPostId: string | null = postId;
        let depth = 0;

        while (currentPostId && depth < MAX_ANCESTOR_DEPTH) {
          // Parse the composite ID to get the userId
          let userId: string;
          try {
            const parsed = Core.parseCompositeId(currentPostId);
            userId = parsed.pubky;
          } catch (error) {
            Logger.error('[usePostAncestors] Failed to parse composite ID', {
              currentPostId,
              error,
            });
            break;
          }

          // Read relationships from local DB (read-only)
          const relationships = await Core.PostController.getRelationships({
            compositeId: currentPostId,
          });

          if (relationships === null) {
            // Post is not in local DB — signal the fetch arm to resolve it.
            return { ancestors, nextMissingPostId: currentPostId };
          }

          // Post is in local DB — add to the chain
          ancestors.unshift({ postId: currentPostId, userId });

          if (!relationships.replied) {
            // No parent — this is the root post, chain is complete
            break;
          }

          // Convert parent URI to composite ID and continue up the chain
          const parentPostId = Core.buildCompositeIdFromPubkyUri({
            uri: relationships.replied,
            domain: Core.CompositeIdDomain.POSTS,
          });

          if (!parentPostId) {
            Logger.error('[usePostAncestors] Failed to build composite ID from parent URI', {
              currentPostId,
              repliedUri: relationships.replied,
            });
            break;
          }

          currentPostId = parentPostId;
          depth++;
        }

        if (depth >= MAX_ANCESTOR_DEPTH) {
          Logger.warn('[usePostAncestors] Max ancestor depth reached', {
            postId,
            depth,
          });
        }

        return { ancestors, nextMissingPostId: null };
      } catch (error) {
        Logger.error('[usePostAncestors] Local traversal failed', {
          postId,
          error,
        });
        return null;
      }
    },
    [postId],
    undefined,
  );

  // ── Fetch arm ──────────────────────────────────────────────────────
  // When the local traversal discovers a missing post, fetch it from
  // Nexus and persist to IndexedDB. Dexie reactivity re-fires
  // `useLiveQuery`, which extends the chain and may discover the next
  // missing ancestor — repeating until the chain is complete.
  const nextMissingPostId = result?.nextMissingPostId ?? null;

  // Single source of truth for error state — combines the fetch-arm error
  // (hasError state) with the local-traversal error (result === null sentinel).
  const hasAnyError = hasError || result === null;

  useEffect(() => {
    if (!nextMissingPostId || hasAnyError) return;

    // Already attempted this ID and it wasn't found — don't retry.
    if (stalledAtId === nextMissingPostId) return;

    let cancelled = false;

    Core.PostController.fetch({ compositeId: nextMissingPostId })
      .then((fetchedPost) => {
        if (cancelled) return;
        if (!fetchedPost) {
          // Post doesn't exist anywhere — unresolvable gap in the chain.
          // This is NOT an error: the parent was deleted or never existed.
          // Record the ID so we stop retrying and settle the chain.
          Logger.debug('[usePostAncestors] Ancestor not found, chain incomplete', {
            compositeId: nextMissingPostId,
          });
          setStalledAtId(nextMissingPostId);
        }
        // If fetchedPost is truthy, Dexie reactivity will re-fire useLiveQuery
        // automatically — no manual state update needed.
      })
      .catch((error) => {
        if (!cancelled) {
          Logger.error('[usePostAncestors] Failed to fetch ancestor', {
            compositeId: nextMissingPostId,
            error,
          });
          setHasError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [nextMissingPostId, hasAnyError, stalledAtId]);

  // ── Derived state ──────────────────────────────────────────────────
  // The chain is still resolving if useLiveQuery hasn't fired yet, or if
  // there's a missing ancestor we're actively fetching. While resolving,
  // ancestors are buffered (empty array) to preserve the consumer contract:
  // isLoading: true → done, with no intermediate partial results.
  const isResolving =
    result === undefined || (nextMissingPostId !== null && !hasAnyError && stalledAtId !== nextMissingPostId);

  return {
    ancestors: isResolving ? [] : (result?.ancestors ?? []),
    isLoading: isResolving,
    hasError: hasAnyError,
  };
}
