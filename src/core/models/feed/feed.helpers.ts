import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
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

export function reachToString(reach: PubkyAppFeedReach): string {
  const map: Record<PubkyAppFeedReach, string> = {
    [PubkyAppFeedReach.Following]: 'following',
    [PubkyAppFeedReach.Followers]: 'followers',
    [PubkyAppFeedReach.Friends]: 'friends',
    [PubkyAppFeedReach.All]: 'all',
    [PubkyAppFeedReach.Wot]: 'wot',
    [PubkyAppFeedReach.Me]: 'me',
  };
  return map[reach];
}

export function layoutToString(layout: PubkyAppFeedLayout): string {
  const map: Record<PubkyAppFeedLayout, string> = {
    [PubkyAppFeedLayout.Columns]: 'columns',
    [PubkyAppFeedLayout.Wide]: 'wide',
    [PubkyAppFeedLayout.Visual]: 'visual',
    [PubkyAppFeedLayout.List]: 'list',
  };
  return map[layout];
}

export function sortToString(sort: PubkyAppFeedSort): string {
  const map: Record<PubkyAppFeedSort, string> = {
    [PubkyAppFeedSort.Recent]: 'recent',
    [PubkyAppFeedSort.Popularity]: 'popularity',
  };
  return map[sort];
}

export function postKindToString(kind: PubkyAppPostKind): string {
  const map: Record<PubkyAppPostKind, string> = {
    [PubkyAppPostKind.Short]: 'short',
    [PubkyAppPostKind.Long]: 'long',
    [PubkyAppPostKind.Image]: 'image',
    [PubkyAppPostKind.Video]: 'video',
    [PubkyAppPostKind.Link]: 'link',
    [PubkyAppPostKind.File]: 'file',
    [PubkyAppPostKind.Collection]: 'collection',
    [PubkyAppPostKind.Unknown]: 'unknown',
  };
  return map[kind];
}

export function reachToStreamSource(reach: Exclude<PubkyAppFeedReach, PubkyAppFeedReach.Me>): StreamSource {
  const map: Record<Exclude<PubkyAppFeedReach, PubkyAppFeedReach.Me>, StreamSource> = {
    [PubkyAppFeedReach.All]: StreamSource.ALL,
    [PubkyAppFeedReach.Following]: StreamSource.FOLLOWING,
    [PubkyAppFeedReach.Friends]: StreamSource.FRIENDS,
    [PubkyAppFeedReach.Followers]: StreamSource.FOLLOWERS,
    [PubkyAppFeedReach.Wot]: StreamSource.WOT,
  };
  return map[reach];
}

export function sortToStreamSorting(sort: PubkyAppFeedSort): StreamSorting {
  const map: Record<PubkyAppFeedSort, StreamSorting> = {
    [PubkyAppFeedSort.Recent]: StreamSorting.TIMELINE,
    [PubkyAppFeedSort.Popularity]: StreamSorting.ENGAGEMENT,
  };
  return map[sort];
}

export function contentToStreamKind(content: PubkyAppPostKind | null): StreamKind | undefined {
  if (content === null) return undefined;
  const map: Record<PubkyAppPostKind, StreamKind | undefined> = {
    [PubkyAppPostKind.Short]: StreamKind.SHORT,
    [PubkyAppPostKind.Long]: StreamKind.LONG,
    [PubkyAppPostKind.Image]: StreamKind.IMAGE,
    [PubkyAppPostKind.Video]: StreamKind.VIDEO,
    [PubkyAppPostKind.Link]: StreamKind.LINK,
    [PubkyAppPostKind.File]: StreamKind.FILE,
    [PubkyAppPostKind.Collection]: StreamKind.COLLECTION,
    [PubkyAppPostKind.Unknown]: undefined,
  };
  return map[content];
}

/**
 * Exhaustive per-reach wot_domain depth, keyed by the config-owned supported
 * set: adding a reach to PROFILE_TAG_SUPPORTED_REACHES without an explicit
 * depth decision fails compilation here. WoT V1 creates only wot/depth-2
 * Tagged-as feeds; the remaining depths are preserved for foreign and legacy
 * feed compatibility and future authoring. Plain string keys avoid accessing
 * pubky-app-specs enums at module scope because some tests partially mock it.
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
    const reach = reachToString(feed.reach);
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

  if (feed.reach === PubkyAppFeedReach.Me) {
    return buildSortedAuthorStreamId(sorting, viewerPubky, kind, feed.tags);
  }

  const source = reachToStreamSource(feed.reach);
  const tags = feed.tags.join(POST_STREAM_TAG_DELIMITER);

  return `${sorting}:${source}:${kind}:${tags}` as PostStreamId;
}
