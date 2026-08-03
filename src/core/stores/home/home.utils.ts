import type { Pubky } from '@/models/models.types';
import {
  buildSortedAuthorStreamId,
  buildWotDomainStreamId,
  getPostStreamKind,
  type PostStreamId,
  type PostStreamKindSegment,
} from '@/models/stream/post/postStream.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { StreamKind } from '@/services/nexus/stream/posts/postStream.types';
import { CONTENT, type ContentType, REACH, type ReachType, SORT, type SortType } from './home.types';

// ============================================
// Bidirectional Mappings (DRY principle)
// ============================================

/**
 * Creates a reverse mapping from a forward mapping
 * @example reverseMapping({ key1: 'val1', key2: 'val2' }) => { val1: 'key1', val2: 'key2' }
 */
function reverseMapping<K extends string, V extends string>(map: Record<K, V>): Record<V, K> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key])) as Record<V, K>;
}

/** Maps SORT filter to streamId SORTING part */
const SORT_TO_SORTING = {
  [SORT.TIMELINE]: StreamSorting.TIMELINE,
  [SORT.ENGAGEMENT]: StreamSorting.ENGAGEMENT,
} as const satisfies Record<SortType, StreamSorting>;

/** Maps streamId SORTING part to SORT filter (auto-generated) */
const SORTING_TO_SORT = reverseMapping(SORT_TO_SORTING);

/** Maps REACH filter to streamId SOURCE part */
type SourceMappedReachType = Exclude<ReachType, typeof REACH.ME>;

const REACH_TO_SOURCE = {
  [REACH.ALL]: 'all',
  [REACH.NETWORK]: 'wot',
  [REACH.FOLLOWING]: 'following',
  [REACH.FRIENDS]: 'friends',
} as const satisfies Record<SourceMappedReachType, string>;

/** Maps streamId SOURCE part to REACH filter (auto-generated) */
const SOURCE_TO_REACH = reverseMapping(REACH_TO_SOURCE);

/** Maps CONTENT filter to streamId KIND part */
const CONTENT_TO_KIND = {
  [CONTENT.ALL]: 'all',
  [CONTENT.SHORT]: StreamKind.SHORT,
  [CONTENT.LONG]: StreamKind.LONG,
  [CONTENT.COLLECTIONS]: StreamKind.COLLECTION,
  [CONTENT.IMAGES]: StreamKind.IMAGE,
  [CONTENT.VIDEOS]: StreamKind.VIDEO,
  [CONTENT.LINKS]: StreamKind.LINK,
  [CONTENT.FILES]: StreamKind.FILE,
} as const satisfies Record<ContentType, PostStreamKindSegment>;

/**
 * Tagged as is a standalone depth-2 Home feed in the V1 UI. Depth 0/1 domain
 * paths remain supported by custom-feed models for foreign/legacy feed
 * interoperability and the post-V1 ideal state.
 */
const TAGGED_AS_WOT_DOMAIN_DEPTH = 2;

/** Maps streamId KIND part to CONTENT filter (auto-generated) */
const KIND_TO_CONTENT = reverseMapping(CONTENT_TO_KIND);

interface HomeStreamFilters {
  sort: SortType;
  reach: ReachType;
  content: ContentType;
  currentUserPubky?: Pubky | null;
  profileTags?: string[];
  taggedAsActive?: boolean;
}

/**
 * Maps filter state to streamId pattern: sorting:source:kind
 *
 * Pattern breakdown:
 * - SORTING: timeline (recent), total_engagement (popularity)
 * - SOURCE: all, following, friends, me
 * - KIND: all, short (posts), long (articles), collection, image, video, link, file
 *
 * @example
 * getStreamIdFromFilters('recent', 'all', 'all') // => 'timeline:all:all'
 * getStreamIdFromFilters('popularity', 'following', 'images') // => 'total_engagement:following:image'
 * getStreamIdFromFilters('recent', 'friends', 'posts') // => 'timeline:friends:short'
 */
export function getStreamIdFromFilters(sort: SortType, reach: ReachType, content: ContentType): string {
  if (reach === REACH.ME) {
    throw new Error('Me reach requires the current user id. Use getHomeStreamIdFromFilters instead.');
  }

  const sorting = SORT_TO_SORTING[sort];
  const source = REACH_TO_SOURCE[reach];
  const kind = CONTENT_TO_KIND[content];

  return `${sorting}:${source}:${kind}`;
}

