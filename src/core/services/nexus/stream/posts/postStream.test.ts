import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import { type NexusPost, type NexusPostsKeyStream, StreamSorting } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import {
  StreamSource,
  type TPostStreamFetchParams,
  type TStreamAllParams,
  type TStreamAuthorParams,
  type TStreamAuthorRepliesParams,
  type TStreamPostRepliesParams,
  type TStreamPostsByIdsParams,
  type TStreamQueryParams,
  type TStreamWithObserverParams,
} from '@/services/nexus/stream/posts/postStream.types';
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
    case 'bookmarks':
      return postStreamApi.bookmarks(params as TStreamWithObserverParams);
    case 'post_replies':
      return postStreamApi.post_replies(params as TStreamPostRepliesParams);
    case 'author':
      return postStreamApi.author(params as TStreamAuthorParams);
    case 'author_replies':
      return postStreamApi.author_replies(params as TStreamAuthorRepliesParams);
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
      { streamType: PostStreamTypes.TIMELINE_BOOKMARKS_SHORT, kind: StreamKind.SHORT, name: 'short' },
      { streamType: PostStreamTypes.TIMELINE_BOOKMARKS_LONG, kind: StreamKind.LONG, name: 'long' },
      { streamType: PostStreamTypes.TIMELINE_BOOKMARKS_IMAGE, kind: StreamKind.IMAGE, name: 'image' },
      { streamType: PostStreamTypes.TIMELINE_BOOKMARKS_VIDEO, kind: StreamKind.VIDEO, name: 'video' },
      { streamType: PostStreamTypes.TIMELINE_BOOKMARKS_LINK, kind: StreamKind.LINK, name: 'link' },
      { streamType: PostStreamTypes.TIMELINE_BOOKMARKS_FILE, kind: StreamKind.FILE, name: 'file' },
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

    it('should limit tags to maximum 5 (NEXT_MAX_STREAM_TAGS)', () => {
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
});

describe('breakDownStreamId', () => {
  describe('Timeline pattern', () => {
    it('should parse timeline:endpoint:kind:tags', () => {
      const result = breakDownStreamId('timeline:bookmarks:all:tech,ai' as PostStreamId);
      expect(result).toEqual(['timeline', StreamSource.BOOKMARKS, 'all', 'tech,ai']);
    });

    it('should parse without tags', () => {
      const result = breakDownStreamId('timeline:following:short' as PostStreamId);
      expect(result).toEqual(['timeline', StreamSource.FOLLOWING, 'short', undefined]);
    });
  });

  describe('Replies pattern', () => {
    it('should parse post_replies:pubky:postId', () => {
      const result = breakDownStreamId('post_replies:pubky:post123' as PostStreamId);
      expect(result).toEqual(['pubky', StreamSource.REPLIES, 'post123', undefined]);
    });

    it('should parse with tags', () => {
      const result = breakDownStreamId('post_replies:pubky:post123:tag1,tag2' as PostStreamId);
      expect(result).toEqual(['pubky', StreamSource.REPLIES, 'post123', 'tag1,tag2']);
    });
  });

  describe('Author patterns', () => {
    it('should parse author:pubky', () => {
      const result = breakDownStreamId('author:pubky' as PostStreamId);
      expect(result).toEqual(['pubky', StreamSource.AUTHOR, undefined, undefined]);
    });

    it('should parse author_replies:pubky', () => {
      const result = breakDownStreamId('author_replies:pubky' as PostStreamId);
      expect(result).toEqual(['pubky', StreamSource.AUTHOR_REPLIES, undefined, undefined]);
    });
  });

  describe('Tag limiting', () => {
    it('should limit to 5 tags', () => {
      const result = breakDownStreamId('timeline:all:all:tag1,tag2,tag3,tag4,tag5,tag6,tag7' as PostStreamId);
      expect(result[3]).toBe('tag1,tag2,tag3,tag4,tag5');
    });

    it('should handle empty tags string', () => {
      const result = breakDownStreamId('timeline:all:all:' as PostStreamId);
      expect(result[3]).toBeUndefined();
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
    ])('$name', async ({ invokeEndpoint, params, extraParams, expectedError }) => {
      const fetchParams: TPostStreamFetchParams = {
        params,
        invokeEndpoint,
        extraParams,
      };

      await expect(NexusPostStreamService.fetch(fetchParams)).rejects.toThrow(expectedError);
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
