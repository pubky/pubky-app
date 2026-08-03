import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';

export const POST_STREAM_GRAMMAR_FIXTURES = [
  {
    streamId: 'timeline:following:short',
    source: StreamSource.FOLLOWING,
    scope: 'follow_graph',
  },
  {
    streamId: 'total_engagement:following:image:bitcoin',
    source: StreamSource.FOLLOWING,
    scope: 'follow_graph',
  },
  {
    streamId: 'timeline:friends:all',
    source: StreamSource.FRIENDS,
    scope: 'friends',
  },
  {
    streamId: 'total_engagement:friends:collection',
    source: StreamSource.FRIENDS,
    scope: 'friends',
  },
  {
    streamId: 'timeline:wot:all',
    source: StreamSource.WOT,
    scope: 'follow_graph',
  },
  {
    streamId: 'total_engagement:wot:short:topic',
    source: StreamSource.WOT,
    scope: 'follow_graph',
  },
  {
    streamId: 'timeline:wot_domain:0:all:developer',
    source: StreamSource.WOT_DOMAIN,
    depth: 0,
    scope: undefined,
  },
  {
    streamId: 'timeline:wot_domain:1:image:developer',
    source: StreamSource.WOT_DOMAIN,
    depth: 1,
    scope: 'follow_graph',
  },
  {
    streamId: 'total_engagement:wot_domain:2:all:developer:bitcoin',
    source: StreamSource.WOT_DOMAIN,
    depth: 2,
    scope: 'follow_graph',
  },
  {
    streamId: 'timeline:all:all',
    source: StreamSource.ALL,
    scope: undefined,
  },
  {
    streamId: 'timeline:author:viewer-pubky:all',
    source: StreamSource.AUTHOR,
    scope: undefined,
  },
  {
    streamId: 'timeline:bookmarks:all',
    source: StreamSource.BOOKMARKS,
    scope: undefined,
  },
] as const;
