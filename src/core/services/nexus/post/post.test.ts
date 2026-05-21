import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEXUS_URL } from '@/config/nexus';
import type { Pubky } from '@/models/models.types';
import type { NexusTag, NexusTaggers } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { NexusPostService } from '@/services/nexus/post/post';
import { postApi } from './post.api';
import { type TPostBase, type TPostTaggersParams, type TPostTagsParams, type TPostViewParams } from './post.types';

vi.mock('@/services/nexus/nexus.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/nexus/nexus.utils')>();
  return {
    ...actual,
    queryNexus: vi.fn(),
  };
});

const mockQueryNexus = vi.mocked(queryNexus);

const pubky = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';
const postId = 'test-post-123';

describe('Post API', () => {
  describe('postApi.view', () => {
    it('should generate correct view URL with basic parameters', () => {
      const params: TPostViewParams = {
        author_id: pubky,
        post_id: postId,
      };

      const result = postApi.view(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}`);
    });

    it('should generate correct view URL with viewer_id', () => {
      const params: TPostViewParams = {
        author_id: pubky,
        post_id: postId,
        viewer_id: `${pubky}-viewer`,
      };

      const result = postApi.view(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}?viewer_id=${pubky}-viewer`);
    });

    it('should generate correct view URL with tag pagination parameters', () => {
      const params: TPostViewParams = {
        author_id: pubky,
        post_id: postId,
        limit_tags: 10,
        limit_taggers: 5,
      };

      const result = postApi.view(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}?limit_tags=10&limit_taggers=5`);
    });
  });

  describe('postApi.bookmarks', () => {
    it('should generate correct bookmarks URL with basic parameters', () => {
      const params: TPostBase = {
        author_id: pubky,
        post_id: postId,
      };

      const result = postApi.bookmarks(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}/bookmarks`);
    });

    it('should generate correct bookmarks URL with viewer_id', () => {
      const params: TPostBase = {
        author_id: pubky,
        post_id: postId,
        viewer_id: `${pubky}-viewer`,
      };

      const result = postApi.bookmarks(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}/bookmarks?viewer_id=${pubky}-viewer`);
    });
  });

  describe('postApi.counts', () => {
    it('should generate correct counts URL', () => {
      const params: TPostBase = {
        author_id: pubky,
        post_id: postId,
      };

      const result = postApi.counts(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}/counts`);
    });
  });

  describe('postApi.details', () => {
    it('should generate correct details URL', () => {
      const params: TPostBase = {
        author_id: pubky,
        post_id: postId,
      };

      const result = postApi.details(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}/details`);
    });
  });

  describe('postApi.taggers', () => {
    it('should generate correct taggers URL with basic parameters', () => {
      const params: TPostTaggersParams = {
        author_id: pubky,
        post_id: postId,
        label: 'test-label',
      };

      const result = postApi.taggers(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}/taggers/test-label`);
    });

    it('should generate correct taggers URL with pagination parameters', () => {
      const params: TPostTaggersParams = {
        author_id: pubky,
        post_id: postId,
        label: 'test-label',
        skip: 10,
        limit: 20,
      };

      const result = postApi.taggers(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}/taggers/test-label?skip=10&limit=20`);
    });

    it('should generate correct taggers URL with viewer_id', () => {
      const params: TPostTaggersParams = {
        author_id: pubky,
        post_id: postId,
        label: 'test-label',
        viewer_id: `${pubky}-viewer`,
      };

      const result = postApi.taggers(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}/taggers/test-label?viewer_id=${pubky}-viewer`);
    });
  });

  describe('postApi.tags', () => {
    it('should generate correct tags URL with basic parameters', () => {
      const params: TPostTagsParams = {
        author_id: pubky,
        post_id: postId,
      };

      const result = postApi.tags(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}/tags`);
    });

    it('should generate correct tags URL with tag pagination parameters', () => {
      const params: TPostTagsParams = {
        author_id: pubky,
        post_id: postId,
        limit_tags: 15,
        limit_taggers: 8,
        skip_tags: 5,
      };

      const result = postApi.tags(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}/tags?limit_tags=15&limit_taggers=8&skip_tags=5`);
    });

    it('should generate correct tags URL with viewer_id', () => {
      const params: TPostTagsParams = {
        author_id: pubky,
        post_id: postId,
        viewer_id: `${pubky}-viewer`,
      };

      const result = postApi.tags(params);
      expect(result).toBe(`${NEXUS_URL}/v0/post/${pubky}/${postId}/tags?viewer_id=${pubky}-viewer`);
    });
  });

  describe('Path segment encoding for special characters', () => {
    describe('postApi.view', () => {
      it('should encode spaces in author_id', () => {
        const result = postApi.view({ author_id: 'author id', post_id: postId });
        expect(result).toContain('/post/author%20id/');
        expect(result).not.toContain('/post/author id/');
      });

      it('should encode hash (#) in post_id', () => {
        const result = postApi.view({ author_id: pubky, post_id: 'post#123' });
        expect(result).toContain('/post/' + pubky + '/post%23123');
      });

      it('should encode forward slash (/) in post_id', () => {
        const result = postApi.view({ author_id: pubky, post_id: 'post/123' });
        expect(result).toContain('/post/' + pubky + '/post%2F123');
        expect(result).not.toContain('/post/' + pubky + '/post/123');
      });

      it('should encode percent (%) in post_id', () => {
        const result = postApi.view({ author_id: pubky, post_id: '100%complete' });
        expect(result).toContain('/post/' + pubky + '/100%25complete');
      });
    });

    describe('postApi.taggers', () => {
      it('should encode spaces in label', () => {
        const result = postApi.taggers({ author_id: pubky, post_id: postId, label: 'my label' });
        expect(result).toContain('/taggers/my%20label');
        expect(result).not.toContain('/taggers/my label');
      });

      it('should encode hash (#) in label', () => {
        const result = postApi.taggers({ author_id: pubky, post_id: postId, label: 'label#123' });
        expect(result).toContain('/taggers/label%23123');
      });

      it('should encode forward slash (/) in label', () => {
        const result = postApi.taggers({ author_id: pubky, post_id: postId, label: 'label/sub' });
        expect(result).toContain('/taggers/label%2Fsub');
      });

      it('should encode multiple special characters', () => {
        const result = postApi.view({ author_id: 'author/id', post_id: 'post#id' });
        expect(result).toContain('/post/author%2Fid/post%23id');
      });
    });
  });

  describe('PostApiEndpoint type', () => {
    it('should have exactly 6 endpoints', () => {
      const endpointKeys = Object.keys(postApi);
      expect(endpointKeys).toHaveLength(6);
      expect(endpointKeys).toContain('view');
      expect(endpointKeys).toContain('bookmarks');
      expect(endpointKeys).toContain('counts');
      expect(endpointKeys).toContain('details');
      expect(endpointKeys).toContain('taggers');
      expect(endpointKeys).toContain('tags');
    });
  });
});

