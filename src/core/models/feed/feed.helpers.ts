import type { KnownFeedReach, KnownFeedSort, KnownPostKind } from 'pubky-social-specs';
import { isProfileTagReachSupported, type ProfileTagSupportedReach } from '@/config/feed';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { Pubky } from '@/models/models.types';
import {
  buildSortedAuthorStreamId,
  buildWotDomainStreamId,
  type PostStreamId,
  type WotDomainDepth,
} from '@/models/stream/post/postStream.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { POST_STREAM_TAG_DELIMITER } from '@/services/nexus/stream/posts/postStream.constants';
import { StreamKind, StreamSource } from '@/services/nexus/stream/posts/postStream.types';

export function reachToStreamSource(reach: Exclude<KnownFeedReach, 'me'>): StreamSource {
  const map: Record<Exclude<KnownFeedReach, 'me'>, StreamSource> = {
    all: StreamSource.ALL,
    following: StreamSource.FOLLOWING,
    friends: StreamSource.FRIENDS,
    followers: StreamSource.FOLLOWERS,
    wot: StreamSource.WOT,
  };
  return map[reach];
}

export function sortToStreamSorting(sort: KnownFeedSort): StreamSorting {
  const map: Record<KnownFeedSort, StreamSorting> = {
    recent: StreamSorting.TIMELINE,
    popularity: StreamSorting.ENGAGEMENT,
  };
  return map[sort];
}

export function contentToStreamKind(content: KnownPostKind | null): StreamKind | undefined {
  if (content === null) return undefined;
  const map: Record<KnownPostKind, StreamKind> = {
    note: StreamKind.SHORT,
    article: StreamKind.LONG,
    image: StreamKind.IMAGE,
    video: StreamKind.VIDEO,
    link: StreamKind.LINK,
    file: StreamKind.FILE,
    collection: StreamKind.COLLECTION,
  };
  return map[content];
}

/**
 * Exhaustive per-reach wot_domain depth, keyed by the config-owned supported
 * set: adding a reach to PROFILE_TAG_SUPPORTED_REACHES without an explicit
 * depth decision fails compilation here. WoT V1 creates only wot/depth-2
 * Tagged-as feeds; the remaining depths are preserved for foreign and legacy
 * feed compatibility and future authoring.
 * Following and Friends both serialize to depth 1, so a domain stream ID cannot
 * recover which reach authored it. Follow invalidation therefore treats every
 * depth-1 domain stream as graph-dependent rather than friend-only.
 */
const WOT_DOMAIN_DEPTH_BY_SUPPORTED_REACH = {
  network: 2,
  wot: 2,
  following: 1,
  friends: 1,
  me: 0,
} as const satisfies Record<ProfileTagSupportedReach, WotDomainDepth>;

export function buildFeedStreamId(feed: FeedModelSchema, viewerPubky: Pubky): PostStreamId {
  const sorting = sortToStreamSorting(feed.sort);
  const kind = contentToStreamKind(feed.content) ?? 'all';
  const domainTags = feed.domain_tags ?? [];

  if (domainTags.length > 0) {
    const reach = feed.reach;
    if (!isProfileTagReachSupported(reach)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Profile tags are not supported for this feed reach', {
        service: ErrorService.PubkyAppSpecs,
        operation: 'buildFeedStreamId',
        context: { reach },
      });
    }
    const depth = WOT_DOMAIN_DEPTH_BY_SUPPORTED_REACH[reach];
    return buildWotDomainStreamId(sorting, depth, kind, domainTags, feed.tags);
  }

  if (feed.reach === 'me') {
    return buildSortedAuthorStreamId(sorting, viewerPubky, kind, feed.tags);
  }

  const source = reachToStreamSource(feed.reach);
  const tags = feed.tags.join(POST_STREAM_TAG_DELIMITER);

  return `${sorting}:${source}:${kind}:${tags}` as PostStreamId;
}
