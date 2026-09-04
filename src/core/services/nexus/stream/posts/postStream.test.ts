import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import type { Pubky } from '@/models/models.types';
import { buildContentSearchStreamId, type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import { type NexusPost, type NexusPostsKeyStream, StreamSorting } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import {
  StreamSource,
  type TPostStreamFetchParams,
  type TStreamAllParams,
  type TStreamAuthorParams,
  type TStreamAuthorRepliesParams,
  type TStreamCollectionParams,
  type TStreamPostRepliesParams,
  type TStreamPostsByIdsParams,
  type TStreamQueryParams,
  type TStreamWithObserverParams,
} from '@/services/nexus/stream/posts/postStream.types';
import { POST_STREAM_GRAMMAR_FIXTURES } from '@/test/fixtures/stream/postStreamIds';
import { NexusPostStreamService } from './postStream';
import { postStreamApi } from './postStream.api';
import { StreamKind, StreamOrder } from './postStream.types';
import { breakDownStreamId, createPostStreamParams } from './postStream.utils';

//TODO: Split the suite by module (postStream.api.test.ts, postStream.utils.test.ts, postStream.service.test.ts) so each file targets the key behaviours of that module under @posts.

vi.mock('@/services/nexus/nexus.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/nexus/nexus.utils')>();
  return {
    ...actual,
    queryNexus: vi.fn(),
  };
});

const mockQueryNexus = vi.mocked(queryNexus);

function callStreamEndpoint(
  endpoint: keyof typeof postStreamApi,
  params: TStreamQueryParams,
): string | { body: { post_ids: string[]; viewer_id?: string }; url: string } {
  switch (endpoint) {
    case 'all':
      return postStreamApi.all(params as TStreamAllParams);
    case 'following':
      return postStreamApi.following(params as TStreamWithObserverParams);
    case 'followers':
      return postStreamApi.followers(params as TStreamWithObserverParams);
    case 'friends':
      return postStreamApi.friends(params as TStreamWithObserverParams);
    case 'wot':
      return postStreamApi.wot(params as TStreamWithObserverParams);
    case 'wot_domain':
      return postStreamApi.wot_domain(params as TStreamWithObserverParams);
    case 'bookmarks':
      return postStreamApi.bookmarks(params as TStreamWithObserverParams);
    case 'post_replies':
      return postStreamApi.post_replies(params as TStreamPostRepliesParams);
    case 'author':
      return postStreamApi.author(params as TStreamAuthorParams);
    case 'author_replies':
      return postStreamApi.author_replies(params as TStreamAuthorRepliesParams);
    case 'collection':
      return postStreamApi.collection(params as TStreamCollectionParams);
    case 'postsByIds':
      return postStreamApi.postsByIds(params as TStreamPostsByIdsParams);
    default:
      throw new Error(`Unknown endpoint: ${endpoint}`);
  }
}

