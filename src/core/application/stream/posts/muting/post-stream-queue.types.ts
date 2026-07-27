import { TPostStreamChunkResponse } from '../post.types';

export type FetchResult = TPostStreamChunkResponse;
export type FetchFn = (cursor: number) => Promise<FetchResult>;
export type FilterFn = (posts: string[]) => string[] | Promise<string[]>;
export type CursorForPostFn = (postId: string) => Promise<number | undefined>;

export interface CollectParams {
  limit: number;
  cursor: number;
  filter: FilterFn;
  fetch: FetchFn;
  /** Resolves a score-stream resume cursor for a post served from the overflow buffer.
   * Stream-aware: bookmark streams must resolve bookmark time, not the post's `indexed_at`
   * (see #2100). Defaults to the post's `indexed_at` when omitted. */
  cursorForPost?: CursorForPostFn;
  /** Per-call cap on backend fetches while filtering empties pages. Defaults to the
   * shared `MAX_FETCH_ITERATIONS`; pass a lower value for surfaces where bounding a
   * user's data/latency matters more than scan depth (e.g. Discover Collections). */
  maxIterations?: number;
}

export interface CollectResult {
  posts: string[];
  cacheMissIds: string[];
  /** Opaque resume cursor: raw `skip` offset for skip streams, `last_post_score` for
   * score streams. Advanced only by raw backend data, never by post-filter count. */
  nextCursor: number | undefined;
  /** True only if Nexus returned fewer posts than limit (actual end of stream) AND no
   * overflow remains buffered — otherwise the caller would hide its load-more affordance
   * while posts are still queued. False if we hit the iteration cap or filled the limit. */
  reachedEnd: boolean;
}
