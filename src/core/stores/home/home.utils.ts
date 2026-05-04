import { SORT, REACH, CONTENT, type SortType, type ReachType, type ContentType } from './home.types';
import type { PostStreamTypes } from '@/models/stream/post/postStream.types';
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
  [SORT.TIMELINE]: 'timeline',
  [SORT.ENGAGEMENT]: 'total_engagement',
} as const satisfies Record<SortType, string>;

/** Maps streamId SORTING part to SORT filter (auto-generated) */
const SORTING_TO_SORT = reverseMapping(SORT_TO_SORTING);

/** Maps REACH filter to streamId SOURCE part */
const REACH_TO_SOURCE = {
  [REACH.ALL]: 'all',
  [REACH.FOLLOWING]: 'following',
  [REACH.FRIENDS]: 'friends',
} as const satisfies Record<ReachType, string>;

/** Maps streamId SOURCE part to REACH filter (auto-generated) */
const SOURCE_TO_REACH = reverseMapping(REACH_TO_SOURCE);

/** Maps CONTENT filter to streamId KIND part */
const CONTENT_TO_KIND = {
  [CONTENT.ALL]: 'all',
  [CONTENT.SHORT]: 'short',
  [CONTENT.LONG]: 'long',
  [CONTENT.IMAGES]: 'image',
  [CONTENT.VIDEOS]: 'video',
  [CONTENT.LINKS]: 'link',
  [CONTENT.FILES]: 'file',
} as const satisfies Record<ContentType, string>;

/** Maps streamId KIND part to CONTENT filter (auto-generated) */
const KIND_TO_CONTENT = reverseMapping(CONTENT_TO_KIND);

/**
 * Maps filter state to streamId pattern: sorting:source:kind
 *
 * Pattern breakdown:
 * - SORTING: timeline (recent), total_engagement (popularity)
 * - SOURCE: all, following, friends, me
 * - KIND: all, short (posts), long (articles), image, video, link, file
 *
 * @example
 * getStreamIdFromFilters('recent', 'all', 'all') // => 'timeline:all:all'
 * getStreamIdFromFilters('popularity', 'following', 'images') // => 'total_engagement:following:image'
 * getStreamIdFromFilters('recent', 'friends', 'posts') // => 'timeline:friends:short'
 */
export function getStreamIdFromFilters(sort: SortType, reach: ReachType, content: ContentType): string {
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
export function getStreamId(sort: SortType, reach: ReachType, content: ContentType): PostStreamTypes {
  const streamId = getStreamIdFromFilters(sort, reach, content);

  // The streamId string matches the enum value exactly, so we can cast directly
  return streamId as PostStreamTypes;
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
