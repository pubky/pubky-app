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
  timestamp: number | undefined;
  /** True only if we've reached the actual end of the stream.
   * False if we hit MAX_FETCH_ITERATIONS or filled the limit. */
  reachedEnd?: boolean;
};
