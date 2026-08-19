import type { PostStreamId } from '@/models/stream/post/postStream.types';
import type { StreamOrder } from '@/services/nexus/stream/posts/postStream.types';

export type TReadPostStreamChunkParams = {
  streamId: PostStreamId;
  streamHead?: number;
  streamTail?: number;
  lastPostId?: string;
  tags?: string[];
  limit?: number;
  /** Order of results: 'ascending' (oldest first) or 'descending' (newest first, default) */
  order?: StreamOrder;
};

export type TStreamIdParams = {
  streamId: PostStreamId;
};

export type TReadPostStreamChunkResponse = {
  nextPageIds: string[];
  /** Opaque resume cursor (raw `skip` offset for skip streams, score for score streams).
   * Advanced only by raw backend data, never by the post-filter visible count. */
  nextCursor: number | undefined;
  /** True only if we've reached the actual end of the stream.
   * False if we hit MAX_FETCH_ITERATIONS or filled the limit. */
  reachedEnd?: boolean;
  /** Id of the last RAW post scanned this round (visible or filtered). Thread it back as
   * the next request's `lastPostId` — prefer it over the last visible id via
   * `resolveResumeAnchor` (posts.utils.ts) — so the local cache walk resumes past
   * fully-filtered pages instead of restarting at the cache head.
   * May be a filtered-out post id — do not dereference for display. */
  lastRawPostId?: string;
};
