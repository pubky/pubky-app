import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory } from '@/libs/error/error.types';
import { NexusBootstrapService } from '@/services/nexus/bootstrap/bootstrap';
import { bootstrapApi } from '@/services/nexus/bootstrap/bootstrap.api';

describe('NexusBootstrapService', () => {
  const mockFetch = vi.fn();
  const pubky = 'test-user-123';

  const generateMockResponse = (testUserId: string, testPostId: string) => ({
    users: [
      {
        details: {
          name: 'Bootstrap User',
          bio: 'Bootstrap bio',
          id: testUserId,
          links: null,
          status: null,
          image: null,
          indexed_at: Date.now(),
        },
        counts: {
          tagged: 2,
          tags: 2,
          unique_tags: 2,
          posts: 1,
          replies: 0,
          collections: 0,
          following: 0,
          followers: 0,
          friends: 0,
          bookmarks: 0,
        },
        tags: [
          {
            label: 'developer',
            taggers: ['tagger-user-1', 'tagger-user-2'],
            taggers_count: 2,
            relationship: false,
          },
          {
            label: 'p2p',
            taggers: ['tagger-user-3'],
            taggers_count: 1,
            relationship: false,
          },
        ],
        relationship: {
          following: false,
          followed_by: false,
        },
      },
    ],
    posts: [
      {
        details: {
          id: testPostId,
          content: 'Bootstrap post content',
          kind: 'short',
          uri: `https://pubky.app/${testUserId}/pub/pubky.app/posts/${testPostId}`,
          author: testUserId,
          indexed_at: Date.now(),
          attachments: null,
        },
        counts: {
          replies: 0,
          tags: 2,
          unique_tags: 2,
          reposts: 0,
        },
        author: {
          details: {
            name: 'Bootstrap User',
            bio: 'Bootstrap bio',
            id: testUserId,
            links: null,
            status: null,
            image: null,
            indexed_at: Date.now(),
          },
          counts: {
            tagged: 2,
            tags: 2,
            unique_tags: 2,
            posts: 1,
            replies: 0,
            following: 0,
            followers: 0,
            friends: 0,
            bookmarks: 0,
          },
          tags: [
            {
              label: 'developer',
              taggers: ['tagger-user-1', 'tagger-user-2'],
              taggers_count: 2,
              relationship: false,
            },
            {
              label: 'p2p',
              taggers: ['tagger-user-3'],
              taggers_count: 1,
              relationship: false,
            },
          ],
          relationship: {
            following: false,
            followed_by: false,
          },
        },
        tags: [
          {
            label: 'tech',
            taggers: ['post-tagger-1'],
            taggers_count: 1,
            relationship: false,
          },
          {
            label: 'announcement',
            taggers: ['post-tagger-2', 'post-tagger-3'],
            taggers_count: 2,
            relationship: false,
          },
        ],
        relationships: {
          replied: null,
          reposted: null,
          mentioned: [],
        },
        bookmark: null,
      },
    ],
    list: {
      stream: [testPostId, 'random-post-id'],
      influencers: ['influencer-user-1', 'influencer-user-2'],
      recommended: ['recommended-user-1', 'recommended-user-2', 'recommended-user-3'],
      hot_tags: [],
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    // Clear query client cache between tests
    const { nexusQueryClient } = await import('../nexus.query-client');
    nexusQueryClient.clear();
  });

  describe('read', () => {
    it('should fetch and return bootstrap data successfully', async () => {
      const mockResponse = generateMockResponse(pubky, '');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
        headers: {
          get: vi.fn(),
        },
      });

      const result = await NexusBootstrapService.fetch(pubky);

      expect(mockFetch).toHaveBeenCalledWith(bootstrapApi.get(pubky), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors from queryNexus', async () => {
      // Use a different pubky to avoid cache collision
      const errorPubky = 'error-user-456';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: {
          get: vi.fn(),
        },
        text: vi.fn().mockResolvedValue(''),
      });

      await expect(NexusBootstrapService.fetch(errorPubky)).rejects.toMatchObject({
        category: ErrorCategory.Client,
        code: ClientErrorCode.BAD_REQUEST,
      });
    });

    it('should throw INTERNAL_ERROR when response is empty', async () => {
      // Use a different pubky to avoid cache collision
      const emptyPubky = 'empty-user-789';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
        headers: {
          get: vi.fn(),
        },
      });

      await expect(NexusBootstrapService.fetch(emptyPubky)).rejects.toMatchObject({
        category: ErrorCategory.Server,
        code: ServerErrorCode.INVALID_RESPONSE,
      });
    });
  });
});
