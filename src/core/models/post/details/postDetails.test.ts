import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import { buildCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { NexusPostDetails } from '@/services/nexus/nexus.types';
describe('PostDetailsModel', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const testPostId1 = 'post-test-1';
  const testPostId2 = 'post-test-2';
  const testAuthor = 'test-author-pubky';

  // Mock data that simulates the API response (includes author)
  const MOCK_NEXUS_POST_DETAILS: Omit<NexusPostDetails, 'id'> = {
    content: 'This is a test post content',
    indexed_at: Date.now(),
    author: testAuthor,
    kind: 'short',
    uri: 'https://example.com/post/1',
    attachments: ['image1.jpg', 'image2.png'],
  };

  // Helper function to create PostDetailsModelSchema (without author, with composite ID)
  const createPostDetailsData = (
    originalId: string,
    nexusDetails: typeof MOCK_NEXUS_POST_DETAILS,
  ): PostDetailsModelSchema => {
    const compositeId = buildCompositeId({ pubky: nexusDetails.author, id: originalId });
    // eslint-disable-next-line
    const { author, ...detailsWithoutAuthor } = nexusDetails;
    return { ...detailsWithoutAuthor, id: compositeId };
  };

  describe('Constructor', () => {
    it('should create PostDetailsModel instance with all properties', () => {
      const mockPostDetailsData = createPostDetailsData(testPostId1, MOCK_NEXUS_POST_DETAILS);

      const postDetails = new PostDetailsModel(mockPostDetailsData);

      expect(postDetails.id).toBe(buildCompositeId({ pubky: testAuthor, id: testPostId1 }));
      expect(postDetails.content).toBe(mockPostDetailsData.content);
      expect(postDetails.indexed_at).toBe(mockPostDetailsData.indexed_at);
      expect(postDetails.kind).toBe(mockPostDetailsData.kind);
      expect(postDetails.uri).toBe(mockPostDetailsData.uri);
      expect(postDetails.attachments).toEqual(mockPostDetailsData.attachments);
    });

    it('should handle null attachments', () => {
      const mockNexusDetails = { ...MOCK_NEXUS_POST_DETAILS, attachments: null };
      const mockPostDetailsData = createPostDetailsData(testPostId1, mockNexusDetails);

      const postDetails = new PostDetailsModel(mockPostDetailsData);

      expect(postDetails.attachments).toBeNull();
    });
  });

  describe('Static Methods', () => {
    it('should create post details', async () => {
      const mockPostDetailsData = createPostDetailsData(testPostId1, MOCK_NEXUS_POST_DETAILS);

      const result = await PostDetailsModel.create(mockPostDetailsData);
      expect(result).toBe(mockPostDetailsData.id);
    });

    it('should find post details by id', async () => {
      const mockPostDetailsData = createPostDetailsData(testPostId1, MOCK_NEXUS_POST_DETAILS);
      const compositeId = buildCompositeId({ pubky: testAuthor, id: testPostId1 });

      await PostDetailsModel.create(mockPostDetailsData);
      const result = await PostDetailsModel.findById(compositeId);

      expect(result).not.toBeNull();
      expect(result!).toBeInstanceOf(PostDetailsModel);
      expect(result!.id).toBe(compositeId);
      expect(result!.content).toBe(MOCK_NEXUS_POST_DETAILS.content);
    });

    it('should return null for non-existent post details', async () => {
      const nonExistentId = 'non-existent-post-999';
      const result = await PostDetailsModel.findById(nonExistentId);
      expect(result).toBeNull();
    });

    it('should bulk save post details from tuples', async () => {
      const mockPostDetails: PostDetailsModelSchema[] = [
        createPostDetailsData(testPostId1, MOCK_NEXUS_POST_DETAILS),
        createPostDetailsData(testPostId2, { ...MOCK_NEXUS_POST_DETAILS, content: 'Second post content' }),
      ];

      const result = await PostDetailsModel.bulkSave(mockPostDetails);
      expect(result).toBeDefined();

      // Verify the data was saved correctly
      const compositeId1 = buildCompositeId({ pubky: testAuthor, id: testPostId1 });
      const compositeId2 = buildCompositeId({ pubky: testAuthor, id: testPostId2 });
      const postDetails1 = await PostDetailsModel.findById(compositeId1);
      const postDetails2 = await PostDetailsModel.findById(compositeId2);

      expect(postDetails1).not.toBeNull();
      expect(postDetails2).not.toBeNull();
      expect(postDetails1!.content).toBe('This is a test post content');
      expect(postDetails2!.content).toBe('Second post content');
    });

    it('should handle empty array in bulk save', async () => {
      const result = await PostDetailsModel.bulkSave([]);
      // bulkPut with empty array returns undefined, which is expected
      expect(result).toBeUndefined();
    });

    it('should handle different post kinds', async () => {
      const mockPostDetails: PostDetailsModelSchema[] = [
        createPostDetailsData(testPostId1, { ...MOCK_NEXUS_POST_DETAILS, kind: 'short' }),
        createPostDetailsData(testPostId2, { ...MOCK_NEXUS_POST_DETAILS, kind: 'long' }),
      ];

      await PostDetailsModel.bulkSave(mockPostDetails);

      const compositeId1 = buildCompositeId({ pubky: testAuthor, id: testPostId1 });
      const compositeId2 = buildCompositeId({ pubky: testAuthor, id: testPostId2 });
      const postDetails1 = await PostDetailsModel.findById(compositeId1);
      const postDetails2 = await PostDetailsModel.findById(compositeId2);

      expect(postDetails1).not.toBeNull();
      expect(postDetails2).not.toBeNull();
      expect(postDetails1!.kind).toBe('short');
      expect(postDetails2!.kind).toBe('long');
    });

    it('should handle posts with and without attachments', async () => {
      const mockPostDetails: PostDetailsModelSchema[] = [
        createPostDetailsData(testPostId1, { ...MOCK_NEXUS_POST_DETAILS, attachments: ['file1.jpg'] }),
        createPostDetailsData(testPostId2, { ...MOCK_NEXUS_POST_DETAILS, attachments: null }),
      ];

      await PostDetailsModel.bulkSave(mockPostDetails);

      const compositeId1 = buildCompositeId({ pubky: testAuthor, id: testPostId1 });
      const compositeId2 = buildCompositeId({ pubky: testAuthor, id: testPostId2 });
      const postDetails1 = await PostDetailsModel.findById(compositeId1);
      const postDetails2 = await PostDetailsModel.findById(compositeId2);

      expect(postDetails1).not.toBeNull();
      expect(postDetails2).not.toBeNull();
      expect(postDetails1!.attachments).toEqual(['file1.jpg']);
      expect(postDetails2!.attachments).toBeNull();
    });
  });
});
