import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/franky/franky';
import { ModerationModel } from '@/models/moderation/moderation';
import { ModerationType } from '@/models/moderation/moderation.schema';
import { LocalModerationService } from '@/services/local/moderation/moderation';

describe('LocalModerationService', () => {
  beforeEach(async () => {
    await db.initialize();
    await db.transaction('rw', [ModerationModel.table], async () => {
      await ModerationModel.table.clear();
    });
  });

  describe('setUnblur', () => {
    it('should set is_blurred to false for posts', async () => {
      const postId = 'author:post1';
      await ModerationModel.upsert({
        id: postId,
        type: ModerationType.POST,
        is_blurred: true,
        created_at: Date.now(),
      });

      await LocalModerationService.setUnBlur(postId);

      const record = await ModerationModel.table.get(postId);
      expect(record).toBeTruthy();
      expect(record!.is_blurred).toBe(false);
    });

    it('should set is_blurred to false for profiles', async () => {
      const profileId = 'pk:user1';
      await ModerationModel.upsert({
        id: profileId,
        type: ModerationType.PROFILE,
        is_blurred: true,
        created_at: Date.now(),
      });

      await LocalModerationService.setUnBlur(profileId);

      const record = await ModerationModel.table.get(profileId);
      expect(record).toBeTruthy();
      expect(record!.is_blurred).toBe(false);
    });

    it('should do nothing if item is not in moderation table', async () => {
      const postId = 'author:post1';

      await LocalModerationService.setUnBlur(postId);

      const record = await ModerationModel.table.get(postId);
      expect(record).toBeUndefined();
    });
  });

  describe('getModerationRecord', () => {
    it('should return null when record does not exist', async () => {
      const postId = 'author:post1';

      const result = await LocalModerationService.getModerationRecord(postId);

      expect(result).toBeNull();
    });

    it('should return record when it exists', async () => {
      const postId = 'author:post1';
      await ModerationModel.upsert({
        id: postId,
        type: ModerationType.POST,
        is_blurred: true,
        created_at: Date.now(),
      });

      const result = await LocalModerationService.getModerationRecord(postId);

      expect(result).toBeTruthy();
      expect(result!.id).toBe(postId);
      expect(result!.is_blurred).toBe(true);
    });

    it('should return correct record for specific post', async () => {
      const postId1 = 'author:post1';
      const postId2 = 'author:post2';
      await ModerationModel.upsert({
        id: postId1,
        type: ModerationType.POST,
        is_blurred: false,
        created_at: Date.now(),
      });
      await ModerationModel.upsert({
        id: postId2,
        type: ModerationType.POST,
        is_blurred: true,
        created_at: Date.now(),
      });

      const result1 = await LocalModerationService.getModerationRecord(postId1);
      const result2 = await LocalModerationService.getModerationRecord(postId2);

      expect(result1!.is_blurred).toBe(false);
      expect(result2!.is_blurred).toBe(true);
    });

    it('should return null when type filter does not match', async () => {
      const postId = 'author:post1';
      await ModerationModel.upsert({
        id: postId,
        type: ModerationType.POST,
        is_blurred: true,
        created_at: Date.now(),
      });

      const result = await LocalModerationService.getModerationRecord(postId, ModerationType.PROFILE);

      expect(result).toBeNull();
    });

    it('should return record when type filter matches', async () => {
      const profileId = 'pk:user1';
      await ModerationModel.upsert({
        id: profileId,
        type: ModerationType.PROFILE,
        is_blurred: true,
        created_at: Date.now(),
      });

      const result = await LocalModerationService.getModerationRecord(profileId, ModerationType.PROFILE);

      expect(result).toBeTruthy();
      expect(result!.id).toBe(profileId);
      expect(result!.type).toBe(ModerationType.PROFILE);
    });
  });

  describe('getModerationRecords', () => {
    it('should return all records when no type filter', async () => {
      await ModerationModel.upsert({
        id: 'pk:user1',
        type: ModerationType.PROFILE,
        is_blurred: true,
        created_at: Date.now(),
      });
      await ModerationModel.upsert({
        id: 'author:post1',
        type: ModerationType.POST,
        is_blurred: true,
        created_at: Date.now(),
      });

      const results = await LocalModerationService.getModerationRecords(['pk:user1', 'author:post1']);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id)).toContain('pk:user1');
      expect(results.map((r) => r.id)).toContain('author:post1');
    });

    it('should return only profile records when filtered by type', async () => {
      await ModerationModel.upsert({
        id: 'pk:user1',
        type: ModerationType.PROFILE,
        is_blurred: true,
        created_at: Date.now(),
      });
      await ModerationModel.upsert({
        id: 'pk:user2',
        type: ModerationType.PROFILE,
        is_blurred: false,
        created_at: Date.now(),
      });
      await ModerationModel.upsert({
        id: 'author:post1',
        type: ModerationType.POST,
        is_blurred: true,
        created_at: Date.now(),
      });

      const results = await LocalModerationService.getModerationRecords(
        ['pk:user1', 'pk:user2', 'author:post1'],
        ModerationType.PROFILE,
      );

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id)).toContain('pk:user1');
      expect(results.map((r) => r.id)).toContain('pk:user2');
      expect(results.map((r) => r.id)).not.toContain('author:post1');
    });

    it('should return only post records when filtered by type', async () => {
      await ModerationModel.upsert({
        id: 'pk:user1',
        type: ModerationType.PROFILE,
        is_blurred: true,
        created_at: Date.now(),
      });
      await ModerationModel.upsert({
        id: 'author:post1',
        type: ModerationType.POST,
        is_blurred: true,
        created_at: Date.now(),
      });

      const results = await LocalModerationService.getModerationRecords(
        ['pk:user1', 'author:post1'],
        ModerationType.POST,
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('author:post1');
    });
  });
});
