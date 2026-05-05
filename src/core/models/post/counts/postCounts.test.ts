import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import type { NexusPostCounts } from '@/services/nexus/nexus.types';

describe('PostCountsModel', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const testPostId1 = 'post-test-1';
  const testPostId2 = 'post-test-2';

  const MOCK_NEXUS_POST_COUNTS: NexusPostCounts = {
    tags: 5,
    unique_tags: 3,
    replies: 12,
    reposts: 8,
  };

  describe('Constructor', () => {
    it('should create PostCountsModel instance with all properties', () => {
      const mockPostCountsData = { id: testPostId1, ...MOCK_NEXUS_POST_COUNTS };
      const postCounts = new PostCountsModel(mockPostCountsData);

      expect(postCounts.id).toBe(testPostId1);
      expect(postCounts.tags).toBe(5);
      expect(postCounts.unique_tags).toBe(3);
      expect(postCounts.replies).toBe(12);
      expect(postCounts.reposts).toBe(8);
    });
  });

  describe('Static Methods', () => {
    const createTestPostCounts = (id: string) => ({ id, ...MOCK_NEXUS_POST_COUNTS });

    it('should create post counts', async () => {
      const result = await PostCountsModel.create(createTestPostCounts(testPostId1));
      expect(result).toBe(testPostId1);
    });

    it('should find post counts by id', async () => {
      await PostCountsModel.create(createTestPostCounts(testPostId1));
      const result = await PostCountsModel.findById(testPostId1);

      expect(result).toBeInstanceOf(PostCountsModel);
      expect(result!.id).toBe(testPostId1);
      expect(result!.replies).toBe(12);
    });

    it('should return null for non-existent post counts', async () => {
      const nonExistentId = 'non-existent-post-999';
      const result = await PostCountsModel.findById(nonExistentId);
      expect(result).toBeNull();
    });

    it('should bulk save post counts from tuples', async () => {
      const mockNexusModelTuples: NexusModelTuple<NexusPostCounts>[] = [
        [testPostId1, MOCK_NEXUS_POST_COUNTS],
        [testPostId2, { ...MOCK_NEXUS_POST_COUNTS, replies: 25 }],
      ];

      await PostCountsModel.bulkSave(mockNexusModelTuples);

      const postCounts1 = await PostCountsModel.findById(testPostId1);
      const postCounts2 = await PostCountsModel.findById(testPostId2);

      expect(postCounts1!.replies).toBe(12);
      expect(postCounts2!.replies).toBe(25);
    });

    it('should handle empty array in bulk save', async () => {
      const result = await PostCountsModel.bulkSave([]);
      // bulkPut with empty array returns undefined, which is expected
      expect(result).toBeUndefined();
    });

    it('should handle multiple tuples with different data', async () => {
      const mockTuples: NexusModelTuple<NexusPostCounts>[] = [
        [testPostId1, MOCK_NEXUS_POST_COUNTS],
        [testPostId2, { ...MOCK_NEXUS_POST_COUNTS, reposts: 100, tags: 1 }],
      ];

      await PostCountsModel.bulkSave(mockTuples);

      const postCounts1 = await PostCountsModel.findById(testPostId1);
      const postCounts2 = await PostCountsModel.findById(testPostId2);

      expect(postCounts1!.reposts).toBe(8);
      expect(postCounts1!.tags).toBe(5);
      expect(postCounts2!.reposts).toBe(100);
      expect(postCounts2!.tags).toBe(1);
    });

    describe('toSchema', () => {
      it('should convert NexusModelTuple to PostCountsModelSchema', () => {
        const tuple: NexusModelTuple<NexusPostCounts> = [testPostId1, MOCK_NEXUS_POST_COUNTS];
        const result = PostCountsModel.toSchema(tuple);

        expect(result).toEqual({
          id: testPostId1,
          tags: MOCK_NEXUS_POST_COUNTS.tags,
          unique_tags: MOCK_NEXUS_POST_COUNTS.unique_tags,
          replies: MOCK_NEXUS_POST_COUNTS.replies,
          reposts: MOCK_NEXUS_POST_COUNTS.reposts,
        });
      });

      it('should handle different post IDs in toSchema', () => {
        const tuple: NexusModelTuple<NexusPostCounts> = [testPostId2, MOCK_NEXUS_POST_COUNTS];
        const result = PostCountsModel.toSchema(tuple);

        expect(result.id).toBe(testPostId2);
        expect(result).toEqual({ id: testPostId2, ...MOCK_NEXUS_POST_COUNTS });
      });
    });

    describe('updateCounts', () => {
      beforeEach(async () => {
        await PostCountsModel.create({ id: testPostId1, ...MOCK_NEXUS_POST_COUNTS });
      });

      it.each([
        ['replies', { replies: 5 }, 17],
        ['reposts', { reposts: -2 }, 6],
        ['tags', { tags: 3 }, 8],
        ['unique_tags', { unique_tags: -1 }, 2],
      ])('should update %s field', async (field, countChanges, expected) => {
        await PostCountsModel.updateCounts({
          postCompositeId: testPostId1,
          countChanges,
        });

        const updated = await PostCountsModel.findById(testPostId1);
        expect(updated![field as keyof PostCountsModelSchema]).toBe(expected);
      });

      it('should update multiple count fields at once', async () => {
        await PostCountsModel.updateCounts({
          postCompositeId: testPostId1,
          countChanges: { replies: 10, reposts: -3, tags: 2, unique_tags: 1 },
        });

        const updated = await PostCountsModel.findById(testPostId1);
        expect(updated!.replies).toBe(22);
        expect(updated!.reposts).toBe(5);
        expect(updated!.tags).toBe(7);
        expect(updated!.unique_tags).toBe(4);
      });

      it('should prevent negative values by clamping to 0', async () => {
        await PostCountsModel.updateCounts({
          postCompositeId: testPostId1,
          countChanges: { replies: -100, reposts: -20 },
        });

        const updated = await PostCountsModel.findById(testPostId1);
        expect(updated!.replies).toBe(0);
        expect(updated!.reposts).toBe(0);
      });

      it('should handle partial updates (only some fields)', async () => {
        await PostCountsModel.updateCounts({
          postCompositeId: testPostId1,
          countChanges: { replies: 5 },
        });

        const updated = await PostCountsModel.findById(testPostId1);
        expect(updated!.replies).toBe(17);
        expect(updated!.reposts).toBe(8);
      });

      it('should return early if post counts do not exist', async () => {
        const nonExistentId = 'non-existent-post-999';
        await PostCountsModel.updateCounts({
          postCompositeId: nonExistentId,
          countChanges: { replies: 5 },
        });

        const result = await PostCountsModel.findById(nonExistentId);
        expect(result).toBeNull();
      });

      it('should not update if countChanges is empty', async () => {
        const beforeUpdate = await PostCountsModel.findById(testPostId1);
        await PostCountsModel.updateCounts({
          postCompositeId: testPostId1,
          countChanges: {},
        });

        const afterUpdate = await PostCountsModel.findById(testPostId1);
        expect(afterUpdate).toEqual(beforeUpdate);
      });

      it('should handle zero changes correctly', async () => {
        await PostCountsModel.updateCounts({
          postCompositeId: testPostId1,
          countChanges: { replies: 0, reposts: 0 },
        });

        const updated = await PostCountsModel.findById(testPostId1);
        expect(updated!.replies).toBe(12);
        expect(updated!.reposts).toBe(8);
      });

      it('should handle multiple sequential updates', async () => {
        await PostCountsModel.updateCounts({
          postCompositeId: testPostId1,
          countChanges: { replies: 5 },
        });
        let updated = await PostCountsModel.findById(testPostId1);
        expect(updated!.replies).toBe(17);

        await PostCountsModel.updateCounts({
          postCompositeId: testPostId1,
          countChanges: { replies: -2 },
        });
        updated = await PostCountsModel.findById(testPostId1);
        expect(updated!.replies).toBe(15);

        await PostCountsModel.updateCounts({
          postCompositeId: testPostId1,
          countChanges: { reposts: 10 },
        });
        updated = await PostCountsModel.findById(testPostId1);
        expect(updated!.replies).toBe(15);
        expect(updated!.reposts).toBe(18);
      });

      describe('Error Handling', () => {
        const updateParams = {
          postCompositeId: testPostId1,
          countChanges: { replies: 5 },
        };

        it('should propagate database errors from findById', async () => {
          const error = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to find record in post_counts', {
            service: ErrorService.Local,
            operation: 'findById',
            context: { id: testPostId1 },
          });

          vi.spyOn(PostCountsModel, 'findById').mockRejectedValueOnce(error);

          await expect(PostCountsModel.updateCounts(updateParams)).rejects.toMatchObject({
            category: ErrorCategory.Database,
            code: DatabaseErrorCode.QUERY_FAILED,
          });
        });

        it('should propagate database errors from update', async () => {
          const error = Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to update record in post_counts', {
            service: ErrorService.Local,
            operation: 'update',
            context: { id: testPostId1 },
          });

          vi.spyOn(PostCountsModel, 'update').mockRejectedValueOnce(error);

          await expect(PostCountsModel.updateCounts(updateParams)).rejects.toMatchObject({
            category: ErrorCategory.Database,
            code: DatabaseErrorCode.WRITE_FAILED,
          });
        });

        it('should propagate generic errors from findById', async () => {
          vi.spyOn(PostCountsModel, 'findById').mockRejectedValueOnce(new Error('Database error'));

          await expect(PostCountsModel.updateCounts(updateParams)).rejects.toThrow('Database error');
        });

        it('should propagate generic errors from update', async () => {
          vi.spyOn(PostCountsModel, 'update').mockRejectedValueOnce(new Error('Update error'));

          await expect(PostCountsModel.updateCounts(updateParams)).rejects.toThrow('Update error');
        });
      });
    });
  });
});
