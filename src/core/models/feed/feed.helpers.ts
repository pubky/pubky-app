import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { POST_STREAM_TAG_DELIMITER } from '@/services/nexus/stream/posts/postStream.constants';
import { StreamKind, StreamSource } from '@/services/nexus/stream/posts/postStream.types';

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

export function reachToStreamSource(reach: PubkyAppFeedReach): StreamSource {
  const map: Record<PubkyAppFeedReach, StreamSource> = {
    [PubkyAppFeedReach.All]: StreamSource.ALL,
    [PubkyAppFeedReach.Following]: StreamSource.FOLLOWING,
    [PubkyAppFeedReach.Friends]: StreamSource.FRIENDS,
    [PubkyAppFeedReach.Followers]: StreamSource.FOLLOWERS,
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

export function buildFeedStreamId(feed: FeedModelSchema): PostStreamId {
  const sorting = sortToStreamSorting(feed.sort);
  const source = reachToStreamSource(feed.reach);
  const kind = contentToStreamKind(feed.content) ?? 'all';
  const tags = feed.tags.join(POST_STREAM_TAG_DELIMITER);

  return `${sorting}:${source}:${kind}:${tags}` as PostStreamId;
}
