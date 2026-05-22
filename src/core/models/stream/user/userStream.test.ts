import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { UserStreamModel } from './userStream';
import {
  buildUserCompositeId,
  createDefaultUserStream,
  parseUserCompositeId,
  USER_STREAM_ID_DELIMITER,
} from './userStream.helper';
import { UserStreamTypes } from './userStream.types';

describe('UserStreamModel', () => {
  const targetUserId = 'user-target' as Pubky;

  beforeEach(async () => {
    await db.initialize();
    await UserStreamModel.table.clear();
  });

  describe('constructor', () => {
    it('should create a user stream with composite ID', () => {
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const streamData = createDefaultUserStream(streamId, ['follower-1', 'follower-2']);
      const { id, stream } = new UserStreamModel(streamData);

      expect(id).toBe(streamId);
      expect(stream).toEqual(['follower-1', 'follower-2']);
    });

    it('should create a user stream with enum ID', () => {
      const streamData = createDefaultUserStream(UserStreamTypes.TODAY_INFLUENCERS_ALL, [
        'influencer-1',
        'influencer-2',
      ]);
      const { id, stream } = new UserStreamModel(streamData);

      expect(id).toBe(UserStreamTypes.TODAY_INFLUENCERS_ALL);
      expect(stream).toEqual(['influencer-1', 'influencer-2']);
    });

    it('should handle empty users array', () => {
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const streamData = createDefaultUserStream(streamId, []);
      const { stream } = new UserStreamModel(streamData);

      expect(stream).toEqual([]);
    });
  });

  // Note: TypeScript TS2684 errors are suppressed because BaseStreamModel generic types
  // have complex this-context requirements that don't affect runtime behavior
  describe('upsert', () => {
    it('should save user stream with composite ID to database', async () => {
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      // @ts-expect-error - BaseStreamModel generic type constraint
      await UserStreamModel.upsert(streamId, ['follower-1', 'follower-2']);

      // @ts-expect-error - BaseStreamModel generic type constraint
      const foundStream = await UserStreamModel.findById(streamId);
      expect(foundStream).toBeTruthy();
      expect(foundStream!.stream).toEqual(['follower-1', 'follower-2']);
    });

    it('should save user stream with enum ID to database', async () => {
      // @ts-expect-error - BaseStreamModel generic type constraint
      await UserStreamModel.upsert(UserStreamTypes.TODAY_INFLUENCERS_ALL, ['influencer-1', 'influencer-2']);

      // @ts-expect-error - BaseStreamModel generic type constraint
      const foundStream = await UserStreamModel.findById(UserStreamTypes.TODAY_INFLUENCERS_ALL);
      expect(foundStream).toBeTruthy();
      expect(foundStream!.stream).toEqual(['influencer-1', 'influencer-2']);
    });

    it('should update existing stream', async () => {
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      // @ts-expect-error - BaseStreamModel generic type constraint
      await UserStreamModel.upsert(streamId, ['follower-1']);
      // @ts-expect-error - BaseStreamModel generic type constraint
      await UserStreamModel.upsert(streamId, ['follower-2', 'follower-3']);

      // @ts-expect-error - BaseStreamModel generic type constraint
      const foundStream = await UserStreamModel.findById(streamId);
      expect(foundStream!.stream).toEqual(['follower-2', 'follower-3']);
    });
  });

  describe('findById', () => {
    it('should find user stream by composite ID', async () => {
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'following' });
      // @ts-expect-error - BaseStreamModel generic type constraint
      await UserStreamModel.upsert(streamId, ['following-1', 'following-2']);

      // @ts-expect-error - BaseStreamModel generic type constraint
      const foundStream = await UserStreamModel.findById(streamId);
      expect(foundStream).toBeTruthy();
      expect(foundStream!.stream).toEqual(['following-1', 'following-2']);
    });

    it('should find user stream by enum ID', async () => {
      // @ts-expect-error - BaseStreamModel generic type constraint
      await UserStreamModel.upsert(UserStreamTypes.RECOMMENDED, ['recommended-1', 'recommended-2']);

      // @ts-expect-error - BaseStreamModel generic type constraint
      const foundStream = await UserStreamModel.findById(UserStreamTypes.RECOMMENDED);
      expect(foundStream).toBeTruthy();
      expect(foundStream!.stream).toEqual(['recommended-1', 'recommended-2']);
    });

    it('should return null for non-existent stream', async () => {
      const streamId = buildUserCompositeId({ userId: 'non-existent', reach: 'followers' });
      // @ts-expect-error - BaseStreamModel generic type constraint
      const foundStream = await UserStreamModel.findById(streamId);
      expect(foundStream).toBeNull();
    });
  });

  describe('deleteById', () => {
    it('should delete user stream by composite ID', async () => {
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      // @ts-expect-error - BaseStreamModel generic type constraint
      await UserStreamModel.upsert(streamId, ['follower-1', 'follower-2']);

      // @ts-expect-error - BaseStreamModel generic type constraint
      await UserStreamModel.deleteById(streamId);

      // @ts-expect-error - BaseStreamModel generic type constraint
      const foundStream = await UserStreamModel.findById(streamId);
      expect(foundStream).toBeNull();
    });

    it('should delete user stream by enum ID', async () => {
      // @ts-expect-error - BaseStreamModel generic type constraint
      await UserStreamModel.upsert(UserStreamTypes.TODAY_INFLUENCERS_ALL, ['influencer-1']);

      // @ts-expect-error - BaseStreamModel generic type constraint
      await UserStreamModel.deleteById(UserStreamTypes.TODAY_INFLUENCERS_ALL);

      // @ts-expect-error - BaseStreamModel generic type constraint
      const foundStream = await UserStreamModel.findById(UserStreamTypes.TODAY_INFLUENCERS_ALL);
      expect(foundStream).toBeNull();
    });
  });
});

