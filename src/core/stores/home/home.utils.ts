import type { Pubky } from '@/models/models.types';
import {
  buildWotDomainStreamId,
  type PostStreamId,
  type PostStreamKindSegment,
  type WotDomainDepth,
} from '@/models/stream/post/postStream.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { StreamKind, StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import {
  CONTENT,
  type ContentType,
  isProfileTagGatedReach,
  REACH,
  type ReachType,
  SORT,
  type SortType,
} from './home.types';

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

type WotDomainReachType = typeof REACH.NETWORK | typeof REACH.FOLLOWING | typeof REACH.FRIENDS;

const WOT_DOMAIN_DEPTH_BY_REACH = {
  [REACH.NETWORK]: 2,
  [REACH.FOLLOWING]: 1,
  [REACH.FRIENDS]: 1,
} as const satisfies Record<WotDomainReachType, WotDomainDepth>;

/** Maps streamId KIND part to CONTENT filter (auto-generated) */
const KIND_TO_CONTENT = reverseMapping(CONTENT_TO_KIND);

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

export function getHomeStreamIdFromFilters(
  sort: SortType,
  reach: ReachType,
  content: ContentType,
  currentUserPubky?: Pubky | null,
  profileTags: string[] = [],
): PostStreamId {
  const effectiveReach = currentUserPubky ? reach : REACH.ALL;
  const kind = CONTENT_TO_KIND[content];

  if (currentUserPubky && profileTags.length > 0 && !isProfileTagGatedReach(effectiveReach)) {
    const depth = WOT_DOMAIN_DEPTH_BY_REACH[effectiveReach];
    return buildWotDomainStreamId(SORT_TO_SORTING[sort], depth, kind, profileTags);
  }

  if (effectiveReach === REACH.ME) {
    const streamId =
      kind === 'all'
        ? `${StreamSource.AUTHOR}:${currentUserPubky}`
        : `${currentUserPubky}:${StreamSource.AUTHOR}:${kind}`;
    return streamId as PostStreamId;
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
