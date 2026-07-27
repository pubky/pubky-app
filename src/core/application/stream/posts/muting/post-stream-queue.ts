import { Logger } from '@/libs/logger/logger';
import { advanceCursor, isSkipPaginatedStream, type PostStreamId } from '@/models/stream/post/postStream.types';
import { LocalPostService } from '@/services/local/post/post';
import { TQueueEntry } from '../post.types';
import { CollectParams, CollectResult, CursorForPostFn } from './post-stream-queue.types';

// Safety valve to prevent infinite loops when filters remove many posts.
// At 20 iterations with the default 10-post limit we scan up to 200 raw posts before giving
// up (larger caller limits scan proportionally more, e.g. 400 at limit 20). This handles
// extreme cases like a muted user having 200+ consecutive posts.
//
// NOTE: this bounds ONE collect() call, not the caller's behavior — an auto-loading feed
// whose sentinel refires on every empty-but-not-ended result will chain collects until the
// true stream end. Callers that need a tighter per-action budget pass `maxIterations`
// (Discover Collections does).
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
    const { limit, filter, fetch, cursorForPost } = params;
    const maxIterations = params.maxIterations ?? MAX_FETCH_ITERATIONS;

    // Load from queue and filter
    const savedQueue = this.entries.get(streamId);
    const posts = savedQueue ? await filter(savedQueue.posts) : [];
    const seen = new Set(posts);
    let cursor = savedQueue?.cursor ?? params.cursor;

    // Serve from the overflow buffer without touching the backend cursor. Skip streams
    // resume by the saved offset; score streams from the last served post's own score
    // (stream-aware via `cursorForPost` — bookmark streams resume by bookmark time).
    if (posts.length >= limit) {
      const nextCursor = isSkipPaginatedStream(streamId)
        ? cursor
        : await this.getLastPostCursor(posts, limit, cursorForPost);
      return this.finalize(streamId, posts, limit, cursor, [], nextCursor, false);
    }

    // Fetch until we have enough
    const allCacheMissIds = new Set<string>();
    let latestScore: number | undefined;
    let fetchCount = 0;
    let reachedEnd = false;

    while (posts.length < limit && fetchCount < maxIterations) {
      fetchCount++;

      const result = await fetch(cursor);

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
      cursor = advanceCursor(streamId, cursor, { ids: result.nextPageIds, lastScore: result.nextCursor });
      if (result.nextCursor != null) {
        latestScore = result.nextCursor;
      }

      // Stop if we've reached end of stream (propagated from Nexus response)
      // Use the reachedEnd flag from the fetch result rather than calculating from length,
      // since deduplication in partialCacheHit can reduce the array size without reaching the end
      if (result.reachedEnd) {
        reachedEnd = true;
        break;
      }
    }

    // Skip streams resume by raw offset; score streams by the last real score (undefined if
    // none, so the caller keeps its cursor rather than resetting).
    const nextCursor = isSkipPaginatedStream(streamId) ? cursor : latestScore;
    return this.finalize(streamId, posts, limit, cursor, Array.from(allCacheMissIds), nextCursor, reachedEnd);
  }

  /**
   * Gets the resume cursor for the last post that will be returned to the caller.
   * This ensures pagination can continue correctly with the right cursor.
   *
   * Uses the caller-supplied stream-aware resolver when provided (bookmark streams
   * paginate by bookmark time, not the post's `indexed_at` — see #2100); otherwise
   * falls back to the post's `indexed_at`.
   *
   * @param posts - Array of post IDs
   * @param limit - Number of posts to return
   * @param cursorForPost - Optional stream-aware cursor resolver
   * @returns The cursor of the last post, or undefined if not found or error occurs
   */
  private async getLastPostCursor(
    posts: string[],
    limit: number,
    cursorForPost?: CursorForPostFn,
  ): Promise<number | undefined> {
    const toReturn = posts.slice(0, limit);
    if (toReturn.length === 0) {
      return undefined;
    }

    try {
      const lastPostId = toReturn[toReturn.length - 1];
      if (cursorForPost) {
        return await cursorForPost(lastPostId);
      }
      const postDetails = await LocalPostService.readDetails({ postId: lastPostId });
      return postDetails?.indexed_at;
    } catch (error) {
      // Log but don't fail - caller can fall back to cursor
      // This allows pagination to continue even if IndexedDB access fails
      Logger.warn('Failed to get last post cursor', { error });
      return undefined;
    }
  }

  private finalize(
    streamId: PostStreamId,
    posts: string[],
    limit: number,
    cursor: number,
    cacheMissIds: string[],
    nextCursor: number | undefined,
    reachedEnd: boolean,
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
    };
  }
}

export const postStreamQueue = new PostStreamQueue();