describe('buildUserCompositeId', () => {
  it('should build correct format (userId:reach)', () => {
    const userId = 'user-123' as Pubky;
    const reach = 'followers';

    const compositeId = buildUserCompositeId({ userId, reach });

    expect(compositeId).toBe('user-123:followers');
  });

  it('should handle all UserStreamSource enum values', () => {
    const userId = 'user-123' as Pubky;

    expect(buildUserCompositeId({ userId, reach: 'followers' })).toBe('user-123:followers');
    expect(buildUserCompositeId({ userId, reach: 'following' })).toBe('user-123:following');
    expect(buildUserCompositeId({ userId, reach: 'friends' })).toBe('user-123:friends');
    expect(buildUserCompositeId({ userId, reach: 'muted' })).toBe('user-123:muted');
  });

  it('should use correct delimiter', () => {
    const userId = 'user-123' as Pubky;
    const reach = 'followers';

    const compositeId = buildUserCompositeId({ userId, reach });

    expect(compositeId).toContain(USER_STREAM_ID_DELIMITER);
    expect(compositeId.split(USER_STREAM_ID_DELIMITER)).toHaveLength(2);
  });

  it('should handle special characters in userId', () => {
    const userId = 'user_with-special.chars' as Pubky;
    const reach = 'followers';

    const compositeId = buildUserCompositeId({ userId, reach });

    expect(compositeId).toBe('user_with-special.chars:followers');
  });
});

describe('parseUserCompositeId', () => {
  it('should parse valid composite IDs correctly', () => {
    const compositeId = 'user-123:followers';

    const result = parseUserCompositeId(compositeId);

    expect(result.userId).toBe('user-123');
    expect(result.reach).toBe('followers');
  });

  it('should handle all reach types', () => {
    expect(parseUserCompositeId('user-123:followers').reach).toBe('followers');
    expect(parseUserCompositeId('user-123:following').reach).toBe('following');
    expect(parseUserCompositeId('user-123:friends').reach).toBe('friends');
    expect(parseUserCompositeId('user-123:muted').reach).toBe('muted');
  });

  it('should throw error for invalid format (no colon)', () => {
    const invalidId = 'user-123-followers';

    expect(() => parseUserCompositeId(invalidId)).toThrow('Invalid user stream composite ID');
  });

  it('should throw error for empty parts (colon at start)', () => {
    const invalidId = ':followers';

    expect(() => parseUserCompositeId(invalidId)).toThrow('Invalid user stream composite ID');
  });

  it('should throw error for empty parts (colon at end)', () => {
    const invalidId = 'user-123:';

    expect(() => parseUserCompositeId(invalidId)).toThrow('Invalid user stream composite ID');
  });

  it('should handle special characters in userId', () => {
    const compositeId = 'user_with-special.chars:followers';

    const result = parseUserCompositeId(compositeId);

    expect(result.userId).toBe('user_with-special.chars');
  });

  it('should handle multiple colons by taking first as delimiter', () => {
    const compositeId = 'user:with:colons:followers';

    const result = parseUserCompositeId(compositeId);

    expect(result.userId).toBe('user');
    expect(result.reach).toBe('with:colons:followers');
  });
});

describe('createDefaultUserStream', () => {
  it('should create stream with UserStreamId (composite)', () => {
    const streamId = buildUserCompositeId({ userId: 'user-123', reach: 'followers' });
    const stream: Pubky[] = ['follower-1', 'follower-2'];

    const result = createDefaultUserStream(streamId, stream);

    expect(result.id).toBe(streamId);
    expect(result.stream).toEqual(stream);
  });

  it('should create stream with UserStreamId (enum)', () => {
    const streamId = UserStreamTypes.TODAY_INFLUENCERS_ALL;
    const stream: Pubky[] = ['influencer-1'];

    const result = createDefaultUserStream(streamId, stream);

    expect(result.id).toBe(streamId);
    expect(result.stream).toEqual(stream);
  });

  it('should default stream to empty array', () => {
    const streamId = buildUserCompositeId({ userId: 'user-123', reach: 'followers' });

    const result = createDefaultUserStream(streamId);

    expect(result.stream).toEqual([]);
  });
});