describe('Stream API URL Generation', () => {
  const mockObserverId = 'erztyis9oiaho93ckucetcf5xnxacecqwhbst5hnd7mmkf69dhby';
  const mockAuthorId = 'author-pubky-id';
  const mockPostId = 'post-pubky-id';
  const mockViewerId = 'viewer-pubky-id';

  describe('Endpoint routing - Consolidated', () => {
    test.each([
      {
        name: 'all',
        endpoint: 'all' as const,
        params: { viewer_id: mockViewerId, sorting: StreamSorting.ENGAGEMENT, kind: StreamKind.VIDEO, limit: 50 },
        expectedInUrl: [
          'source=all',
          `viewer_id=${mockViewerId}`,
          'sorting=total_engagement',
          'kind=video',
          'limit=50',
        ],
      },
      {
        name: 'following',
        endpoint: 'following' as const,
        params: {
          observer_id: mockObserverId,
          viewer_id: mockViewerId,
          sorting: StreamSorting.TIMELINE,
          limit: 10,
        },
        expectedInUrl: [
          'source=following',
          `observer_id=${mockObserverId}`,
          `viewer_id=${mockViewerId}`,
          'sorting=timeline',
          'limit=10',
        ],
      },
      {
        name: 'followers',
        endpoint: 'followers' as const,
        params: { observer_id: mockObserverId, sorting: StreamSorting.ENGAGEMENT },
        expectedInUrl: ['source=followers', `observer_id=${mockObserverId}`, 'sorting=total_engagement'],
      },
      {
        name: 'friends',
        endpoint: 'friends' as const,
        params: { observer_id: mockObserverId, tags: 'dev,opensource', kind: StreamKind.SHORT },
        expectedInUrl: ['source=friends', `observer_id=${mockObserverId}`, 'tags=dev%2Copensource', 'kind=short'],
      },
      {
        name: 'wot',
        endpoint: 'wot' as const,
        params: { observer_id: mockObserverId, depth: 2, kind: StreamKind.LONG },
        expectedInUrl: ['source=wot', `observer_id=${mockObserverId}`, 'depth=2', 'kind=long'],
      },
      {
        name: 'wot_domain',
        endpoint: 'wot_domain' as const,
        params: { observer_id: mockObserverId, depth: 2, domain_tags: 'bitcoiner,dev' },
        expectedInUrl: ['source=wot_domain', `observer_id=${mockObserverId}`, 'depth=2', 'domain_tags=bitcoiner%2Cdev'],
      },
      {
        name: 'wot_domain depth 0 (Me trust set)',
        endpoint: 'wot_domain' as const,
        params: { observer_id: mockObserverId, depth: 0, domain_tags: 'bitcoiner' },
        expectedInUrl: ['source=wot_domain', `observer_id=${mockObserverId}`, 'depth=0', 'domain_tags=bitcoiner'],
      },
      {
        name: 'bookmarks',
        endpoint: 'bookmarks' as const,
        params: { observer_id: mockObserverId, order: StreamOrder.ASCENDING, start: 1759289451314, end: 1759289451314 },
        expectedInUrl: [
          'source=bookmarks',
          `observer_id=${mockObserverId}`,
          'order=ascending',
          'start=1759289451314',
          'end=1759289451314',
        ],
      },
      {
        name: 'post_replies',
        endpoint: 'post_replies' as const,
        params: { author_id: mockAuthorId, post_id: mockPostId, viewer_id: mockViewerId, limit: 20 },
        expectedInUrl: [
          'source=post_replies',
          `author_id=${mockAuthorId}`,
          `post_id=${mockPostId}`,
          `viewer_id=${mockViewerId}`,
          'limit=20',
        ],
      },
      {
        name: 'author',
        endpoint: 'author' as const,
        params: { author_id: mockAuthorId, sorting: StreamSorting.TIMELINE, kind: StreamKind.IMAGE },
        expectedInUrl: ['source=author', `author_id=${mockAuthorId}`, 'sorting=timeline', 'kind=image'],
      },
      {
        name: 'author_replies',
        endpoint: 'author_replies' as const,
        params: { author_id: mockAuthorId, tags: 'tech,ai,machine-learning', order: StreamOrder.DESCENDING },
        expectedInUrl: [
          'source=author_replies',
          `author_id=${mockAuthorId}`,
          'tags=tech%2Cai%2Cmachine-learning',
          'order=descending',
        ],
      },
    ])('$name endpoint generates correct URL with all parameters', ({ endpoint, params, expectedInUrl }) => {
      const url = callStreamEndpoint(endpoint, params);

      expect(url).toContain('v0/stream/posts/keys?');
      expectedInUrl.forEach((fragment) => {
        expect(url).toContain(fragment);
      });
    });
  });

  describe('Tags validation', () => {
    it('should include all provided tags as comma-separated string', () => {
      const url = postStreamApi.following({
        observer_id: mockObserverId,
        tags: 'tag1,tag2,tag3,tag4,tag5',
      });

      expect(url).toContain('tags=tag1%2Ctag2%2Ctag3%2Ctag4%2Ctag5');
    });

    it('should exclude empty or undefined tags from URL', () => {
      const urlWithEmpty = postStreamApi.following({
        observer_id: mockObserverId,
        tags: '',
      });
      const urlWithUndefined = postStreamApi.following({
        observer_id: mockObserverId,
        tags: undefined,
      });

      expect(urlWithEmpty).not.toContain('tags=');
      expect(urlWithUndefined).not.toContain('tags=');
    });
  });

  describe('Parameter handling', () => {
    test.each([
      { param: 'viewer_id', value: undefined, shouldExclude: true },
      { param: 'sorting', value: null, shouldExclude: true },
      { param: 'limit', value: undefined, shouldExclude: true },
      { param: 'tags', value: '', shouldExclude: true },
    ])('excludes $param when value is $value', ({ param, shouldExclude }) => {
      const url = postStreamApi.following({
        observer_id: mockObserverId,
        [param]: shouldExclude ? undefined : 'valid-value',
      });

      if (shouldExclude) {
        expect(url).not.toContain(`${param}=`);
      }
    });

    test.each([
      { param: 'limit', value: 10, expected: 'limit=10' },
      { param: 'skip', value: 5, expected: 'skip=5' },
      { param: 'start', value: 1234567890, expected: 'start=1234567890' },
      { param: 'end', value: 9876543210, expected: 'end=9876543210' },
    ])('converts number parameter $param to string correctly', ({ param, value, expected }) => {
      const url = postStreamApi.following({
        observer_id: mockObserverId,
        [param]: value,
      });

      expect(url).toContain(expected);
    });

    it('includes only defined parameters (minimal case)', () => {
      const url = postStreamApi.following({
        observer_id: mockObserverId,
      });

      expect(url).toContain('source=following');
      expect(url).toContain(`observer_id=${mockObserverId}`);
      expect(url).not.toContain('viewer_id=');
      expect(url).not.toContain('sorting=');
      expect(url).not.toContain('limit=');
    });

    it('includes all defined parameters (maximal case)', () => {
      const url = postStreamApi.following({
        observer_id: mockObserverId,
        viewer_id: mockViewerId,
        sorting: StreamSorting.TIMELINE,
        order: StreamOrder.DESCENDING,
        tags: 'dev,test',
        kind: StreamKind.SHORT,
        skip: 0,
        limit: 10,
        start: 1000,
        end: 2000,
      });

      const expectedParams = [
        'source=following',
        `observer_id=${mockObserverId}`,
        `viewer_id=${mockViewerId}`,
        'sorting=timeline',
        'order=descending',
        'tags=dev%2Ctest',
        'kind=short',
        'skip=0',
        'limit=10',
        'start=1000',
        'end=2000',
      ];

      expectedParams.forEach((param) => {
        expect(url).toContain(param);
      });
    });
  });

  describe('Posts by IDs endpoint', () => {
    const mockPostIds = ['post-id-1', 'post-id-2', 'post-id-3'];
    const mockViewerId = 'viewer-pubky-id';

    it('should generate correct POST request with post IDs only', () => {
      const request = postStreamApi.postsByIds({
        post_ids: mockPostIds,
      });

      expect(request.url).toMatch(/\/stream\/posts\/by_ids$/);
      expect(request.body).toEqual({
        post_ids: mockPostIds,
        include_attachment_metadata: true,
      });
    });

    it('should generate correct POST request with post IDs and viewer_id', () => {
      const request = postStreamApi.postsByIds({
        post_ids: mockPostIds,
        viewer_id: mockViewerId,
      });

      expect(request.url).toMatch(/\/stream\/posts\/by_ids$/);
      expect(request.body).toEqual({
        post_ids: mockPostIds,
        include_attachment_metadata: true,
        viewer_id: mockViewerId,
      });
    });

    it('should handle empty post IDs array', () => {
      const request = postStreamApi.postsByIds({
        post_ids: [],
      });

      expect(request.url).toMatch(/\/stream\/posts\/by_ids$/);
      expect(request.body.post_ids).toEqual([]);
    });

    it('should handle large array of post IDs', () => {
      const largePostIds = Array.from({ length: 100 }, (_, i) => `post-id-${i}`);
      const request = postStreamApi.postsByIds({
        post_ids: largePostIds,
        viewer_id: mockViewerId,
      });

      expect(request.url).toMatch(/\/stream\/posts\/by_ids$/);
      expect(request.body.post_ids).toHaveLength(100);
      expect(request.body.viewer_id).toBe(mockViewerId);
    });

    it('should include include_attachment_metadata when true', () => {
      const request = postStreamApi.postsByIds({
        post_ids: mockPostIds,
        viewer_id: mockViewerId,
        include_attachment_metadata: true,
      });

      expect(request.url).toMatch(/\/stream\/posts\/by_ids$/);
      expect(request.body).toEqual({
        post_ids: mockPostIds,
        viewer_id: mockViewerId,
        include_attachment_metadata: true,
      });
    });

    it('should default include_attachment_metadata to true when not provided', () => {
      const request = postStreamApi.postsByIds({
        post_ids: mockPostIds,
      });

      expect(request.body).toEqual({
        post_ids: mockPostIds,
        include_attachment_metadata: true,
      });
    });

    it('should allow explicitly setting include_attachment_metadata to false', () => {
      const request = postStreamApi.postsByIds({
        post_ids: mockPostIds,
        include_attachment_metadata: false,
      });

      expect(request.body).toEqual({
        post_ids: mockPostIds,
        include_attachment_metadata: false,
      });
    });
  });

  describe('API contract validation', () => {
    it('exposes all expected stream endpoints', () => {
      const endpointKeys = Object.keys(postStreamApi);
      const expectedEndpoints = [
        'all',
        'following',
        'followers',
        'friends',
        'wot',
        'wot_domain',
        'bookmarks',
        'post_replies',
        'author',
        'author_replies',
        'postsByIds',
      ];

      expectedEndpoints.forEach((endpoint) => {
        expect(endpointKeys).toContain(endpoint);
      });
    });
  });
});

