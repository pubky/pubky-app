import type { TFetchStreamParams } from '@/application/stream/posts/post.types';
import { getMaxStreamTags } from '@/libs/runtime-config/runtime-config';
import {
  CONTENT_SEARCH_STREAM_PREFIX,
  isContentSearchStream,
  parseContentSearchStreamId,
  type PostStreamId,
  type WotDomainDepth,
} from '@/models/stream/post/postStream.types';
import type {
  THandleNotCommonStreamParamsParams,
  TSetStreamPaginationParams,
} from '@/services/local/stream/posts/post.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import {
  POST_STREAM_TAG_DELIMITER,
  POST_STREAM_WOT_DEFAULT_DEPTH,
} from '@/services/nexus/stream/posts/postStream.constants';
import {
  StreamKind,
  StreamOrder,
  StreamSource,
  type TPostStreamFetchParams,
  type TStreamBase,
  type TStreamExtraParams,
  type TStreamIdBreakdown,
  type TStreamSource,
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
  const { sorting, invokeEndpoint, authorId, kind, tags, wotDepth, domainTags, searchQuery } =
    breakDownStreamId(streamId);

  // Content search hits its own endpoint with a minimal param surface (q, author, kind, skip,
  // limit): no viewer/sorting/order/tags, and no author_id fabrication via
  // handleNotCommonStreamParams. `author_id` is set only for author-scoped searches.
  if (invokeEndpoint === StreamSource.CONTENT_SEARCH) {
    const params: TStreamBase = {};
    const parsedKind = kind ? parseContent(kind) : undefined;
    if (parsedKind) {
      params.kind = parsedKind;
    }
    params.limit = limit;
    setStreamPagination({ params, streamTail, streamHead, invokeEndpoint });
    return { params, invokeEndpoint, extraParams: { q: searchQuery, author_id: authorId } };
  }

  const params: TStreamBase = {};
  params.viewer_id = viewerId ?? undefined;
  params.sorting = parseSorting(sorting);
  if (invokeEndpoint === StreamSource.WOT_DOMAIN) {
    // `!== undefined` rather than truthiness: depth 0 (Me trust set) is a valid value.
    if (wotDepth !== undefined) {
      params.depth = wotDepth;
    }
    params.domain_tags = domainTags;
    if (tags) {
      params.tags = tags;
    }
  } else {
    params.tags = tags;
  }
  if (invokeEndpoint === StreamSource.WOT) {
    params.depth = POST_STREAM_WOT_DEFAULT_DEPTH;
  }
  // REPLIES and COLLECTION use the third segment for an entity id (postId), not a kind.
  if (kind && invokeEndpoint !== StreamSource.REPLIES && invokeEndpoint !== StreamSource.COLLECTION) {
    params.kind = parseContent(kind);
  }
  params.limit = limit;
  params.order = order;
  const extraParams = handleNotCommonStreamParams({ authorId: authorId ?? sorting, postId: kind, invokeEndpoint });
  setStreamPagination({ params, streamTail, streamHead, invokeEndpoint });
  return { params, invokeEndpoint, extraParams };
}

/**
 * Handles parameters specific to streams that don't follow the common TStreamBase pattern.
 * Only REPLIES and COLLECTION streams encode a `post_id` in the third stream-id segment;
 * for AUTHOR / AUTHOR_REPLIES the third segment (when present) is a `kind` filter and must
 * NOT be forwarded as `post_id`.
 * @param authorId - The author identifier for the stream
 * @param postId - Optional post identifier for post-specific streams
 * @param invokeEndpoint - Resolved stream source (controls whether postId is forwarded)
 */
function handleNotCommonStreamParams({
  authorId,
  postId,
  invokeEndpoint,
}: THandleNotCommonStreamParamsParams): TStreamExtraParams {
  const extraParams: TStreamExtraParams = {
    author_id: authorId,
  };

  if (postId && (invokeEndpoint === StreamSource.REPLIES || invokeEndpoint === StreamSource.COLLECTION)) {
    extraParams.post_id = postId;
  }
  return extraParams;
}

/**
 * Sets pagination parameters based on the sorting type and stream tail value.
 * @param params - The base stream parameters object to modify
 * @param streamTail - The pagination tail value (timestamp of last post in current page)
 */
