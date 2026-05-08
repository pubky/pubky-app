import { describe, expect, it } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { type UserStreamId, UserStreamTypes } from '@/models/stream/user/userStream.types';
import { userStreamApi } from '@/services/nexus/stream/users/userStream.api';
import type {
  TUserStreamBase,
  TUserStreamInfluencersParams,
  TUserStreamWithUserIdParams,
} from '@/services/nexus/stream/users/userStream.types';
import { createUserStreamParams, streamRequiresUserId } from './userStream.utils';

describe('createUserStreamParams', () => {
  const baseParams: TUserStreamBase = {
    skip: 0,
    limit: 20,
  };

  // ============================================================================
  // 2-Part Composite IDs (userId:reach)
  // ============================================================================

  describe('2-part composite IDs (userId:reach)', () => {
    it('should parse followers composite ID correctly', () => {
      const streamId = 'user-123:followers' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('followers');
      expect(result.apiParams).toEqual({
        user_id: 'user-123',
        skip: 0,
        limit: 20,
      });
    });

    it('should parse following composite ID correctly', () => {
      const streamId = 'user-456:following' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('following');
      expect(result.apiParams).toEqual({
        user_id: 'user-456',
        skip: 0,
        limit: 20,
      });
    });

    it('should parse friends composite ID correctly', () => {
      const streamId = 'user-789:friends' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('friends');
      expect(result.apiParams).toEqual({
        user_id: 'user-789',
        skip: 0,
        limit: 20,
      });
    });

    it('should parse muted composite ID correctly', () => {
      const streamId = 'user-abc:muted' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('muted');
      expect(result.apiParams).toEqual({
        user_id: 'user-abc',
        skip: 0,
        limit: 20,
      });
    });

    it('should handle user IDs with special characters', () => {
      const streamId = 'user_with-special.chars:followers' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('followers');
      expect(result.apiParams).toHaveProperty('user_id', 'user_with-special.chars');
    });

    it('should spread baseParams correctly', () => {
      const streamId = 'user-123:followers' as UserStreamId;
      const paramsWithViewer: TUserStreamBase = {
        skip: 10,
        limit: 30,
        viewer_id: 'viewer-xyz' as Pubky,
      };

      const result = createUserStreamParams(streamId, paramsWithViewer);

      expect(result.apiParams).toEqual({
        user_id: 'user-123',
        skip: 10,
        limit: 30,
        viewer_id: 'viewer-xyz',
      });
    });

    it('should handle preview parameter', () => {
      const streamId = 'user-123:followers' as UserStreamId;
      const paramsWithPreview: TUserStreamBase = {
        skip: 0,
        limit: 20,
        preview: true,
      };

      const result = createUserStreamParams(streamId, paramsWithPreview);

      expect(result.apiParams).toHaveProperty('preview', true);
    });
  });

  // ============================================================================
  // 3-Part Enum Types (source:timeframe:reach)
  // ============================================================================

  describe('3-part enum types (source:timeframe:reach)', () => {
    it('should parse influencers stream ID correctly and omit reach when "all"', () => {
      const streamId = UserStreamTypes.TODAY_INFLUENCERS_ALL;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('influencers');
      // 'all' is not a valid API value for reach, so it should be omitted
      expect(result.apiParams).toEqual({
        skip: 0,
        limit: 20,
        timeframe: 'today',
      });
      expect(result.apiParams).not.toHaveProperty('reach');
    });

    it('should parse recommended stream ID correctly', () => {
      const streamId = UserStreamTypes.RECOMMENDED;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('recommended');
      expect(result.apiParams).toEqual({
        skip: 0,
        limit: 20,
      });
    });

    it('should handle influencers with different timeframe', () => {
      const streamId = 'influencers:this_month:followers' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('influencers');
      expect(result.apiParams).toEqual({
        skip: 0,
        limit: 20,
        timeframe: 'this_month',
        reach: 'followers',
      });
    });

    it('should handle influencers with different reach', () => {
      const streamId = 'influencers:today:following' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('influencers');
      expect(result.apiParams).toEqual({
        skip: 0,
        limit: 20,
        timeframe: 'today',
        reach: 'following',
      });
    });

    it('should spread baseParams for influencers and omit reach when "all"', () => {
      const streamId = UserStreamTypes.TODAY_INFLUENCERS_ALL;
      const paramsWithViewer: TUserStreamBase = {
        skip: 5,
        limit: 15,
        viewer_id: 'viewer-abc' as Pubky,
      };

      const result = createUserStreamParams(streamId, paramsWithViewer);

      // 'all' is not a valid API value for reach, so it should be omitted
      expect(result.apiParams).toEqual({
        skip: 5,
        limit: 15,
        viewer_id: 'viewer-abc',
        timeframe: 'today',
      });
      expect(result.apiParams).not.toHaveProperty('reach');
    });

    it('should include user_id from viewer_id when influencers reach is not "all"', () => {
      const streamId = 'influencers:today:following' as UserStreamId;
      const paramsWithViewer: TUserStreamBase = {
        skip: 0,
        limit: 20,
        viewer_id: 'viewer-abc' as Pubky,
      };

      const result = createUserStreamParams(streamId, paramsWithViewer);

      expect(result.reach).toBe('influencers');
      expect(result.apiParams).toEqual({
        skip: 0,
        limit: 20,
        viewer_id: 'viewer-abc',
        timeframe: 'today',
        reach: 'following',
        user_id: 'viewer-abc',
      });
    });

    it('should not include user_id for influencers when reach is "all" even with viewer_id', () => {
      const streamId = 'influencers:today:all' as UserStreamId;
      const paramsWithViewer: TUserStreamBase = {
        skip: 0,
        limit: 20,
        viewer_id: 'viewer-abc' as Pubky,
      };

      const result = createUserStreamParams(streamId, paramsWithViewer);

      expect(result.reach).toBe('influencers');
      expect(result.apiParams).not.toHaveProperty('user_id');
      expect(result.apiParams).not.toHaveProperty('reach');
    });

    it('should handle 3-part non-influencers format without viewer_id', () => {
      const streamId = 'recommended:all:all' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('recommended');
      expect(result.apiParams).toEqual(baseParams);
    });

    it('should add user_id from viewer_id for recommended streams', () => {
      const streamId = 'recommended:all:all' as UserStreamId;
      const paramsWithViewer: TUserStreamBase = {
        skip: 0,
        limit: 20,
        viewer_id: 'viewer-abc' as Pubky,
      };

      const result = createUserStreamParams(streamId, paramsWithViewer);

      expect(result.reach).toBe('recommended');
      expect(result.apiParams).toEqual({
        skip: 0,
        limit: 20,
        viewer_id: 'viewer-abc',
        user_id: 'viewer-abc', // ← Added from viewer_id
      });
    });

    it('should add user_id from viewer_id for all sources requiring user_id', () => {
      const sources = ['followers', 'following', 'friends', 'muted'];
      const paramsWithViewer: TUserStreamBase = {
        skip: 0,
        limit: 20,
        viewer_id: 'viewer-xyz' as Pubky,
      };

      sources.forEach((source) => {
        const streamId = `${source}:all:all` as UserStreamId;
        const result = createUserStreamParams(streamId, paramsWithViewer);

        expect(result.apiParams).toHaveProperty('user_id', 'viewer-xyz');
      });
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('edge cases and error handling', () => {
    it('should throw error for invalid format (1 part)', () => {
      const streamId = 'invalid-stream-id' as UserStreamId;

      expect(() => createUserStreamParams(streamId, baseParams)).toThrow(
        'Invalid stream ID: "invalid-stream-id". Expected 2 or 3 parts separated by ":"',
      );
    });

    it('should throw error for invalid format (4+ parts)', () => {
      const streamId = 'part1:part2:part3:part4' as UserStreamId;

      expect(() => createUserStreamParams(streamId, baseParams)).toThrow(
        'Invalid stream ID: "part1:part2:part3:part4". Expected 2 or 3 parts separated by ":"',
      );
    });

    it('should throw error for empty streamId', () => {
      const streamId = '' as UserStreamId;

      expect(() => createUserStreamParams(streamId, baseParams)).toThrow();
    });

    it('should handle empty parts gracefully', () => {
      // This would create userId="" or reach=""
      const streamId = ':followers' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('followers');
      expect(result.apiParams).toHaveProperty('user_id', '');
    });

    it('should handle trailing colon', () => {
      const streamId = 'user-123:' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      expect(result.reach).toBe('');
      expect(result.apiParams).toHaveProperty('user_id', 'user-123');
    });
  });

  // ============================================================================
  // Type Safety Verification
  // ============================================================================

  describe('type safety', () => {
    it('should return correct apiParams type for followers', () => {
      const streamId = 'user-123:followers' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      // Type check: should have user_id property
      expect(result.apiParams).toHaveProperty('user_id');
      expect((result.apiParams as TUserStreamWithUserIdParams).user_id).toBe('user-123');
    });

    it('should return correct apiParams type for influencers', () => {
      const streamId = UserStreamTypes.TODAY_INFLUENCERS_ALL;

      const result = createUserStreamParams(streamId, baseParams);

      // Type check: should have timeframe but NOT reach when reach is 'all'
      expect(result.apiParams).toHaveProperty('timeframe');
      expect(result.apiParams).not.toHaveProperty('reach');
      expect((result.apiParams as TUserStreamInfluencersParams).timeframe).toBe('today');
    });

    it('should return correct apiParams type for most_followed', () => {
      const streamId = 'most_followed:all:all' as UserStreamId;

      const result = createUserStreamParams(streamId, baseParams);

      // Type check: should only have base params
      expect(result.apiParams).toEqual(baseParams);
      expect(result.reach).toBe('most_followed');
    });
  });

  // ============================================================================
  // All UserStreamSource Values
  // ============================================================================

  describe('all UserStreamSource enum values', () => {
    it('should handle followers', () => {
      const streamId = 'user-123:followers' as UserStreamId;
      const result = createUserStreamParams(streamId, baseParams);
      expect(result.reach).toBe('followers');
    });

    it('should handle following', () => {
      const streamId = 'user-123:following' as UserStreamId;
      const result = createUserStreamParams(streamId, baseParams);
      expect(result.reach).toBe('following');
    });

    it('should handle friends', () => {
      const streamId = 'user-123:friends' as UserStreamId;
      const result = createUserStreamParams(streamId, baseParams);
      expect(result.reach).toBe('friends');
    });

    it('should handle muted', () => {
      const streamId = 'user-123:muted' as UserStreamId;
      const result = createUserStreamParams(streamId, baseParams);
      expect(result.reach).toBe('muted');
    });

    it('should handle recommended', () => {
      const streamId = 'recommended:all:all' as UserStreamId;
      const result = createUserStreamParams(streamId, baseParams);
      expect(result.reach).toBe('recommended');
    });

    it('should handle influencers', () => {
      const streamId = 'influencers:today:all' as UserStreamId;
      const result = createUserStreamParams(streamId, baseParams);
      expect(result.reach).toBe('influencers');
    });

    it('should handle most_followed', () => {
      const streamId = 'most_followed:all:all' as UserStreamId;
      const result = createUserStreamParams(streamId, baseParams);
      expect(result.reach).toBe('most_followed');
    });

    it('should handle post_replies', () => {
      const streamId = 'post_replies:all:all' as UserStreamId;
      const result = createUserStreamParams(streamId, baseParams);
      expect(result.reach).toBe('post_replies');
    });
  });

  // ============================================================================
  // Integration with userStreamApi
  // ============================================================================

  describe('integration with userStreamApi', () => {
    it('should generate parameters compatible with userStreamApi.followers', () => {
      const streamId = 'user-123:followers' as UserStreamId;
      const result = createUserStreamParams(streamId, baseParams);

      // Should be able to call userStreamApi with these params
      const url = userStreamApi.followers(result.apiParams as TUserStreamWithUserIdParams);
      expect(url).toContain('user_id=user-123');
      expect(url).toContain('skip=0');
      expect(url).toContain('limit=20');
    });

    it('should generate parameters compatible with userStreamApi.influencers', () => {
      const streamId = UserStreamTypes.TODAY_INFLUENCERS_ALL;
      const result = createUserStreamParams(streamId, baseParams);

      // Should be able to call userStreamApi with these params
      const url = userStreamApi.influencers(result.apiParams as TUserStreamInfluencersParams);
      expect(url).toContain('timeframe=today');
      // 'all' is not a valid API value, so it should NOT be in the URL
      expect(url).not.toContain('reach=all');
    });

    it('should generate parameters compatible with userStreamApi.mostFollowed', () => {
      const streamId = 'most_followed:all:all' as UserStreamId;
      const result = createUserStreamParams(streamId, baseParams);

      // Should be able to call userStreamApi with these params
      const url = userStreamApi.mostFollowed(result.apiParams as TUserStreamBase);
      expect(url).toContain('skip=0');
      expect(url).toContain('limit=20');
    });
  });
});

describe('streamRequiresUserId', () => {
  it('should return true for followers source', () => {
    expect(streamRequiresUserId('followers:all:all' as UserStreamId)).toBe(true);
  });

  it('should return true for following source', () => {
    expect(streamRequiresUserId('following:all:all' as UserStreamId)).toBe(true);
  });

  it('should return true for friends source', () => {
    expect(streamRequiresUserId('friends:all:all' as UserStreamId)).toBe(true);
  });

  it('should return true for muted source', () => {
    expect(streamRequiresUserId('muted:all:all' as UserStreamId)).toBe(true);
  });

  it('should return true for recommended source', () => {
    expect(streamRequiresUserId('recommended:all:all' as UserStreamId)).toBe(true);
    expect(streamRequiresUserId(UserStreamTypes.RECOMMENDED)).toBe(true);
  });

  it('should return false for influencers source', () => {
    expect(streamRequiresUserId('influencers:today:all' as UserStreamId)).toBe(false);
    expect(streamRequiresUserId(UserStreamTypes.TODAY_INFLUENCERS_ALL)).toBe(false);
  });

  it('should return false for most_followed source', () => {
    expect(streamRequiresUserId('most_followed:all:all' as UserStreamId)).toBe(false);
    expect(streamRequiresUserId(UserStreamTypes.MOST_FOLLOWED)).toBe(false);
  });

  it('should return false for post_replies source', () => {
    expect(streamRequiresUserId('post_replies:all:all' as UserStreamId)).toBe(false);
  });

  it('should return false for composite IDs (userId:reach format) - user_id already in streamId', () => {
    // For 2-part format userId:reach, the userId is already part of the streamId
    // So these don't need user_id to be added from viewer_id
    expect(streamRequiresUserId('user-123:followers' as UserStreamId)).toBe(false);
    expect(streamRequiresUserId('user-123:following' as UserStreamId)).toBe(false);
    expect(streamRequiresUserId('user-123:friends' as UserStreamId)).toBe(false);
    expect(streamRequiresUserId('user-123:muted' as UserStreamId)).toBe(false);
  });
});
