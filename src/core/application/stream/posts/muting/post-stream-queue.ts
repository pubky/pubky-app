import * as Core from '@/core';
import { TQueueEntry } from '../post.types';
import { CollectParams, CollectResult } from './post-stream-queue.types';
import { Logger } from '@/libs/logger/logger';

// Safety valve to prevent infinite loops when filters remove many posts.
// At 20 iterations with limit=30, we scan up to 600 posts before giving up.
// This handles extreme cases like a muted user having 500+ consecutive posts.
const MAX_FETCH_ITERATIONS = 20;

/**
 * Queue for storing overflow posts between pagination requests.
 * Handles fetching until we have enough posts after filtering.
 */
export class PostStreamQueue {
  private entries = new Map<Core.PostStreamId, TQueueEntry>();

  get(streamId: Core.PostStreamId): TQueueEntry | undefined {
    return this.entries.get(streamId);
  }

  private save(streamId: Core.PostStreamId, posts: string[], cursor: number): void {
    this.entries.set(streamId, { posts, cursor });
  }

  clear(): void {
    this.entries.clear();
  }

  /**
   * Remove a specific stream's queue entry.
   * Called when navigating away from a stream or when streamId changes.
   */
  remove(streamId: Core.PostStreamId): void {
    this.entries.delete(streamId);
  }

  /**
   * Collects enough posts to satisfy the limit, fetching more if needed.
   * Handles deduplication, filtering, and saves overflow back to queue.
   */
  async collect(streamId: Core.PostStreamId, params: CollectParams): Promise<CollectResult> {
    const { limit, filter, fetch } = params;

    // Load from queue and filter
    const savedQueue = this.entries.get(streamId);
    const posts = savedQueue ? await filter(savedQueue.posts) : [];
    const seen = new Set(posts);
    let cursor = savedQueue?.cursor ?? params.cursor;

    // If queue has enough, return early with correct timestamp
    if (posts.length >= limit) {
      const timestamp = await this.getLastPostTimestamp(posts, limit);
      // Returning from queue means we haven't reached end of stream
      return this.finalize(streamId, posts, limit, cursor, [], timestamp, false);
    }

    // Fetch until we have enough
    const allCacheMissIds = new Set<string>();
    let latestTimestamp: number | undefined;
    let fetchCount = 0;
    let reachedEnd = false;

    while (posts.length < limit && fetchCount < MAX_FETCH_ITERATIONS) {
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

      if (result.timestamp !== undefined) {
        cursor = result.timestamp;
        latestTimestamp = result.timestamp;
      }

      // Stop if we've reached end of stream (propagated from Nexus response)
      // Use the reachedEnd flag from the fetch result rather than calculating from length,
      // since deduplication in partialCacheHit can reduce the array size without reaching the end
      if (result.reachedEnd) {
        reachedEnd = true;
        break;
      }
    }

    return this.finalize(streamId, posts, limit, cursor, Array.from(allCacheMissIds), latestTimestamp, reachedEnd);
  }

  /**
   * Gets the timestamp of the last post that will be returned to the caller.
   * This ensures pagination can continue correctly with the right cursor.
   *
   * @param posts - Array of post IDs
   * @param limit - Number of posts to return
   * @returns The timestamp of the last post, or undefined if not found or error occurs
   */
  private async getLastPostTimestamp(posts: string[], limit: number): Promise<number | undefined> {
    const toReturn = posts.slice(0, limit);
    if (toReturn.length === 0) {
      return undefined;
    }

    try {
      const lastPostId = toReturn[toReturn.length - 1];
      const postDetails = await Core.LocalPostService.readDetails({ postId: lastPostId });
      return postDetails?.indexed_at;
    } catch (error) {
      // Log but don't fail - caller can fall back to cursor
      // This allows pagination to continue even if IndexedDB access fails
      Logger.warn('Failed to get last post timestamp', { error });
      return undefined;
    }
  }

  private finalize(
    streamId: Core.PostStreamId,
    posts: string[],
    limit: number,
    cursor: number,
    cacheMissIds: string[],
    timestamp: number | undefined,
    reachedEnd: boolean,
  ): CollectResult {
    const toReturn = posts.slice(0, limit);
    const toSave = posts.slice(limit);

    // Only save non-empty queues, delete entry if queue is empty
    if (toSave.length > 0) {
      this.save(streamId, toSave, cursor);
    } else {
      this.entries.delete(streamId);
    }

    return {
      posts: toReturn,
      cacheMissIds,
      cursor,
      timestamp,
      reachedEnd,
    };
  }
}

export const postStreamQueue = new PostStreamQueue();
