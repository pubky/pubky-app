import { Logger } from '@/libs/logger/logger';
import { advanceCursor, isSkipPaginatedStream, type PostStreamId } from '@/models/stream/post/postStream.types';
import { TQueueEntry } from '../post.types';
import { CollectParams, CollectResult } from './post-stream-queue.types';

// Safety valve to prevent infinite loops when filters remove many posts.
// At 20 iterations with the default 10-post limit we scan up to 200 raw posts before giving
// up (larger caller limits scan proportionally more, e.g. 400 at limit 20). This handles
// extreme cases like a muted user having 200+ consecutive posts.
//
// NOTE: this bounds ONE collect() call, not the caller's behavior — an auto-loading feed
// whose sentinel refires on every empty-but-not-ended result chains collects; the timeline
// renderers cap that chain with `useInfiniteScroll`'s unproductive-load budget
// (`TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS`). Callers that need a tighter per-action budget
// pass `maxIterations` (Discover Collections does).
const MAX_FETCH_ITERATIONS = 20;

/**
 * Queue for storing overflow posts between pagination requests.
 * Handles fetching until we have enough posts after filtering.
 */
export class PostStreamQueue {
  private entries = new Map<PostStreamId, TQueueEntry>();

  get(streamId: PostStreamId): TQueueEntry | undefined {
    return this.entries.get(streamId);
  }

  private save(streamId: PostStreamId, posts: string[], cursor: number): void {
    this.entries.set(streamId, { posts, cursor });
  }

  clear(): void {
    this.entries.clear();
  }

  /**
   * Remove a specific stream's queue entry.
   * Called when navigating away from a stream or when streamId changes.
   */
  remove(streamId: PostStreamId): void {
    this.entries.delete(streamId);
  }

  /**
   * Collects enough posts to satisfy the limit, fetching more if needed.
   * Handles deduplication, filtering, and saves overflow back to queue.
   */
  async collect(streamId: PostStreamId, params: CollectParams): Promise<CollectResult> {
    const { limit, filter, fetch } = params;
    const maxIterations = params.maxIterations ?? MAX_FETCH_ITERATIONS;

    // Load from queue and filter
    const savedQueue = this.entries.get(streamId);
    const posts = savedQueue ? await filter(savedQueue.posts) : [];
    const seen = new Set(posts);
    let cursor = savedQueue?.cursor ?? params.cursor;

    // Serve from the overflow buffer without touching the backend. The resume cursor stays
    // the raw backend position past everything already scanned into the buffer (skip offset
    // or Nexus score) — the position the raw anchor (`lastRawPostId`) sits at. A cursor
    // synthesized from the last served post's own timestamp would not be a stream position:
    // Nexus keeps edited/deleted posts at their original score while bumping `indexed_at`.
    if (limit > 0 && posts.length >= limit) {
      return this.finalize(streamId, posts, limit, cursor, [], cursor, false, limit);
    }

    // Fetch until we have enough
    const allCacheMissIds = new Set<string>();
    let latestScore: number | undefined;
    let fetchCount = 0;
    let reachedEnd = false;
    let rawScannedCount = 0;

    while (posts.length < limit && fetchCount < maxIterations) {
      fetchCount++;

      const result = await fetch(cursor);
      rawScannedCount += result.nextPageIds.length;

      // Filter and dedupe
      const filtered = await filter(result.nextPageIds);
      for (const id of filtered) {
        if (!seen.has(id)) {
          seen.add(id);
          posts.push(id);
        }
      }

      // Add cache miss IDs to set (automatic deduplication)
      for (const id of result.cacheMissPostIds) {
        allCacheMissIds.add(id);
      }

      // Advance by raw ids returned, never by how many survived the filter above.
      const nextCursor = advanceCursor(streamId, cursor, { ids: result.nextPageIds, lastScore: result.nextCursor });
      if (result.nextCursor != null) {
        latestScore = result.nextCursor;
      }

      // Stop if we've reached end of stream (propagated from Nexus response)
      // Use the reachedEnd flag from the fetch result rather than calculating from length,
      // since deduplication in partialCacheHit can reduce the array size without reaching the end
      if (result.reachedEnd) {
        cursor = nextCursor;
        reachedEnd = true;
        break;
      }

      // An empty page that neither ended the stream nor moved the cursor (e.g. the viewer
      // session was replaced mid-flight) would be re-requested verbatim: stop instead of
      // spending the whole budget on identical requests. The caller keeps its position and
      // its next round retries from there.
      if (result.nextPageIds.length === 0 && nextCursor === cursor) {
        Logger.debug('PostStreamQueue: empty page without progress, stopping this round', { streamId, cursor });
        break;
      }

      cursor = nextCursor;
    }

    // Skip streams resume by raw offset; score streams by the last real score (undefined if
    // none, so the caller keeps its cursor rather than resetting).
    const nextCursor = isSkipPaginatedStream(streamId) ? cursor : latestScore;
    return this.finalize(
      streamId,
      posts,
      limit,
      cursor,
      Array.from(allCacheMissIds),
      nextCursor,
      reachedEnd,
      rawScannedCount,
    );
  }

  private finalize(
    streamId: PostStreamId,
    posts: string[],
    limit: number,
    cursor: number,
    cacheMissIds: string[],
    nextCursor: number | undefined,
    reachedEnd: boolean,
    rawScannedCount: number,
  ): CollectResult {
    const toReturn = posts.slice(0, limit);
    const toSave = posts.slice(limit);

    // Save overflow keyed by the raw backend position (`cursor`), not the returned nextCursor.
    if (toSave.length > 0) {
      this.save(streamId, toSave, cursor);
    } else {
      this.entries.delete(streamId);
    }

    return {
      posts: toReturn,
      cacheMissIds,
      nextCursor,
      // Nexus hitting its end does NOT mean the caller has seen everything: the final
      // page can overflow past `limit` into the buffer. Report exhausted only once the
      // buffer is drained too, so the last few posts can't be stranded behind a hidden
      // "Show more" / dead sentinel. The follow-up load serves the buffer, re-fetches
      // at the end cursor (one cheap short/empty page), and then reachedEnd propagates.
      reachedEnd: reachedEnd && toSave.length === 0,
      rawScannedCount,
    };
  }
}

export const postStreamQueue = new PostStreamQueue();