describe('createPostStreamParams', () => {
  const mockViewerId = 'viewer-pubky-id' as Pubky;

  describe('Bookmark streams', () => {
    test.each([
      { streamType: PostStreamTypes.TIMELINE_BOOKMARKS_ALL, kind: undefined, name: 'all' },
      { streamType: PostStreamTypes.TIMELINE_BOOKMARKS_COLLECTION, kind: StreamKind.COLLECTION, name: 'collection' },
    ])('should handle timeline:bookmarks:$name stream', ({ streamType, kind }) => {
      const result = createPostStreamParams({
        streamId: streamType,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.sorting).toBe(StreamSorting.TIMELINE);
      expect(result.params.kind).toBe(kind);
      expect(result.params.viewer_id).toBe(mockViewerId);
      expect(result.params.limit).toBe(20);
      expect(result.invokeEndpoint).toBe(StreamSource.BOOKMARKS);
    });
  });

  describe('WoT streams', () => {
    it('should set default depth for timeline:wot streams', () => {
      const result = createPostStreamParams({
        streamId: 'timeline:wot:all' as PostStreamId,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.sorting).toBe(StreamSorting.TIMELINE);
      expect(result.params.depth).toBe(2);
      expect(result.params.viewer_id).toBe(mockViewerId);
      expect(result.params.limit).toBe(20);
      expect(result.invokeEndpoint).toBe(StreamSource.WOT);
    });

    it('should send post tags for Network streams', () => {
      const result = createPostStreamParams({
        streamId: 'timeline:wot:all:bitcoin,lightning' as PostStreamId,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.depth).toBe(2);
      expect(result.params.tags).toBe('bitcoin,lightning');
      expect(result.invokeEndpoint).toBe(StreamSource.WOT);
    });

    it('should set domain_tags and requested depth for wot_domain streams', () => {
      const result = createPostStreamParams({
        streamId: 'timeline:wot_domain:1:all:bitcoiner,dev' as PostStreamId,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.sorting).toBe(StreamSorting.TIMELINE);
      expect(result.params.depth).toBe(1);
      expect(result.params.domain_tags).toBe('bitcoiner,dev');
      expect(result.params.tags).toBeUndefined();
      expect(result.params.viewer_id).toBe(mockViewerId);
      expect(result.invokeEndpoint).toBe(StreamSource.WOT_DOMAIN);
    });

    it('should preserve collection kind for wot_domain collection streams', () => {
      const result = createPostStreamParams({
        streamId: 'total_engagement:wot_domain:2:collection:bitcoiner' as PostStreamId,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.sorting).toBe(StreamSorting.ENGAGEMENT);
      expect(result.params.depth).toBe(2);
      expect(result.params.domain_tags).toBe('bitcoiner');
      expect(result.params.kind).toBe(StreamKind.COLLECTION);
      expect(result.params.tags).toBeUndefined();
      expect(result.invokeEndpoint).toBe(StreamSource.WOT_DOMAIN);
    });

    it('should send post tags and profile tags together for combined domain streams', () => {
      const result = createPostStreamParams({
        streamId: 'timeline:wot_domain:2:all:bitcoiner,dev:bitcoin,lightning' as PostStreamId,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.domain_tags).toBe('bitcoiner,dev');
      expect(result.params.tags).toBe('bitcoin,lightning');
      expect(result.params.depth).toBe(2);
    });

    it('should keep the explicit depth 0 for Me wot_domain streams (regression: truthy check dropped 0)', () => {
      const result = createPostStreamParams({
        streamId: 'timeline:wot_domain:0:all:bitcoiner,dev' as PostStreamId,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.depth).toBe(0);
      expect(result.params.domain_tags).toBe('bitcoiner,dev');
      expect(result.invokeEndpoint).toBe(StreamSource.WOT_DOMAIN);
    });

    it('should parse sorting-aware custom Me streams and use offset pagination for popularity', () => {
      const result = createPostStreamParams({
        streamId: 'total_engagement:author:viewer-pubky-id:all:bitcoin' as PostStreamId,
        streamTail: 20,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.invokeEndpoint).toBe(StreamSource.AUTHOR);
      expect(result.extraParams.author_id).toBe(mockViewerId);
      expect(result.params.sorting).toBe(StreamSorting.ENGAGEMENT);
      expect(result.params.tags).toBe('bitcoin');
      expect(result.params.skip).toBe(20);
    });
  });

  describe('Pagination behavior - streamTail handling (CRITICAL BUSINESS LOGIC)', () => {
    describe('Timeline sorting - Uses timestamp-based pagination', () => {
      it('should NOT set start parameter when streamTail is 0 (initial load - fetch most recent)', () => {
        const result = createPostStreamParams({
          streamId: PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
          streamTail: 0, // streamTail = 0 means initial load
          streamHead: 0,
          limit: 20,
          viewerId: mockViewerId,
        });

        expect(result.params.start).toBeUndefined();
        expect(result.params.skip).toBeUndefined();
        // Rationale: When start is undefined, API returns most recent posts
      });

      it('should DECREMENT streamTail by 1 when streamTail > 0 to prevent duplicate boundary post', () => {
        const streamTail = 1234567890; // Last post timestamp from previous fetch
        const result = createPostStreamParams({
          streamId: PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
          streamTail,
          streamHead: 0,
          limit: 20,
          viewerId: mockViewerId,
        });

        expect(result.params.start).toBe(streamTail - 1);
        // CRITICAL: streamTail - 1 prevents fetching the same last post again
        // Without this decrement, the last post from page N would be the first post of page N+1
      });

      it('should handle streamTail = 1 (edge case: very first post)', () => {
        const result = createPostStreamParams({
          streamId: PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
          streamTail: 1,
          streamHead: 0,
          limit: 20,
          viewerId: mockViewerId,
        });

        expect(result.params.start).toBe(0); // 1 - 1 = 0
        // Posts with timestamp < 1 will be fetched (if any exist)
      });
    });

    describe('Engagement sorting - Uses offset-based pagination', () => {
      const engagementStreamId = 'total_engagement:bookmarks:all' as PostStreamId;

      it('should use skip (NOT start) when sorting by engagement', () => {
        const streamTail = 20; // Number of posts already loaded
        const result = createPostStreamParams({
          streamId: engagementStreamId,
          streamTail,
          streamHead: 0,
          limit: 20,
          viewerId: mockViewerId,
        });

        expect(result.params.skip).toBe(streamTail);
        expect(result.params.start).toBeUndefined();
        // Rationale: Engagement scores change frequently, so offset-based pagination is more stable
      });

      it('should set skip=0 for initial load when streamTail is 0', () => {
        const result = createPostStreamParams({
          streamId: engagementStreamId,
          streamTail: 0,
          streamHead: 0,
          limit: 20,
          viewerId: mockViewerId,
        });

        expect(result.params.skip).toBe(0);
        expect(result.params.start).toBeUndefined();
      });

      it('should NOT decrement streamTail for engagement sorting (no duplicate prevention needed)', () => {
        const streamTail = 40; // 40 posts already loaded
        const result = createPostStreamParams({
          streamId: engagementStreamId,
          streamTail,
          streamHead: 0,
          limit: 20,
          viewerId: mockViewerId,
        });

        expect(result.params.skip).toBe(40); // NOT decremented
        // Rationale: Offset-based pagination naturally avoids duplicates
      });
    });

    describe('Collection items stream - Uses offset-based pagination', () => {
      // collection:<authorPubky>:<postId> — Nexus serves these in the collection's own item
      // order and returns no score/timestamp cursor, so they must page by `skip` (regression
      // guard for the infinite-scroll flicker caused by a stuck null timestamp cursor).
      const collectionStreamId = 'collection:author-pubky:post-id-123' as PostStreamId;

      it('should use skip (NOT start) for collection item pagination', () => {
        const streamTail = 10; // Number of items already loaded
        const result = createPostStreamParams({
          streamId: collectionStreamId,
          streamTail,
          streamHead: 0,
          limit: 10,
          viewerId: mockViewerId,
        });

        expect(result.params.skip).toBe(streamTail);
        expect(result.params.start).toBeUndefined();
        expect(result.params.end).toBeUndefined();
      });

      it('should set skip=0 for the initial load and forward author_id + post_id', () => {
        const result = createPostStreamParams({
          streamId: collectionStreamId,
          streamTail: 0,
          streamHead: 0,
          limit: 10,
          viewerId: mockViewerId,
        });

        expect(result.params.skip).toBe(0);
        expect(result.params.start).toBeUndefined();
        expect(result.invokeEndpoint).toBe(StreamSource.COLLECTION);
        expect(result.extraParams.author_id).toBe('author-pubky');
        expect(result.extraParams.post_id).toBe('post-id-123');
      });
    });

    describe('Content search stream - Uses offset-based pagination', () => {
      const contentSearchStreamId = buildContentSearchStreamId('bitcoin wallet', StreamKind.COLLECTION);

      it('should build the minimal by_content param surface (q, kind, skip, limit)', () => {
        const result = createPostStreamParams({
          streamId: contentSearchStreamId,
          streamTail: 10,
          streamHead: 0,
          limit: 2,
          viewerId: 'someviewer' as Pubky,
        });

        expect(result.params).toEqual({ kind: StreamKind.COLLECTION, limit: 2, skip: 10 });
        expect(result.invokeEndpoint).toBe(StreamSource.CONTENT_SEARCH);
        expect(result.extraParams).toEqual({ q: 'bitcoin wallet' });
        // The by_content endpoint takes no viewer/sorting/order/tags/timestamp params.
        expect(result.params.viewer_id).toBeUndefined();
        expect(result.params.sorting).toBeUndefined();
        expect(result.params.order).toBeUndefined();
        expect(result.params.tags).toBeUndefined();
        expect(result.params.start).toBeUndefined();
        expect(result.params.end).toBeUndefined();
      });

      it('should omit the kind key entirely for kind "all"', () => {
        const result = createPostStreamParams({
          streamId: buildContentSearchStreamId('bitcoin wallet'),
          streamTail: 0,
          streamHead: 0,
          limit: 2,
          viewerId: mockViewerId,
        });

        expect(result.params).not.toHaveProperty('kind');
      });

      it('should NOT decrement streamTail (offset pagination, same as engagement sorting)', () => {
        const streamTail = 10; // Number of results already loaded
        const result = createPostStreamParams({
          streamId: contentSearchStreamId,
          streamTail,
          streamHead: 0,
          limit: 2,
          viewerId: mockViewerId,
        });

        expect(result.params.skip).toBe(10); // NOT decremented
        expect(result.params.start).toBeUndefined();
      });

      it('should carry the author scope through extraParams (profile "Filter posts")', () => {
        const authorPubky = 'profile-author-pubky' as Pubky;
        const result = createPostStreamParams({
          streamId: buildContentSearchStreamId('bitcoin wallet', 'all', authorPubky),
          streamTail: 10,
          streamHead: 0,
          limit: 2,
          viewerId: mockViewerId,
        });

        expect(result.invokeEndpoint).toBe(StreamSource.CONTENT_SEARCH);
        expect(result.extraParams).toEqual({ q: 'bitcoin wallet', author_id: authorPubky });
        expect(result.params).toEqual({ limit: 2, skip: 10 });
      });
    });
  });

  describe('Tags handling in stream IDs', () => {
    it('should parse tags from stream ID', () => {
      // Stream ID format: sorting:endpoint:kind:tags
      const streamIdWithTags = 'timeline:bookmarks:all:tech,ai,web3' as PostStreamId;
      const result = createPostStreamParams({
        streamId: streamIdWithTags,
        streamHead: 0,
        streamTail: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.tags).toBe('tech,ai,web3');
      expect(result.params.sorting).toBe(StreamSorting.TIMELINE);
      expect(result.invokeEndpoint).toBe(StreamSource.BOOKMARKS);
    });

    it('should limit tags to maximum 5 (PUBKY_RUNTIME_MAX_STREAM_TAGS)', () => {
      const streamIdWithManyTags = 'timeline:bookmarks:all:tag1,tag2,tag3,tag4,tag5,tag6,tag7' as PostStreamId;
      const result = createPostStreamParams({
        streamId: streamIdWithManyTags,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.tags).toBe('tag1,tag2,tag3,tag4,tag5');
      expect(result.params.tags).not.toContain('tag6');
    });

    it('should handle stream ID without tags', () => {
      const streamIdWithoutTags = 'timeline:bookmarks:video' as PostStreamId;
      const result = createPostStreamParams({
        streamId: streamIdWithoutTags,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.tags).toBeUndefined();
      expect(result.params.kind).toBe(StreamKind.VIDEO);
    });

    it('should handle tags with special characters', () => {
      const streamIdWithSpecialTags = 'timeline:bookmarks:all:machine-learning,ai/ml,web3.0' as PostStreamId;
      const result = createPostStreamParams({
        streamId: streamIdWithSpecialTags,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.tags).toBe('machine-learning,ai/ml,web3.0');
    });

    it('should preserve tag order from stream ID', () => {
      const streamIdWithOrderedTags = 'timeline:bookmarks:all:first,second,third' as PostStreamId;
      const result = createPostStreamParams({
        streamId: streamIdWithOrderedTags,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.tags).toBe('first,second,third');
    });

    it('should handle empty tag in stream ID', () => {
      // Stream ID with empty string after last colon
      const streamIdWithEmptyTag = 'timeline:bookmarks:all:' as PostStreamId;
      const result = createPostStreamParams({
        streamId: streamIdWithEmptyTag,
        streamTail: 0,
        streamHead: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      // Empty string after split should result in undefined after processing
      expect(result.params.tags).toBeUndefined();
    });
  });

  describe('Tags with different content types', () => {
    test.each([
      { kind: 'short', tags: 'tech,dev', expectedKind: StreamKind.SHORT },
      { kind: 'long', tags: 'essays,articles', expectedKind: StreamKind.LONG },
      { kind: 'image', tags: 'photos,art', expectedKind: StreamKind.IMAGE },
      { kind: 'video', tags: 'tutorials,vlogs', expectedKind: StreamKind.VIDEO },
      { kind: 'link', tags: 'resources,refs', expectedKind: StreamKind.LINK },
      { kind: 'file', tags: 'docs,pdfs', expectedKind: StreamKind.FILE },
      { kind: 'collection', tags: 'lists,research', expectedKind: StreamKind.COLLECTION },
    ])('should handle tags in $kind content stream', ({ kind, tags, expectedKind }) => {
      const streamIdWithTags = `timeline:bookmarks:${kind}:${tags}` as PostStreamId;
      const result = createPostStreamParams({
        streamId: streamIdWithTags,
        streamHead: 0,
        streamTail: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.params.tags).toBe(tags);
      expect(result.params.kind).toBe(expectedKind);
      expect(result.params.sorting).toBe(StreamSorting.TIMELINE);
    });
  });

  describe('Collections streams', () => {
    it('builds params for <pubky>:author:collection (My Collections)', () => {
      const result = createPostStreamParams({
        streamId: 'pubky:author:collection' as PostStreamId,
        streamHead: 0,
        streamTail: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.invokeEndpoint).toBe(StreamSource.AUTHOR);
      expect(result.params.kind).toBe(StreamKind.COLLECTION);
      expect(result.params.viewer_id).toBe(mockViewerId);
      // Regression guard: a non-empty 3rd segment on the AUTHOR source must NOT leak as post_id.
      expect(result.extraParams.author_id).toBe('pubky');
      expect(result.extraParams.post_id).toBeUndefined();
    });

    it('builds params for timeline:bookmarks:collection (Followed Collections)', () => {
      const result = createPostStreamParams({
        streamId: 'timeline:bookmarks:collection' as PostStreamId,
        streamHead: 0,
        streamTail: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.invokeEndpoint).toBe(StreamSource.BOOKMARKS);
      expect(result.params.sorting).toBe(StreamSorting.TIMELINE);
      expect(result.params.kind).toBe(StreamKind.COLLECTION);
      expect(result.params.viewer_id).toBe(mockViewerId);
      // Bookmarks endpoint doesn't consume extraParams.post_id; ensure it isn't populated.
      expect(result.extraParams.post_id).toBeUndefined();
    });

    it('builds params for total_engagement:all:collection (Discover Collections)', () => {
      const result = createPostStreamParams({
        streamId: 'total_engagement:all:collection' as PostStreamId,
        streamHead: 0,
        streamTail: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.invokeEndpoint).toBe(StreamSource.ALL);
      expect(result.params.sorting).toBe(StreamSorting.ENGAGEMENT);
      expect(result.params.kind).toBe(StreamKind.COLLECTION);
      expect(result.params.viewer_id).toBe(mockViewerId);
      expect(result.extraParams.post_id).toBeUndefined();
    });

    it('builds params for collection:<pubky>:<postId> (single-collection items, source-first composite)', () => {
      const result = createPostStreamParams({
        streamId: 'collection:pubky:post123' as PostStreamId,
        streamHead: 0,
        streamTail: 0,
        limit: 20,
        viewerId: mockViewerId,
      });

      expect(result.invokeEndpoint).toBe(StreamSource.COLLECTION);
      // 3rd segment is a postId for COLLECTION, NOT a kind — parseContent must be skipped.
      expect(result.params.kind).toBeUndefined();
      expect(result.params.viewer_id).toBe(mockViewerId);
      expect(result.extraParams.author_id).toBe('pubky');
      expect(result.extraParams.post_id).toBe('post123');
    });
  });
});

describe('breakDownStreamId', () => {
  it.each(POST_STREAM_GRAMMAR_FIXTURES)(
    'parses the shared grammar fixture $streamId',
    ({ streamId, source, ...fixture }) => {
      const result = breakDownStreamId(streamId as PostStreamId);

      expect(result.invokeEndpoint).toBe(source);
      expect(result.wotDepth).toBe('depth' in fixture ? fixture.depth : undefined);
    },
  );

  it('tolerates an empty optional post-tag segment in a wot_domain request breakdown', () => {
    expect(breakDownStreamId('timeline:wot_domain:2:all:developer:' as PostStreamId)).toEqual({
      sorting: 'timeline',
      invokeEndpoint: StreamSource.WOT_DOMAIN,
      kind: 'all',
      wotDepth: 2,
      domainTags: 'developer',
      tags: undefined,
    });
  });

  describe('Timeline pattern', () => {
    it('should parse timeline:endpoint:kind:tags', () => {
      const result = breakDownStreamId('timeline:bookmarks:all:tech,ai' as PostStreamId);
      expect(result).toEqual({
        sorting: 'timeline',
        invokeEndpoint: StreamSource.BOOKMARKS,
        kind: 'all',
        tags: 'tech,ai',
      });
    });

    it('should parse without tags', () => {
      const result = breakDownStreamId('timeline:following:short' as PostStreamId);
      expect(result).toEqual({
        sorting: 'timeline',
        invokeEndpoint: StreamSource.FOLLOWING,
        kind: 'short',
        tags: undefined,
      });
    });

    it('should parse wot source', () => {
      const result = breakDownStreamId('timeline:wot:all' as PostStreamId);
      expect(result).toEqual({
        sorting: 'timeline',
        invokeEndpoint: StreamSource.WOT,
        kind: 'all',
        tags: undefined,
      });
    });

    it('should parse wot_domain source with depth and domain tags', () => {
      const result = breakDownStreamId('timeline:wot_domain:2:image:🔥,bitcoiner' as PostStreamId);
      expect(result).toEqual({
        sorting: 'timeline',
        invokeEndpoint: StreamSource.WOT_DOMAIN,
        kind: 'image',
        wotDepth: 2,
        domainTags: '🔥,bitcoiner',
      });
    });

    it('should parse combined wot_domain profile and post tags independently', () => {
      expect(breakDownStreamId('timeline:wot_domain:2:all:developer,bitcoiner:second,first' as PostStreamId)).toEqual({
        sorting: 'timeline',
        invokeEndpoint: StreamSource.WOT_DOMAIN,
        kind: 'all',
        wotDepth: 2,
        domainTags: 'developer,bitcoiner',
        tags: 'second,first',
      });
    });

    it('should parse the depth-0 (Me/observer-only) wot_domain shape', () => {
      expect(breakDownStreamId('timeline:wot_domain:0:all:bitcoiner' as PostStreamId)).toEqual({
        sorting: 'timeline',
        invokeEndpoint: StreamSource.WOT_DOMAIN,
        kind: 'all',
        wotDepth: 0,
        domainTags: 'bitcoiner',
      });
    });

    it('should reject malformed wot_domain depth', () => {
      expect(() => breakDownStreamId('timeline:wot_domain:3:all:bitcoin' as PostStreamId)).toThrow(
        'Invalid wot_domain depth: 3',
      );
      expect(() => breakDownStreamId('timeline:wot_domain:x:all:bitcoin' as PostStreamId)).toThrow(
        'Invalid wot_domain depth: x',
      );
    });
  });

  describe('Replies pattern', () => {
    it('should parse post_replies:pubky:postId', () => {
      const result = breakDownStreamId('post_replies:pubky:post123' as PostStreamId);
      expect(result).toEqual({
        sorting: 'pubky',
        invokeEndpoint: StreamSource.REPLIES,
        kind: 'post123',
        tags: undefined,
      });
    });

    it('should parse with tags', () => {
      const result = breakDownStreamId('post_replies:pubky:post123:tag1,tag2' as PostStreamId);
      expect(result).toEqual({
        sorting: 'pubky',
        invokeEndpoint: StreamSource.REPLIES,
        kind: 'post123',
        tags: 'tag1,tag2',
      });
    });
  });

  describe('Author patterns', () => {
    it('should parse author:pubky', () => {
      const result = breakDownStreamId('author:pubky' as PostStreamId);
      expect(result).toEqual({
        sorting: 'pubky',
        invokeEndpoint: StreamSource.AUTHOR,
        tags: undefined,
      });
    });

    it('should parse author_replies:pubky', () => {
      const result = breakDownStreamId('author_replies:pubky' as PostStreamId);
      expect(result).toEqual({
        sorting: 'pubky',
        invokeEndpoint: StreamSource.AUTHOR_REPLIES,
        tags: undefined,
      });
    });

    it('should distinguish sorting-first custom Me from pubky-first legacy author streams', () => {
      expect(breakDownStreamId('timeline:author:viewer-pubky:all:bitcoin' as PostStreamId)).toEqual({
        sorting: 'timeline',
        invokeEndpoint: StreamSource.AUTHOR,
        authorId: 'viewer-pubky',
        kind: 'all',
        tags: 'bitcoin',
      });
      expect(breakDownStreamId('viewer-pubky:author:image:bitcoin' as PostStreamId)).toEqual({
        sorting: 'viewer-pubky',
        invokeEndpoint: StreamSource.AUTHOR,
        kind: 'image',
        tags: 'bitcoin',
      });
    });

    it('should parse sorting-first custom Me without post tags', () => {
      expect(breakDownStreamId('timeline:author:viewer-pubky:all' as PostStreamId)).toEqual({
        sorting: 'timeline',
        invokeEndpoint: StreamSource.AUTHOR,
        authorId: 'viewer-pubky',
        kind: 'all',
        tags: undefined,
      });
    });
  });

  describe('Collections patterns', () => {
    it('should parse <pubky>:author:collection (My Collections)', () => {
      const result = breakDownStreamId('pubky:author:collection' as PostStreamId);
      expect(result).toEqual({
        sorting: 'pubky',
        invokeEndpoint: StreamSource.AUTHOR,
        kind: 'collection',
        tags: undefined,
      });
    });

    it('should parse timeline:bookmarks:collection (Followed Collections)', () => {
      const result = breakDownStreamId('timeline:bookmarks:collection' as PostStreamId);
      expect(result).toEqual({
        sorting: 'timeline',
        invokeEndpoint: StreamSource.BOOKMARKS,
        kind: 'collection',
        tags: undefined,
      });
    });

    it('should parse total_engagement:all:collection (Discover Collections)', () => {
      const result = breakDownStreamId('total_engagement:all:collection' as PostStreamId);
      expect(result).toEqual({
        sorting: 'total_engagement',
        invokeEndpoint: StreamSource.ALL,
        kind: 'collection',
        tags: undefined,
      });
    });

    it('should parse collection:<pubky>:<postId> (single collection items, source-first composite)', () => {
      const result = breakDownStreamId('collection:pubky:post123' as PostStreamId);
      expect(result).toEqual({
        sorting: 'pubky',
        invokeEndpoint: StreamSource.COLLECTION,
        kind: 'post123',
        tags: undefined,
      });
    });

    it('should parse collection:<pubky>:<postId> with tags', () => {
      const result = breakDownStreamId('collection:pubky:post123:tag1,tag2' as PostStreamId);
      expect(result).toEqual({
        sorting: 'pubky',
        invokeEndpoint: StreamSource.COLLECTION,
        kind: 'post123',
        tags: 'tag1,tag2',
      });
    });
  });

  describe('Tag limiting', () => {
    it('should limit to 5 tags', () => {
      const result = breakDownStreamId('timeline:all:all:tag1,tag2,tag3,tag4,tag5,tag6,tag7' as PostStreamId);
      expect(result.tags).toBe('tag1,tag2,tag3,tag4,tag5');
    });

    it('should handle empty tags string', () => {
      const result = breakDownStreamId('timeline:all:all:' as PostStreamId);
      expect(result.tags).toBeUndefined();
    });

    it('should limit wot_domain tags independently from post tags', () => {
      const result = breakDownStreamId(
        'timeline:wot_domain:2:all:tag1,tag2,tag3,tag4,tag5,tag6,tag7:post1,post2,post3,post4,post5,post6' as PostStreamId,
      );
      expect(result.domainTags).toBe('tag1,tag2,tag3,tag4,tag5');
      expect(result.tags).toBe('post1,post2,post3,post4,post5');
    });
  });

  describe('Content search pattern', () => {
    it('should parse a well-formed id with an explicit kind', () => {
      const result = breakDownStreamId(buildContentSearchStreamId('bitcoin wallet', StreamKind.COLLECTION));
      expect(result).toEqual({
        sorting: 'content_search',
        invokeEndpoint: StreamSource.CONTENT_SEARCH,
        kind: 'collection',
        searchQuery: 'bitcoin wallet',
      });
    });

    it('should default to kind "all"', () => {
      const result = breakDownStreamId(buildContentSearchStreamId('bitcoin wallet'));
      expect(result.kind).toBe('all');
      expect(result.searchQuery).toBe('bitcoin wallet');
    });

    it('should decode queries containing colons and spaces', () => {
      const result = breakDownStreamId(buildContentSearchStreamId('note: bitcoin wallet'));
      expect(result.invokeEndpoint).toBe(StreamSource.CONTENT_SEARCH);
      expect(result.searchQuery).toBe('note: bitcoin wallet');
    });

    it('should route reserved-word queries to CONTENT_SEARCH, not the legacy classifiers', () => {
      const result = breakDownStreamId(buildContentSearchStreamId('bookmarks'));
      expect(result.invokeEndpoint).toBe(StreamSource.CONTENT_SEARCH);
      expect(result.invokeEndpoint).not.toBe(StreamSource.BOOKMARKS);
      expect(result.searchQuery).toBe('bookmarks');
    });

    it('should not throw for a malformed family id (missing q~ marker)', () => {
      const result = breakDownStreamId('content_search:not-marked:all' as PostStreamId);
      expect(result.sorting).toBe('content_search');
      expect(result.invokeEndpoint).toBe(StreamSource.CONTENT_SEARCH);
      expect(result.kind).toBeUndefined();
      expect(result.searchQuery).toBeUndefined();
    });

    it('should surface the author scope for author-scoped ids (profile "Filter posts")', () => {
      const authorPubky = 'profile-author-pubky' as Pubky;
      const result = breakDownStreamId(buildContentSearchStreamId('bitcoin wallet', 'all', authorPubky));
      expect(result.invokeEndpoint).toBe(StreamSource.CONTENT_SEARCH);
      expect(result.searchQuery).toBe('bitcoin wallet');
      expect(result.authorId).toBe(authorPubky);
    });
  });
});

describe('NexusPostStreamService', () => {
  const mockViewerId = 'viewer-pubky-id' as Pubky;
  const mockAuthorId = 'author-pubky-id' as Pubky;
  const mockPostId = 'post-pubky-id';

  // Mock the queryNexus function
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetch - Stream routing (Consolidated)', () => {
    test.each([
      {
        name: 'ALL',
        invokeEndpoint: StreamSource.ALL,
        params: { limit: 10, viewer_id: mockViewerId },
        extraParams: {},
        expectedInUrl: ['source=all', 'limit=10'],
      },
      {
        name: 'FOLLOWING',
        invokeEndpoint: StreamSource.FOLLOWING,
        params: { limit: 20, viewer_id: mockViewerId },
        extraParams: {},
        expectedInUrl: ['source=following', 'observer_id=viewer-pubky-id', 'limit=20'],
      },
      {
        name: 'FRIENDS',
        invokeEndpoint: StreamSource.FRIENDS,
        params: { limit: 15, viewer_id: mockViewerId, tags: 'tech,dev' },
        extraParams: {},
        expectedInUrl: ['source=friends', 'observer_id=viewer-pubky-id', 'tags=tech%2Cdev'],
      },
      {
        name: 'WOT',
        invokeEndpoint: StreamSource.WOT,
        params: { limit: 15, viewer_id: mockViewerId, depth: 2 },
        extraParams: {},
        expectedInUrl: ['source=wot', 'observer_id=viewer-pubky-id', 'depth=2'],
      },
      {
        name: 'BOOKMARKS',
        invokeEndpoint: StreamSource.BOOKMARKS,
        params: { limit: 25, viewer_id: mockViewerId, sorting: StreamSorting.TIMELINE },
        extraParams: {},
        expectedInUrl: ['source=bookmarks', 'observer_id=viewer-pubky-id', 'sorting=timeline'],
      },
      {
        name: 'REPLIES',
        invokeEndpoint: StreamSource.REPLIES,
        params: { limit: 30, viewer_id: mockViewerId },
        extraParams: { author_id: mockAuthorId, post_id: mockPostId },
        expectedInUrl: ['source=post_replies', 'author_id=author-pubky-id', 'post_id=post-pubky-id'],
      },
      {
        name: 'AUTHOR',
        invokeEndpoint: StreamSource.AUTHOR,
        params: { limit: 40, sorting: StreamSorting.ENGAGEMENT },
        extraParams: { author_id: mockAuthorId },
        expectedInUrl: ['source=author', 'author_id=author-pubky-id', 'sorting=total_engagement'],
      },
      {
        name: 'AUTHOR_REPLIES',
        invokeEndpoint: StreamSource.AUTHOR_REPLIES,
        params: { limit: 50, tags: 'coding' },
        extraParams: { author_id: mockAuthorId },
        expectedInUrl: ['source=author_replies', 'author_id=author-pubky-id', 'tags=coding'],
      },
      {
        name: 'COLLECTION',
        invokeEndpoint: StreamSource.COLLECTION,
        params: { limit: 20, viewer_id: mockViewerId },
        extraParams: { author_id: mockAuthorId, post_id: mockPostId },
        expectedInUrl: [
          'source=collection',
          'author_id=author-pubky-id',
          'post_id=post-pubky-id',
          `viewer_id=${mockViewerId}`,
        ],
      },
    ])('routes $name stream correctly', async ({ invokeEndpoint, params, extraParams, expectedInUrl }) => {
      const mockResponse: NexusPostsKeyStream = {
        post_keys: [],
        last_post_score: 0,
      };
      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockResponse);

      const fetchParams: TPostStreamFetchParams = {
        params,
        invokeEndpoint,
        extraParams,
      };

      await NexusPostStreamService.fetch(fetchParams);

      expect(queryNexusSpy).toHaveBeenCalledTimes(1);
      const calledArgs = queryNexusSpy.mock.calls[0][0] as { url: string };

      expectedInUrl.forEach((fragment) => {
        expect(calledArgs.url).toContain(fragment);
      });
    });
  });

  describe('fetch - Content search routing', () => {
    it('routes CONTENT_SEARCH to by_content and normalizes results into a key stream', async () => {
      const queryNexusSpy = mockQueryNexus.mockResolvedValue([
        { post_key: 'a:p2', score: 4.2 },
        { post_key: 'a:p1', score: 3.1 },
      ]);

      const result = await NexusPostStreamService.fetch({
        params: { kind: StreamKind.COLLECTION, skip: 10, limit: 2 },
        invokeEndpoint: StreamSource.CONTENT_SEARCH,
        extraParams: { q: 'bitcoin wallet' },
      });

      expect(queryNexusSpy).toHaveBeenCalledTimes(1);
      const calledArgs = queryNexusSpy.mock.calls[0][0] as { url: string };
      expect(calledArgs.url).toContain('search/posts/by_content');
      // URLSearchParams encodes the space as '+'.
      expect(calledArgs.url).toContain('q=bitcoin+wallet');
      expect(calledArgs.url).toContain('kind=collection');
      expect(calledArgs.url).toContain('skip=10');
      expect(calledArgs.url).toContain('limit=2');
      // Relevance order preserved; null score marks the chunk skip-paginated.
      expect(result).toEqual({ post_keys: ['a:p2', 'a:p1'], last_post_score: null });
    });

    it('omits kind from the URL when params.kind is undefined', async () => {
      const queryNexusSpy = mockQueryNexus.mockResolvedValue([]);

      await NexusPostStreamService.fetch({
        params: { skip: 0, limit: 2 },
        invokeEndpoint: StreamSource.CONTENT_SEARCH,
        extraParams: { q: 'bitcoin wallet' },
      });

      const calledArgs = queryNexusSpy.mock.calls[0][0] as { url: string };
      expect(calledArgs.url).not.toContain('kind=');
    });

    it('forwards the author scope into the by_content URL (profile "Filter posts")', async () => {
      const queryNexusSpy = mockQueryNexus.mockResolvedValue([]);

      await NexusPostStreamService.fetch({
        params: { skip: 0, limit: 2 },
        invokeEndpoint: StreamSource.CONTENT_SEARCH,
        extraParams: { q: 'bitcoin wallet', author_id: mockAuthorId },
      });

      const calledArgs = queryNexusSpy.mock.calls[0][0] as { url: string };
      expect(calledArgs.url).toContain(`author=${mockAuthorId}`);
    });

    it('omits author from the URL for the global (unscoped) search', async () => {
      const queryNexusSpy = mockQueryNexus.mockResolvedValue([]);

      await NexusPostStreamService.fetch({
        params: { skip: 0, limit: 2 },
        invokeEndpoint: StreamSource.CONTENT_SEARCH,
        extraParams: { q: 'bitcoin wallet' },
      });

      const calledArgs = queryNexusSpy.mock.calls[0][0] as { url: string };
      expect(calledArgs.url).not.toContain('author=');
    });
  });

  describe('fetch - Required parameter validation (Comprehensive)', () => {
    test.each([
      {
        name: 'FOLLOWING requires viewer_id',
        invokeEndpoint: StreamSource.FOLLOWING,
        params: { limit: 10 }, // Missing viewer_id
        extraParams: {},
        expectedError: 'Viewer ID is required',
      },
      {
        name: 'FRIENDS requires viewer_id',
        invokeEndpoint: StreamSource.FRIENDS,
        params: { limit: 10 }, // Missing viewer_id
        extraParams: {},
        expectedError: 'Viewer ID is required',
      },
      {
        name: 'BOOKMARKS requires viewer_id',
        invokeEndpoint: StreamSource.BOOKMARKS,
        params: { limit: 10 }, // Missing viewer_id
        extraParams: {},
        expectedError: 'Viewer ID is required',
      },
      {
        name: 'WOT requires viewer_id',
        invokeEndpoint: StreamSource.WOT,
        params: { limit: 10 }, // Missing viewer_id
        extraParams: {},
        expectedError: 'Viewer ID is required',
      },
      {
        name: 'WOT_DOMAIN requires viewer_id',
        invokeEndpoint: StreamSource.WOT_DOMAIN,
        params: { limit: 10 }, // Missing viewer_id
        extraParams: {},
        expectedError: 'Viewer ID is required',
      },
      {
        name: 'CONTENT_SEARCH requires a search query',
        invokeEndpoint: StreamSource.CONTENT_SEARCH,
        params: { limit: 10 },
        extraParams: {}, // Missing q
        expectedError: 'Search query is required for content_search stream',
      },
    ])('$name', async ({ invokeEndpoint, params, extraParams, expectedError }) => {
      const fetchParams: TPostStreamFetchParams = {
        params,
        invokeEndpoint,
        extraParams,
      };

      await expect(NexusPostStreamService.fetch(fetchParams)).rejects.toThrow(expectedError);
    });

    it('throws an AppError validation error when CONTENT_SEARCH is missing a query', async () => {
      const fetchParams: TPostStreamFetchParams = {
        params: { limit: 10 },
        invokeEndpoint: StreamSource.CONTENT_SEARCH,
        extraParams: {}, // Missing q
      };

      await expect(NexusPostStreamService.fetch(fetchParams)).rejects.toBeInstanceOf(AppError);
    });

    it('should throw error for invalid stream type', async () => {
      const params = {
        params: { limit: 10 },
        invokeEndpoint: 'invalid_stream_type' as StreamSource,
        extraParams: {},
      };

      await expect(NexusPostStreamService.fetch(params as TPostStreamFetchParams)).rejects.toThrow(
        'Invalid stream type',
      );
    });
  });

  describe('fetch - Return values', () => {
    it('should return the response from queryNexus', async () => {
      const mockResponse: NexusPostsKeyStream = {
        post_keys: ['author1:post1', 'author1:post2', 'author2:post3'],
        last_post_score: 123456,
      };

      mockQueryNexus.mockResolvedValue(mockResponse);

      const params: TPostStreamFetchParams = {
        params: { limit: 10, viewer_id: mockViewerId },
        invokeEndpoint: StreamSource.ALL,
        extraParams: {},
      };

      const result = await NexusPostStreamService.fetch(params);

      expect(result).toEqual(mockResponse);
      expect(result.post_keys).toHaveLength(3);
      expect(result.last_post_score).toBe(123456);
    });
  });

  describe('fetchByIds', () => {
    it('should fetch posts by IDs with viewer_id', async () => {
      // Arrange
      const mockPostIds = ['author1:post1', 'author1:post2', 'author2:post3'];
      const mockPosts: NexusPost[] = [
        { details: { id: 'post1', author: 'author1' } } as NexusPost,
        { details: { id: 'post2', author: 'author1' } } as NexusPost,
        { details: { id: 'post3', author: 'author2' } } as NexusPost,
      ];
      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockPosts);

      // Act
      const result = await NexusPostStreamService.fetchByIds({
        post_ids: mockPostIds,
        viewer_id: mockViewerId,
      });

      // Assert
      expect(queryNexusSpy).toHaveBeenCalledTimes(1);
      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('/stream/posts/by_ids'),
        method: 'POST',
        body: JSON.stringify({ post_ids: mockPostIds, include_attachment_metadata: true, viewer_id: mockViewerId }),
      });
      expect(result).toEqual(mockPosts);
    });

    it('should fetch posts by IDs without viewer_id', async () => {
      // Arrange
      const mockPostIds = ['author1:post1'];
      const mockPosts: NexusPost[] = [{ details: { id: 'post1', author: 'author1' } } as NexusPost];
      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockPosts);

      // Act
      const result = await NexusPostStreamService.fetchByIds({ post_ids: mockPostIds });

      // Assert
      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('/stream/posts/by_ids'),
        method: 'POST',
        body: JSON.stringify({ post_ids: mockPostIds, include_attachment_metadata: true }),
      });
      expect(result).toEqual(mockPosts);
    });

    it('should return empty array when fetching empty post IDs', async () => {
      // Arrange
      const queryNexusSpy = mockQueryNexus.mockResolvedValue([]);

      // Act
      const result = await NexusPostStreamService.fetchByIds({ post_ids: [] });

      // Assert
      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('/stream/posts/by_ids'),
        method: 'POST',
        body: JSON.stringify({ post_ids: [], include_attachment_metadata: true }),
      });
      expect(result).toEqual([]);
    });
  });
});
