import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import { HttpMethod } from '@/libs';

// Mock HomeserverService
vi.mock('@/core/services/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
  },
}));

// Mock FileApplication
vi.mock('@/core/application/file', () => ({
  FileApplication: {
    upload: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock TagApplication
vi.mock('@/core/application/tag', () => ({
  TagApplication: {
    create: vi.fn(),
  },
}));

// Mock pubky-app-specs
vi.mock('pubky-app-specs', () => ({
  PubkySpecsBuilder: class {
    createPost(content: string, kind: number) {
      return {
        post: {
          content,
          kind: kind === 0 ? 'short' : kind === 1 ? 'long' : 'short',
          attachments: null,
          toJson: () => ({ content, kind }),
        },
        meta: {
          id: 'post123',
          url: `pubky://author/pub/pubky.app/posts/post123`,
        },
      };
    }
  },
  PubkyAppPostKind: {
    Short: 0,
    Long: 1,
  },
  PubkyAppPostEmbed: class {
    constructor(
      public uri: string,
      public content: string,
    ) {}
  },
  postUriBuilder: (authorId: string, postId: string) => `pubky://${authorId}/pub/pubky.app/posts/${postId}`,
}));

// Test data
const testData = {
  authorPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Core.Pubky,
  postId: 'abc123xyz',
  get fullPostId() {
    return Core.buildCompositeId({ pubky: this.authorPubky, id: this.postId });
  },
};

// Helper functions
const createPostParams = (content: string, parentPostId?: string): Core.TCreatePostParams => ({
  content,
  authorId: testData.authorPubky,
  parentPostId,
});

const setupExistingPost = async () => {
  const postDetails: Core.PostDetailsModelSchema = {
    id: testData.fullPostId,
    content: 'Test post content',
    indexed_at: Date.now(),
    kind: 'short', // PubkyAppPostKind.Short
    uri: `pubky://${testData.authorPubky}/pub/pubky.app/posts/${testData.postId}`,
    attachments: null,
  };

  await Core.PostDetailsModel.table.add(postDetails);
  await Core.PostCountsModel.table.add({
    id: testData.fullPostId,
    tags: 0,
    unique_tags: 0,
    replies: 0,
    reposts: 0,
  });
  await Core.PostRelationshipsModel.table.add({
    id: testData.fullPostId,
    replied: null,
    reposted: null,
    mentioned: [],
  });
};

const setupAuthUser = (pubky: Core.Pubky) => {
  const authStore = Core.useAuthStore.getState();
  authStore.init({
    currentUserPubky: pubky,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session: {} as any,
    hasProfile: false,
  });
};

const cleanupAuthUser = () => {
  Core.useAuthStore.getState().reset();
};

describe('PostController', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock HomeserverService.request to resolve successfully
    vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined);

    // Initialize database and clear tables
    await Core.db.initialize();
    await Core.db.transaction(
      'rw',
      [
        Core.PostDetailsModel.table,
        Core.PostCountsModel.table,
        Core.PostRelationshipsModel.table,
        Core.PostTagsModel.table,
      ],
      async () => {
        await Core.PostDetailsModel.table.clear();
        await Core.PostCountsModel.table.clear();
        await Core.PostRelationshipsModel.table.clear();
        await Core.PostTagsModel.table.clear();
      },
    );
  });

  describe('getDetails', () => {
    it('should return post details when post exists', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      const result = await PostController.getDetails({ compositeId: testData.fullPostId });

      expect(result).toBeDefined();
      expect(result?.id).toBe(testData.fullPostId);
      expect(result?.content).toBe('Test post content');
      expect(result?.kind).toBe('short');
      expect(result?.uri).toBe(`pubky://${testData.authorPubky}/pub/pubky.app/posts/${testData.postId}`);
    });

    it('should return null when post not found', async () => {
      const { PostController } = await import('./post');

      const result = await PostController.getDetails({ compositeId: 'nonexistent:post' });

      expect(result).toBeNull();
    });
  });

  describe('getCounts', () => {
    it('should return post counts when they exist', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      const result = await PostController.getCounts({ compositeId: testData.fullPostId });

      expect(result).toBeDefined();
      expect(result.id).toBe(testData.fullPostId);
      expect(result.tags).toBe(0);
      expect(result.unique_tags).toBe(0);
      expect(result.replies).toBe(0);
      expect(result.reposts).toBe(0);
    });

    it('should return default counts when post not found', async () => {
      const { PostController } = await import('./post');

      const result = await PostController.getCounts({ compositeId: 'nonexistent:post' });

      expect(result).toBeDefined();
      expect(result.id).toBe('nonexistent:post');
      expect(result.tags).toBe(0);
      expect(result.unique_tags).toBe(0);
      expect(result.replies).toBe(0);
      expect(result.reposts).toBe(0);
    });

    it('should include all count fields in response', async () => {
      await setupExistingPost();

      // Update counts to non-zero values
      await Core.PostCountsModel.table.update(testData.fullPostId, {
        tags: 5,
        unique_tags: 3,
        replies: 10,
        reposts: 2,
      });

      const { PostController } = await import('./post');
      const result = await PostController.getCounts({ compositeId: testData.fullPostId });

      expect(result.tags).toBe(5);
      expect(result.unique_tags).toBe(3);
      expect(result.replies).toBe(10);
      expect(result.reposts).toBe(2);
    });
  });

  describe('getReplies', () => {
    it('should return replies for a post when relationships store parent as URI', async () => {
      const { PostController } = await import('./post');

      const parentUri = `pubky://${testData.authorPubky}/pub/pubky.app/posts/${testData.postId}`;
      const replyOneId = Core.buildCompositeId({ pubky: 'reply-author-1' as Core.Pubky, id: 'reply-1' });
      const replyTwoId = Core.buildCompositeId({ pubky: 'reply-author-2' as Core.Pubky, id: 'reply-2' });

      await Core.PostRelationshipsModel.table.bulkAdd([
        { id: replyOneId, replied: parentUri, reposted: null, mentioned: [] },
        { id: replyTwoId, replied: parentUri, reposted: null, mentioned: [] },
        {
          id: Core.buildCompositeId({ pubky: 'reply-author-3' as Core.Pubky, id: 'reply-3' }),
          replied: 'pubky://someone/pub/pubky.app/posts/another-parent',
          reposted: null,
          mentioned: [],
        },
      ]);

      const replies = await PostController.getReplies({ compositeId: testData.fullPostId });

      expect(replies).toHaveLength(2);
      expect(replies.map((reply) => reply.id)).toEqual(expect.arrayContaining([replyOneId, replyTwoId]));
      expect(replies.every((reply) => reply.replied === parentUri)).toBe(true);
    });

    it('should return empty array when a post has no replies', async () => {
      const { PostController } = await import('./post');

      const replies = await PostController.getReplies({ compositeId: testData.fullPostId });

      expect(replies).toEqual([]);
    });
  });

  describe('commitCreate', () => {
    it('should create a post and sync to homeserver', async () => {
      const { PostController } = await import('./post');

      await PostController.commitCreate(createPostParams('Hello, world!'));

      const allPosts = await Core.PostDetailsModel.table.toArray();
      expect(allPosts.length).toBeGreaterThan(0);

      const savedPost = allPosts[0];
      expect(savedPost.content).toBe('Hello, world!');
      expect(savedPost.kind).toBe('short'); // PubkyAppPostKind.Short

      // Verify homeserver sync was called
      expect(Core.HomeserverService.request).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: expect.stringContaining('pubky://'),
        bodyJson: expect.any(Object),
      });
    });

    it('should create a reply when parentPostId is provided', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      await PostController.commitCreate(createPostParams('This is a reply', testData.fullPostId));

      const allPosts = await Core.PostDetailsModel.table.toArray();
      const replyPost = allPosts.find((p) => p.content === 'This is a reply');

      expect(replyPost).toBeTruthy();
      expect(replyPost!.kind).toBe('short'); // PubkyAppPostKind.Short

      // Verify homeserver sync was called
      expect(Core.HomeserverService.request).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: expect.stringContaining('pubky://'),
        bodyJson: expect.any(Object),
      });
    });

    it('should throw error when parent post not found', async () => {
      const { PostController } = await import('./post');

      await expect(PostController.commitCreate(createPostParams('Reply', 'nonexistent:post'))).rejects.toThrow(
        'Parent post not found',
      );
    });

    it('should propagate errors from application layer', async () => {
      const { PostController } = await import('./post');
      const ApplicationModule = await import('@/core/application');

      const createSpy = vi
        .spyOn(ApplicationModule.PostApplication, 'commitCreate')
        .mockRejectedValueOnce(new Error('Database transaction failed'));

      try {
        await expect(PostController.commitCreate(createPostParams('Will fail'))).rejects.toThrow(
          'Database transaction failed',
        );
      } finally {
        createSpy.mockRestore();
      }
    });

    it('should create a repost when originalPostId is provided', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      await PostController.commitCreate({
        content: 'Reposting this!',
        authorId: testData.authorPubky,
        originalPostId: testData.fullPostId,
      });

      const allPosts = await Core.PostDetailsModel.table.toArray();
      const repost = allPosts.find((p) => p.content === 'Reposting this!');

      expect(repost).toBeTruthy();
      expect(repost!.kind).toBe('short');

      // Verify homeserver sync was called
      expect(Core.HomeserverService.request).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: expect.stringContaining('pubky://'),
        bodyJson: expect.any(Object),
      });
    });

    it('should throw error when original post not found for repost', async () => {
      const { PostController } = await import('./post');

      await expect(
        PostController.commitCreate({
          content: 'Reposting this!',
          authorId: testData.authorPubky,
          originalPostId: 'nonexistent:post',
        }),
      ).rejects.toThrow('Original post not found');
    });

    it('should create repost with empty content', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      await PostController.commitCreate({
        content: '',
        authorId: testData.authorPubky,
        originalPostId: testData.fullPostId,
      });

      const allPosts = await Core.PostDetailsModel.table.toArray();
      const repost = allPosts.find((p) => p.content === '');

      expect(repost).toBeTruthy();

      // Verify homeserver sync was called
      expect(Core.HomeserverService.request).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: expect.stringContaining('pubky://'),
        bodyJson: expect.any(Object),
      });
    });
  });

  describe('commitDelete', () => {
    it('should call application layer when user is author', async () => {
      await setupExistingPost();
      setupAuthUser(testData.authorPubky);

      const { PostController } = await import('./post');
      const ApplicationModule = await import('@/core/application');

      const deleteSpy = vi.spyOn(ApplicationModule.PostApplication, 'commitDelete').mockResolvedValue(undefined);

      try {
        await PostController.commitDelete({ compositePostId: testData.fullPostId });

        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: testData.fullPostId });
      } finally {
        deleteSpy.mockRestore();
        cleanupAuthUser();
      }
    });

    it('should throw error when user is not the author', async () => {
      await setupExistingPost();
      setupAuthUser('different_user_pubky' as Core.Pubky);

      const { PostController } = await import('./post');

      try {
        await expect(PostController.commitDelete({ compositePostId: testData.fullPostId })).rejects.toThrow(
          'User is not the author of this post',
        );
      } finally {
        cleanupAuthUser();
      }
    });

    it('should propagate errors from application layer', async () => {
      await setupExistingPost();
      setupAuthUser(testData.authorPubky);

      const { PostController } = await import('./post');
      const ApplicationModule = await import('@/core/application');

      const deleteSpy = vi
        .spyOn(ApplicationModule.PostApplication, 'commitDelete')
        .mockRejectedValueOnce(new Error('Database transaction failed'));

      try {
        await expect(PostController.commitDelete({ compositePostId: testData.fullPostId })).rejects.toThrow(
          'Database transaction failed',
        );
      } finally {
        deleteSpy.mockRestore();
        cleanupAuthUser();
      }
    });
  });

  describe('getOrFetchDetails', () => {
    const mockViewerId = 'test-viewer-id' as Core.Pubky;

    it('should return post from local database if exists', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      const post = await PostController.getOrFetchDetails({ compositeId: testData.fullPostId, viewerId: mockViewerId });

      expect(post).toBeTruthy();
      expect(post?.id).toBe(testData.fullPostId);
      expect(post?.content).toBe('Test post content');
    });

    it('should return null when PostApplication.getOrFetchDetails returns null', async () => {
      const { PostController } = await import('./post');
      const ApplicationModule = await import('@/core/application');

      const getOrFetchSpy = vi.spyOn(ApplicationModule.PostApplication, 'getOrFetchDetails').mockResolvedValue(null);

      try {
        const post = await PostController.getOrFetchDetails({
          compositeId: 'nonexistent:post',
          viewerId: mockViewerId,
        });
        expect(post).toBeNull();
      } finally {
        getOrFetchSpy.mockRestore();
      }
    });

    it('should propagate error when PostApplication throws an error', async () => {
      const { PostController } = await import('./post');
      const ApplicationModule = await import('@/core/application');

      const getOrFetchSpy = vi
        .spyOn(ApplicationModule.PostApplication, 'getOrFetchDetails')
        .mockRejectedValueOnce(new Error('Nexus error'));

      try {
        await expect(
          PostController.getOrFetchDetails({ compositeId: 'error:post', viewerId: mockViewerId }),
        ).rejects.toThrow('Nexus error');
      } finally {
        getOrFetchSpy.mockRestore();
      }
    });

    it('should call PostApplication.getOrFetchDetails with correct postId', async () => {
      const { PostController } = await import('./post');
      const ApplicationModule = await import('@/core/application');

      const getOrFetchSpy = vi.spyOn(ApplicationModule.PostApplication, 'getOrFetchDetails').mockResolvedValue(null);

      try {
        await PostController.getOrFetchDetails({ compositeId: 'author:post123', viewerId: mockViewerId });
        expect(getOrFetchSpy).toHaveBeenCalledWith({ compositeId: 'author:post123', viewerId: mockViewerId });
      } finally {
        getOrFetchSpy.mockRestore();
      }
    });
  });

  describe('fetchTaggers', () => {
    it('should call PostApplication.fetchTaggers and return result', async () => {
      const { PostController } = await import('./post');
      const ApplicationModule = await import('@/core/application');
      const params: Core.TFetchPostTaggersParams = {
        compositeId: testData.fullPostId,
        label: 'bitcoin',
        skip: 0,
        limit: 20,
      };
      const mockTaggers: Core.NexusTaggers = { relationship: false, users: ['user1' as Core.Pubky] };

      const fetchTaggersSpy = vi
        .spyOn(ApplicationModule.PostApplication, 'fetchTaggers')
        .mockResolvedValue(mockTaggers);

      try {
        const result = await PostController.fetchTaggers(params);

        expect(fetchTaggersSpy).toHaveBeenCalledWith(params);
        expect(result).toEqual(mockTaggers);
      } finally {
        fetchTaggersSpy.mockRestore();
      }
    });

    it('should propagate errors from PostApplication.fetchTaggers', async () => {
      const { PostController } = await import('./post');
      const ApplicationModule = await import('@/core/application');
      const params: Core.TFetchPostTaggersParams = {
        compositeId: testData.fullPostId,
        label: 'bitcoin',
      };

      const fetchTaggersSpy = vi
        .spyOn(ApplicationModule.PostApplication, 'fetchTaggers')
        .mockRejectedValue(new Error('Nexus failed'));

      try {
        await expect(PostController.fetchTaggers(params)).rejects.toThrow('Nexus failed');
        expect(fetchTaggersSpy).toHaveBeenCalledWith(params);
      } finally {
        fetchTaggersSpy.mockRestore();
      }
    });
  });

  describe('getRelationships', () => {
    it('should return post relationships when they exist', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      const relationships = await PostController.getRelationships({ compositeId: testData.fullPostId });

      expect(relationships).not.toBeNull();
      expect(relationships?.id).toBe(testData.fullPostId);
      expect(relationships?.replied).toBeNull();
      expect(relationships?.reposted).toBeNull();
      expect(relationships?.mentioned).toEqual([]);
    });

    it('should return null when post relationships do not exist', async () => {
      const { PostController } = await import('./post');

      const relationships = await PostController.getRelationships({ compositeId: 'nonexistent:post' });

      expect(relationships).toBeNull();
    });

    it('should return relationships with parent URI when post is a reply', async () => {
      const parentUri = 'pubky://parent/pub/pubky.app/posts/parent123';
      const postDetails: Core.PostDetailsModelSchema = {
        id: testData.fullPostId,
        content: 'Reply post content',
        indexed_at: Date.now(),
        kind: 'short',
        uri: `pubky://${testData.authorPubky}/pub/pubky.app/posts/${testData.postId}`,
        attachments: null,
      };

      await Core.PostDetailsModel.table.add(postDetails);
      await Core.PostRelationshipsModel.table.add({
        id: testData.fullPostId,
        replied: parentUri,
        reposted: null,
        mentioned: [],
      });

      const { PostController } = await import('./post');
      const relationships = await PostController.getRelationships({ compositeId: testData.fullPostId });

      expect(relationships).not.toBeNull();
      expect(relationships?.replied).toBe(parentUri);
    });

    it('should call PostApplication.getRelationships with correct postId', async () => {
      const { PostController } = await import('./post');
      const ApplicationModule = await import('@/core/application');

      const getRelationshipsSpy = vi
        .spyOn(ApplicationModule.PostApplication, 'getRelationships')
        .mockResolvedValue(null);

      try {
        await PostController.getRelationships({ compositeId: 'author:post123' });
        expect(getRelationshipsSpy).toHaveBeenCalledWith({ compositeId: 'author:post123' });
      } finally {
        getRelationshipsSpy.mockRestore();
      }
    });
  });
});
