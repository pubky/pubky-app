import { Env } from '@/libs/env/env';
import type { TFetchStreamParams } from '@/application/stream/posts/post.types';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import type {
  THandleNotCommonStreamParamsParams,
  TSetStreamPaginationParams,
} from '@/services/local/stream/posts/post.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { POST_STREAM_TAG_DELIMITER } from '@/services/nexus/stream/posts/postStream.constants';
import { StreamKind, StreamOrder, StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import type {
  TPostStreamFetchParams,
  TStreamBase,
  TStreamExtraParams,
  TStreamIdBreakdown,
  TStreamSource,
} from '@/services/nexus/stream/posts/postStream.types';
/**
 * Creates parameters for fetching a post stream based on the stream ID and pagination settings.
 * @param streamId - The unique identifier of the stream to fetch
 * @param streamTail - The pagination tail value for determining where to start fetching
 * @param limit - The maximum number of posts to fetch
 * @param viewerId - Optional viewer identifier for personalized content
 */
export function createPostStreamParams({
  streamId,
  streamTail,
  limit,
  streamHead,
  viewerId,
  order,
}: TFetchStreamParams): TPostStreamFetchParams {
  const [sorting, invokeEndpoint, content, tags] = breakDownStreamId(streamId);

  const params: TStreamBase = {};
  params.viewer_id = viewerId ?? undefined;
  params.sorting = parseSorting(sorting);
  params.tags = tags;
  if (content && invokeEndpoint !== StreamSource.REPLIES) {
    params.kind = parseContent(content);
  }
  params.limit = limit;
  params.order = order;
  let extraParams = handleNotCommonStreamParams({ authorId: sorting, postId: content });
  setStreamPagination({ params, streamTail, streamHead });
  return { params, invokeEndpoint, extraParams };
}

/**
 * Handles parameters specific to streams that don't follow the common TStreamBase pattern.
 * @param authorId - The author identifier for the stream
 * @param postId - Optional post identifier for post-specific streams
 */
function handleNotCommonStreamParams({ authorId, postId }: THandleNotCommonStreamParamsParams): TStreamExtraParams {
  const extraParams: TStreamExtraParams = {
    author_id: authorId,
  };

  if (postId) {
    extraParams.post_id = postId;
  }
  return extraParams;
}

/**
 * Sets pagination parameters based on the sorting type and stream tail value.
 * @param params - The base stream parameters object to modify
 * @param streamTail - The pagination tail value (timestamp of last post in current page)
 */
function setStreamPagination({ params, streamTail, streamHead }: TSetStreamPaginationParams) {
  if (params.sorting === StreamSorting.ENGAGEMENT) {
    params.skip = streamTail; // post amount of the stream, page number * limit
  } else {
    // For ASCENDING order, streamTail is the timestamp of the newest post we have
    // We want posts NEWER than that, so we use it as 'end' (minimum timestamp)
    if (params.order === StreamOrder.ASCENDING) {
      if (streamTail > 0) {
        // Use end to set minimum timestamp - get posts with timestamp > streamTail
        params.end = streamTail + 1;
      }
    } else {
      // DESCENDING (default): Only set start if streamTail is not 0 (0 means initial load)
      if (streamTail > 0) {
        // If we do not decrease the streamTail by 1, we will get the same last post again.
        params.start = streamTail - 1; // timestamp of the last post
      }
      if (streamHead) {
        params.end = streamHead + 1;
      }
    }
    // If streamTail is 0, don't set start/end - this will fetch from the beginning
  }
}

/**
 * Validates and converts a string to StreamSource enum.
 * @param value - The string value to validate and convert
 */
function toStreamSource({ value }: TStreamSource): StreamSource {
  // Check if the value is a valid StreamSource
  if (Object.values(StreamSource).includes(value as StreamSource)) {
    return value as StreamSource;
  }
  throw new Error(`Invalid stream source: ${value}`);
}

/**
 * Breaks down a stream ID into its components (sorting, endpoint, kind, tags).
 * NOTE: There are some special streams that does not follow timline pattern as post_replies, author_replies and author.
 * @param streamId - The stream ID to break down
 */
export function breakDownStreamId(streamId: PostStreamId): TStreamIdBreakdown {
  const [sorting, invokeEndpoint, kind, tags] = streamId.split(':');
  // Tags are separated by ',' character. Only the first MAX_STREAM_TAGS are considered.
  const limitTags = tags
    ? tags.split(POST_STREAM_TAG_DELIMITER).slice(0, Env.NEXT_MAX_STREAM_TAGS).join(POST_STREAM_TAG_DELIMITER)
    : undefined;

  if (kind) {
    if (sorting === StreamSource.REPLIES) {
      // [pubky, post_replies, postId]
      return [invokeEndpoint, toStreamSource({ value: sorting }), kind, limitTags];
    }
    // Applies to timeline pattern
    return [sorting, toStreamSource({ value: invokeEndpoint }), kind, limitTags];
  }
  // That case covers StreamSource.AUTHOR_REPLIES and StreamSource.AUTHOR
  // i.e. [pubky, author_replies | author, undefined]
  return [invokeEndpoint, toStreamSource({ value: sorting }), undefined, limitTags];
}

/**
 * Parses a sorting string into the corresponding StreamSorting enum value.
 * @param sorting - The sorting string to parse
 */
function parseSorting(sorting: string): StreamSorting | undefined {
  const sortingMap: Record<string, StreamSorting> = {
    timeline: StreamSorting.TIMELINE,
    total_engagement: StreamSorting.ENGAGEMENT,
  };
  return sortingMap[sorting];
}

/**
 * Parses a content string into the corresponding StreamKind enum value.
 * @param content - The content string to parse
 */
function parseContent(content: string): StreamKind | undefined {
  // When content is 'all', return undefined (no kind filter)
  if (content === 'all') {
    return undefined;
  }

  const contentMap: Record<string, StreamKind> = {
    short: StreamKind.SHORT,
    long: StreamKind.LONG,
    image: StreamKind.IMAGE,
    video: StreamKind.VIDEO,
    link: StreamKind.LINK,
    file: StreamKind.FILE,
  };
  return contentMap[content];
}