function setStreamPagination({ params, streamTail, streamHead, invokeEndpoint }: TSetStreamPaginationParams) {
  // Engagement, single-collection item, and content-search streams paginate by offset (`skip`):
  // Nexus returns no score/timestamp cursor for them, so `streamTail` carries the number of items
  // already loaded.
  if (
    params.sorting === StreamSorting.ENGAGEMENT ||
    invokeEndpoint === StreamSource.COLLECTION ||
    invokeEndpoint === StreamSource.CONTENT_SEARCH
  ) {
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

function parseWotDomainDepth(depth: string | undefined): WotDomainDepth {
  if (depth === '0') return 0;
  if (depth === '1') return 1;
  if (depth === '2') return 2;
  throw new Error(`Invalid wot_domain depth: ${depth}`);
}

/**
 * Breaks down a stream ID into its components (sorting, endpoint, kind, tags).
 * NOTE: There are some special streams that does not follow timline pattern as post_replies, author_replies and author.
 * @param streamId - The stream ID to break down
 */
export function breakDownStreamId(streamId: PostStreamId): TStreamIdBreakdown {
  // Content-search family first: its second segment is a user query, so it must never reach the
  // generic segment parsing below. Never throws — `searchQuery` is undefined for malformed ids
  // and the fetch layer fails loudly instead.
  if (isContentSearchStream(streamId)) {
    const contentSearch = parseContentSearchStreamId(streamId);
    return {
      sorting: CONTENT_SEARCH_STREAM_PREFIX,
      invokeEndpoint: StreamSource.CONTENT_SEARCH,
      kind: contentSearch?.kind,
      searchQuery: contentSearch?.query,
      // Author-scoped searches (profile "Filter posts") carry the profile pubky.
      authorId: contentSearch?.author,
    };
  }

  const [sorting, invokeEndpoint, thirdSegment, fourthSegment, fifthSegment, sixthSegment] = streamId.split(':');
  // Tags are separated by ',' character. Only the first MAX_STREAM_TAGS are considered.
  const limitTags = (tags: string | undefined): string | undefined =>
    tags
      ? tags.split(POST_STREAM_TAG_DELIMITER).slice(0, getMaxStreamTags()).join(POST_STREAM_TAG_DELIMITER)
      : undefined;

  if (invokeEndpoint === StreamSource.AUTHOR && parseSorting(sorting) && thirdSegment) {
    return {
      sorting,
      invokeEndpoint: StreamSource.AUTHOR,
      authorId: thirdSegment,
      kind: fourthSegment,
      tags: limitTags(fifthSegment),
    };
  }

  if (invokeEndpoint === StreamSource.WOT_DOMAIN) {
    return {
      sorting,
      invokeEndpoint: StreamSource.WOT_DOMAIN,
      kind: fourthSegment,
      wotDepth: parseWotDomainDepth(thirdSegment),
      domainTags: limitTags(fifthSegment),
      tags: limitTags(sixthSegment),
    };
  }

  if (thirdSegment) {
    if (sorting === StreamSource.REPLIES || sorting === StreamSource.COLLECTION) {
      // Source-first composite formats:
      // - post_replies:<pubky>:<postId>
      // - collection:<pubky>:<postId>
      return {
        sorting: invokeEndpoint,
        invokeEndpoint: toStreamSource({ value: sorting }),
        kind: thirdSegment,
        tags: limitTags(fourthSegment),
      };
    }
    // Applies to timeline pattern (sorting:source:kind[:tags]) and to the
    // author-with-kind shape (<pubky>:author:<kind>) where parseSorting falls
    // through to undefined.
    return {
      sorting,
      invokeEndpoint: toStreamSource({ value: invokeEndpoint }),
      kind: thirdSegment,
      tags: limitTags(fourthSegment),
    };
  }
  // That case covers StreamSource.AUTHOR_REPLIES and StreamSource.AUTHOR
  // i.e. [pubky, author_replies | author, undefined]
  return {
    sorting: invokeEndpoint,
    invokeEndpoint: toStreamSource({ value: sorting }),
    tags: limitTags(fourthSegment),
  };
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
    collection: StreamKind.COLLECTION,
  };
  return contentMap[content];
}
