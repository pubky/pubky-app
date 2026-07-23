import type { Pubky } from '@/models/models.types';
import {
  buildWotDomainStreamId,
  type PostStreamId,
  type PostStreamKindSegment,
  type WotDomainDepth,
} from '@/models/stream/post/postStream.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import {
  CONTENT,
  type ContentType,
  PROFILE_TAG_SCOPE,
  type ProfileTagScopeType,
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
  [SORT.TIMELINE]: 'timeline',
  [SORT.ENGAGEMENT]: 'total_engagement',
} as const satisfies Record<SortType, string>;

/** Maps streamId SORTING part to SORT filter (auto-generated) */
const SORTING_TO_SORT = reverseMapping(SORT_TO_SORTING);

/** Maps REACH filter to streamId SOURCE part */
const REACH_TO_SOURCE = {
  [REACH.ALL]: 'all',
  [REACH.NETWORK]: 'wot',
  [REACH.FOLLOWING]: 'following',
  [REACH.FRIENDS]: 'friends',
} as const;

type NexusReachType = keyof typeof REACH_TO_SOURCE;

/**
 * ME is resolved to an author stream by the feed hooks; callers without an
 * authenticated author safely fall back to ALL.
 */
function toNexusReach(reach: ReachType): NexusReachType {
  return reach === REACH.ME ? REACH.ALL : reach;
}

/** Maps streamId SOURCE part to REACH filter (auto-generated) */
const SOURCE_TO_REACH = reverseMapping(REACH_TO_SOURCE);

/** Maps CONTENT filter to streamId KIND part */
const CONTENT_TO_KIND = {
  [CONTENT.ALL]: 'all',
  [CONTENT.SHORT]: 'short',
  [CONTENT.LONG]: 'long',
  [CONTENT.COLLECTIONS]: 'collection',
  [CONTENT.IMAGES]: 'image',
  [CONTENT.VIDEOS]: 'video',
  [CONTENT.LINKS]: 'link',
  [CONTENT.FILES]: 'file',
} as const satisfies Record<ContentType, string>;

const WOT_DOMAIN_DEPTH_BY_SCOPE = {
  [PROFILE_TAG_SCOPE.NETWORK]: 2,
  [PROFILE_TAG_SCOPE.FOLLOWING]: 1,
  [PROFILE_TAG_SCOPE.ME]: 0,
} as const satisfies Record<ProfileTagScopeType, WotDomainDepth>;

/** Maps streamId KIND part to CONTENT filter (auto-generated) */
const KIND_TO_CONTENT = reverseMapping(CONTENT_TO_KIND);

/**
 * Maps filter state to streamId pattern: sorting:source:kind
 *
 * Pattern breakdown:
 * - SORTING: timeline (recent), total_engagement (popularity)
 * - SOURCE: all, wot, following, friends (unresolved ME normalizes to all)
 * - KIND: all, short (posts), long (articles), collection, image, video, link, file
 *
 * @example
 * getStreamIdFromFilters('recent', 'all', 'all') // => 'timeline:all:all'
 * getStreamIdFromFilters('popularity', 'following', 'images') // => 'total_engagement:following:image'
 * getStreamIdFromFilters('recent', 'friends', 'posts') // => 'timeline:friends:short'
 */
export function getStreamIdFromFilters(sort: SortType, reach: ReachType, content: ContentType): string {
  const sorting = SORT_TO_SORTING[sort];
  const source = REACH_TO_SOURCE[toNexusReach(reach)];
  const kind = CONTENT_TO_KIND[content];

  return `${sorting}:${source}:${kind}`;
}

/**
 * Type-safe version that returns a supported post stream ID.
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
  profileTagScope: ProfileTagScopeType = PROFILE_TAG_SCOPE.NETWORK,
) {
  // Nexus currently applies its own default Reach (Network) to `wot_domain`.
  // Keep the ring's selected Reach in UI state for future Nexus support, but
  // intentionally do not encode it in this request yet.
  if (currentUserPubky && profileTags.length > 0 && reach !== REACH.ME) {
    const depth = WOT_DOMAIN_DEPTH_BY_SCOPE[profileTagScope];
    return buildWotDomainStreamId(
      SORT_TO_SORTING[sort] as StreamSorting,
      depth,
      CONTENT_TO_KIND[content] as PostStreamKindSegment,
      profileTags,
    );
  }

  const effectiveReach = currentUserPubky ? reach : REACH.ALL;
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
 * Returns whether a post kind belongs in a timeline stream identified by streamId.
 * Unparseable stream ids (profile, author collections, etc.) accept all kinds.
 */
export function postKindBelongsToStream(postKind: string, streamId: string): boolean {
  const streamParts = streamId.split(':');
  const wotDomainContent =
    streamParts[1] === StreamSource.WOT_DOMAIN
      ? KIND_TO_CONTENT[streamParts[3] as keyof typeof KIND_TO_CONTENT]
      : undefined;
  const parsed = parseStreamId(streamId);
  const streamContent = wotDomainContent ?? parsed?.content;

  if (!streamContent || streamContent === CONTENT.ALL) {
    return true;
  }

  const postContent = POST_KIND_TO_CONTENT[postKind as keyof typeof POST_KIND_TO_CONTENT];
  if (!postContent) {
    return false;
  }

  return postContent === streamContent;
}
