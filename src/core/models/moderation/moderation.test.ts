import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/database/franky/franky';
import { ModerationModel } from '@/models/moderation/moderation';
import { ModerationType } from '@/models/moderation/moderation.schema';
describe('ModerationModel', () => {
  beforeEach(async () => {
    await db.initialize();
    await db.transaction('rw', [ModerationModel.table], async () => {
      await ModerationModel.table.clear();
    });
  });

  it('should create and retrieve post moderation records', async () => {
    const postId = 'author:post1';
    await ModerationModel.upsert({
      id: postId,
      type: ModerationType.POST,
      is_blurred: true,
      created_at: Date.now(),
    });

    const record = await ModerationModel.table.get(postId);
    expect(record).toBeTruthy();
    expect(record!.id).toBe(postId);
    expect(record!.type).toBe(ModerationType.POST);
    expect(record!.is_blurred).toBe(true);
  });

  it('should create and retrieve profile moderation records', async () => {
    const profileId = 'pk:user1';
    await ModerationModel.upsert({
      id: profileId,
      type: ModerationType.PROFILE,
      is_blurred: true,
      created_at: Date.now(),
    });

    const record = await ModerationModel.table.get(profileId);
    expect(record).toBeTruthy();
    expect(record!.id).toBe(profileId);
    expect(record!.type).toBe(ModerationType.PROFILE);
    expect(record!.is_blurred).toBe(true);
  });

  it('should delete moderation records', async () => {
    const postId = 'author:post1';
    await ModerationModel.upsert({
      id: postId,
      type: ModerationType.POST,
      is_blurred: true,
      created_at: Date.now(),
    });

    await ModerationModel.deleteById(postId);

    const record = await ModerationModel.table.get(postId);
    expect(record).toBeUndefined();
  });

  it('should check existence of records', async () => {
    const postId = 'author:post1';
    await ModerationModel.upsert({
      id: postId,
      type: ModerationType.POST,
      is_blurred: true,
      created_at: Date.now(),
    });

    const exists = await ModerationModel.exists(postId);
    expect(exists).toBe(true);

    const notExists = await ModerationModel.exists('author:post2');
    expect(notExists).toBe(false);
  });

  it('should update is_blurred field', async () => {
    const postId = 'author:post1';
    await ModerationModel.upsert({
      id: postId,
      type: ModerationType.POST,
      is_blurred: true,
      created_at: Date.now(),
    });

    await ModerationModel.update(postId, { is_blurred: false });

    const record = await ModerationModel.table.get(postId);
    expect(record!.is_blurred).toBe(false);
  });
});
