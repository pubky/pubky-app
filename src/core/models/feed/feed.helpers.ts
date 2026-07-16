import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { isProfileTagReachSupported } from '@/config/feed';
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

type ProfileTagFeedReach =
  | PubkyAppFeedReach.Wot
  | PubkyAppFeedReach.Following
  | PubkyAppFeedReach.Friends
  | PubkyAppFeedReach.Me;

/**
 * Exhaustive per-reach wot_domain depth. `satisfies` forces a compile error if
 * a reach is added to the supported set without an explicit depth decision.
 * The map lives inside the function (like every other enum map in this file)
 * so importing the module never touches the enum — test suites partially mock
 * pubky-app-specs without exporting PubkyAppFeedReach.
 */
function wotDomainDepthForReach(reach: ProfileTagFeedReach): WotDomainDepth {
  const map = {
    [PubkyAppFeedReach.Wot]: 2,
    [PubkyAppFeedReach.Following]: 1,
    [PubkyAppFeedReach.Friends]: 1,
    [PubkyAppFeedReach.Me]: 0,
  } as const satisfies Record<ProfileTagFeedReach, WotDomainDepth>;
  return map[reach];
}

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
    // The guard above narrows the reach at runtime; TS cannot infer it from the string check.
    const depth = wotDomainDepthForReach(feed.reach as ProfileTagFeedReach);
    return buildWotDomainStreamId(sorting, depth, kind, domainTags, feed.tags);
  }

  if (feed.reach === PubkyAppFeedReach.Me) {
    return buildSortedAuthorStreamId(sorting, viewerPubky, kind, feed.tags);
  }

  const source = reachToStreamSource(feed.reach);
  const tags = feed.tags.join(POST_STREAM_TAG_DELIMITER);

  return `${sorting}:${source}:${kind}:${tags}` as PostStreamId;
}
