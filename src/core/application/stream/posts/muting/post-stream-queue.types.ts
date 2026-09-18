import { TPostStreamChunkResponse } from '../post.types';

export type FetchResult = TPostStreamChunkResponse;
export type FetchFn = (cursor: number) => Promise<FetchResult>;
export type FilterFn = (posts: string[]) => string[] | Promise<string[]>;

export interface CollectParams {
  limit: number;
  cursor: number;
  filter: FilterFn;
  fetch: FetchFn;
  /** Per-call cap on backend fetches while filtering empties pages. Defaults to the
   * shared `MAX_FETCH_ITERATIONS`; pass a lower value for surfaces where bounding a
   * user's data/latency matters more than scan depth (e.g. Discover Collections). */
  maxIterations?: number;
}

export interface CollectResult {
  posts: string[];
  cacheMissIds: string[];
  /** Opaque resume cursor: raw `skip` offset for skip streams, `last_post_score` for
   * score streams. Advanced only by raw backend data, never by post-filter count, and
   * never synthesized from a post's local timestamp. */
  nextCursor: number | undefined;
  /** True only if Nexus returned fewer posts than limit (actual end of stream) AND no
   * overflow remains buffered — otherwise the caller would hide its load-more affordance
   * while posts are still queued. False if we hit the iteration cap or filled the limit. */
  reachedEnd: boolean;
  /** Raw ids this call consumed before filtering: pulled from the cache walk / Nexus, or
   * taken out of the overflow buffer. Lets callers budget a scan by posts, not by rounds
   * (a round through an unhydrated region inspects a single page while a cached one
   * inspects up to `maxIterations`), and tells them a buffer-served round made progress
   * even when every served id is later hidden. */
  rawScannedCount: number;
}
