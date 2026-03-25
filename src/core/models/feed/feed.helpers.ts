import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import * as Core from '@/core';

export function reachToString(reach: PubkyAppFeedReach): string {
  const map: Record<PubkyAppFeedReach, string> = {
    [PubkyAppFeedReach.Following]: 'following',
    [PubkyAppFeedReach.Followers]: 'followers',
    [PubkyAppFeedReach.Friends]: 'friends',
    [PubkyAppFeedReach.All]: 'all',
  };
  return map[reach];
}

export function layoutToString(layout: PubkyAppFeedLayout): string {
  const map: Record<PubkyAppFeedLayout, string> = {
    [PubkyAppFeedLayout.Columns]: 'columns',
    [PubkyAppFeedLayout.Wide]: 'wide',
    [PubkyAppFeedLayout.Visual]: 'visual',
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
  };
  return map[kind];
}

export function reachToStreamSource(reach: PubkyAppFeedReach): Core.StreamSource {
  const map: Record<PubkyAppFeedReach, Core.StreamSource> = {
    [PubkyAppFeedReach.All]: Core.StreamSource.ALL,
    [PubkyAppFeedReach.Following]: Core.StreamSource.FOLLOWING,
    [PubkyAppFeedReach.Friends]: Core.StreamSource.FRIENDS,
    [PubkyAppFeedReach.Followers]: Core.StreamSource.FOLLOWERS,
  };
  return map[reach];
}

export function sortToStreamSorting(sort: PubkyAppFeedSort): Core.StreamSorting {
  const map: Record<PubkyAppFeedSort, Core.StreamSorting> = {
    [PubkyAppFeedSort.Recent]: Core.StreamSorting.TIMELINE,
    [PubkyAppFeedSort.Popularity]: Core.StreamSorting.ENGAGEMENT,
  };
  return map[sort];
}

export function contentToStreamKind(content: PubkyAppPostKind | null): Core.StreamKind | undefined {
  if (content === null) return undefined;
  const map: Record<PubkyAppPostKind, Core.StreamKind> = {
    [PubkyAppPostKind.Short]: Core.StreamKind.SHORT,
    [PubkyAppPostKind.Long]: Core.StreamKind.LONG,
    [PubkyAppPostKind.Image]: Core.StreamKind.IMAGE,
    [PubkyAppPostKind.Video]: Core.StreamKind.VIDEO,
    [PubkyAppPostKind.Link]: Core.StreamKind.LINK,
    [PubkyAppPostKind.File]: Core.StreamKind.FILE,
  };
  return map[content];
}

export function buildFeedStreamId(feed: Core.FeedModelSchema): Core.PostStreamId {
  const sorting = sortToStreamSorting(feed.sort);
  const source = reachToStreamSource(feed.reach);
  const kind = contentToStreamKind(feed.content) ?? 'all';
  const tags = feed.tags.join(Core.POST_STREAM_TAG_DELIMITER);

  return `${sorting}:${source}:${kind}:${tags}` as Core.PostStreamId;
}
