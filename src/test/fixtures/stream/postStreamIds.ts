import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';

export const POST_STREAM_GRAMMAR_FIXTURES = [
  {
    streamId: 'timeline:following:short',
    source: StreamSource.FOLLOWING,
    scopes: ['follow_graph'],
  },
  {
    streamId: 'timeline:following:all:',
    source: StreamSource.FOLLOWING,
    scopes: ['follow_graph'],
  },
  {
    streamId: 'total_engagement:following:image:bitcoin',
    source: StreamSource.FOLLOWING,
    scopes: ['follow_graph'],
  },
  {
    streamId: 'timeline:friends:all',
    source: StreamSource.FRIENDS,
    scopes: ['friends'],
  },
  {
    streamId: 'timeline:friends:all:',
    source: StreamSource.FRIENDS,
    scopes: ['friends'],
  },
  {
    streamId: 'total_engagement:friends:collection',
    source: StreamSource.FRIENDS,
    scopes: ['friends'],
  },
  {
    streamId: 'timeline:wot:all',
    source: StreamSource.WOT,
    scopes: ['follow_graph'],
  },
  {
    streamId: 'timeline:wot:all:',
    source: StreamSource.WOT,
    scopes: ['follow_graph'],
  },
  {
    streamId: 'total_engagement:wot:short:topic',
    source: StreamSource.WOT,
    scopes: ['follow_graph'],
  },
  {
    streamId: 'timeline:wot_domain:0:all:developer',
    source: StreamSource.WOT_DOMAIN,
    depth: 0,
    scopes: ['profile_tag'],
  },
  {
    streamId: 'timeline:wot_domain:1:image:developer',
    source: StreamSource.WOT_DOMAIN,
    depth: 1,
    scopes: ['follow_graph', 'profile_tag'],
  },
  {
    streamId: 'total_engagement:wot_domain:2:all:developer:bitcoin',
    source: StreamSource.WOT_DOMAIN,
    depth: 2,
    scopes: ['follow_graph', 'profile_tag'],
  },
  {
    streamId: 'timeline:all:all',
    source: StreamSource.ALL,
    scopes: [],
  },
  {
    streamId: 'timeline:author:viewer-pubky:all',
    source: StreamSource.AUTHOR,
    scopes: [],
  },
  {
    streamId: 'timeline:bookmarks:all',
    source: StreamSource.BOOKMARKS,
    scopes: [],
  },
] as const;