describe('NexusPostService', () => {
  const testViewerId = 'viewer123' as Pubky;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPostTags', () => {
    it('constructs the post-tags URL and returns queryNexus response', async () => {
      const mockTags: NexusTag[] = [
        { label: 'bitcoin', taggers: ['user1' as Pubky], taggers_count: 1, relationship: false },
      ];
      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockTags);

      const result = await NexusPostService.getPostTags({
        compositeId: `${pubky}:${postId}`,
        skip: 5,
        limit: 3,
        viewerId: testViewerId,
      });

      expect(result).toEqual(mockTags);
      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: `${NEXUS_URL}/v0/post/${pubky}/${postId}/tags?skip_tags=5&limit_tags=3&viewer_id=${testViewerId}`,
      });
    });

    it('propagates queryNexus errors so Nexus retry behavior remains intact', async () => {
      const error = new Error('nexus-fail');
      mockQueryNexus.mockRejectedValue(error);

      await expect(
        NexusPostService.getPostTags({
          compositeId: `${pubky}:${postId}`,
          skip: 0,
          limit: 3,
          viewerId: testViewerId,
        }),
      ).rejects.toThrow(error);
    });
  });

  describe('getPostTaggers', () => {
    it('should construct correct URL and return queryNexus response', async () => {
      const mockTaggers: NexusTaggers = { relationship: false, users: ['user1' as Pubky] };
      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockTaggers);

      const result = await NexusPostService.getPostTaggers({
        compositeId: `${pubky}:${postId}`,
        label: 'rust & wasm',
        skip: 10,
        limit: 5,
        viewerId: testViewerId,
      });

      expect(result).toEqual(mockTaggers);
      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: `${NEXUS_URL}/v0/post/${pubky}/${postId}/taggers/rust%20%26%20wasm?skip=10&limit=5&viewer_id=${testViewerId}`,
      });
    });
  });
});