/**
 * Type-safe version that returns PostStreamTypes enum for all valid filter combinations
 *
 * Since PostStreamTypes enum values are the actual streamId strings, we can cast directly.
 *
 * @example
 * getStreamId('recent', 'all', 'all') // => PostStreamTypes.TIMELINE_ALL_ALL
 * getStreamId('recent', 'following', 'images') // => PostStreamTypes.TIMELINE_FOLLOWING_IMAGE
 * getStreamId('popularity', 'friends', 'videos') // => PostStreamTypes.POPULARITY_FRIENDS_VIDEO
 */
export function getStreamId(sort: SortType, reach: ReachType, content: ContentType): PostStreamId {
  const streamId = getStreamIdFromFilters(sort, reach, content);

  return streamId as PostStreamId;
}

export function getHomeStreamIdFromFilters({
  sort,
  reach,
  content,
  currentUserPubky,
  profileTags = [],
  taggedAsActive = false,
}: HomeStreamFilters): PostStreamId {
  const effectiveReach = currentUserPubky ? reach : REACH.ALL;
  const kind = CONTENT_TO_KIND[content];

  if (currentUserPubky && taggedAsActive && profileTags.length > 0) {
    return buildWotDomainStreamId(SORT_TO_SORTING[sort], TAGGED_AS_WOT_DOMAIN_DEPTH, kind, profileTags);
  }

  if (effectiveReach === REACH.ME && currentUserPubky) {
    return buildSortedAuthorStreamId(SORT_TO_SORTING[sort], currentUserPubky, kind);
  }

  return getStreamId(sort, effectiveReach, content);
}

/**
 * Checks if a streamId matches the current filter state
 *
 * @example
 * matchesFilters('timeline:all:all', 'recent', 'all', 'all') // => true
 * matchesFilters('timeline:following:all', 'recent', 'all', 'all') // => false
 */
export function matchesFilters(streamId: string, sort: SortType, reach: ReachType, content: ContentType): boolean {
  // Me streams require viewer-aware author ids, which this legacy matcher cannot derive.
  if (reach === REACH.ME) {
    return false;
  }

  const expectedStreamId = getStreamIdFromFilters(sort, reach, content);
  return streamId === expectedStreamId;
}

/**
 * Parses a streamId back into filter components
 *
 * @example
 * parseStreamId('timeline:all:all') // => { sort: 'recent', reach: 'all', content: 'all' }
 * parseStreamId('total_engagement:following:image') // => { sort: 'popularity', reach: 'following', content: 'images' }
 */
export function parseStreamId(streamId: string): {
  sort: SortType;
  reach: ReachType;
  content: ContentType;
} | null {
  const parts = streamId.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const [sorting, source, kind] = parts;

  // Use the reverse mappings with type assertions for string keys
  const sort = SORTING_TO_SORT[sorting as keyof typeof SORTING_TO_SORT];
  const reach = SOURCE_TO_REACH[source as keyof typeof SOURCE_TO_REACH];
  const content = KIND_TO_CONTENT[kind as keyof typeof KIND_TO_CONTENT];

  // Validate all parts were found
  if (!sort || !reach || !content) {
    return null;
  }

  return { sort, reach, content };
}

const POST_KIND_TO_CONTENT = {
  short: CONTENT.SHORT,
  long: CONTENT.LONG,
  image: CONTENT.IMAGES,
  video: CONTENT.VIDEOS,
  link: CONTENT.LINKS,
  file: CONTENT.FILES,
  collection: CONTENT.COLLECTIONS,
} as const satisfies Record<string, ContentType>;

/**
 * Returns whether a post kind belongs in a stream identified by streamId.
 * Kind extraction is delegated to the canonical model-layer parser, which
 * covers timeline, tag, wot_domain, and author-kind shapes. Stream ids that
 * encode no kind (replies, single-collection items, plain author feeds)
 * accept all kinds.
 */
export function postKindBelongsToStream(postKind: string, streamId: string): boolean {
  const kindSegment = getPostStreamKind(streamId);
  if (!kindSegment) {
    return true;
  }

  const streamContent = KIND_TO_CONTENT[kindSegment];
  if (streamContent === CONTENT.ALL) {
    return true;
  }

  const postContent = POST_KIND_TO_CONTENT[postKind as keyof typeof POST_KIND_TO_CONTENT];
  if (!postContent) {
    return false;
  }

  return postContent === streamContent;
}
