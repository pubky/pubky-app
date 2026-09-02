import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { buildUserCompositeId } from '@/models/stream/user/userStream.helper';
import { type UserStreamId, UserStreamTypes } from '@/models/stream/user/userStream.types';
import { UserStreamReach, UserStreamTimeframe } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { asInvalid } from '@/test-utils/type-assertions';
import { NexusUserStreamService } from './userStream';
import { buildUserStreamBodyUrl, userStreamApi } from './userStream.api';

vi.mock('@/services/nexus/nexus.utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/nexus/nexus.utils')>()),
  queryNexus: vi.fn(),
}));

describe('Users Stream API - Error Control', () => {
  const mockUserId = 'erztyis9oiaho93ckucetcf5xnxacecqwhbst5hnd7mmkf69dhby';
  const mockViewerId = 'viewer-pubky-id';
  const mockUsername = 'testuser';
  const mockUserIds = ['user1-pubky', 'user2-pubky', 'user3-pubky'];

  describe('Parameter validation', () => {
    it('should handle undefined and null values correctly', () => {
      const url = userStreamApi.followers({
        user_id: mockUserId,
        viewer_id: undefined,
        skip: asInvalid<number>(null),
        limit: undefined,
      });

      expect(url).toContain('source=followers');
      expect(url).toContain(`user_id=${mockUserId}`);
      expect(url).not.toContain('viewer_id=');
      expect(url).not.toContain('skip=');
      expect(url).not.toContain('limit=');
    });

    it('should handle empty username gracefully', () => {
      const url = userStreamApi.username({
        username: '',
        viewer_id: mockViewerId,
      });

      expect(url).toContain('v0/stream/users/username?');
      expect(url).toContain('username=');
      expect(url).toContain(`viewer_id=${mockViewerId}`);
    });

    it('should handle missing required parameters', () => {
      // This should not throw but generate URL with missing required params
      const url = userStreamApi.followers({
        user_id: mockUserId,
      });

      expect(url).toContain('source=followers');
      expect(url).toContain(`user_id=${mockUserId}`);
    });
  });

  describe('Username endpoint error handling', () => {
    it('should handle special characters in username', () => {
      const specialUsername = 'user@domain.com';
      const url = userStreamApi.username({
        username: specialUsername,
        viewer_id: mockViewerId,
      });

      expect(url).toContain('v0/stream/users/username?');
      expect(url).toContain(`username=${encodeURIComponent(specialUsername)}`);
    });

    it('should handle long usernames', () => {
      const longUsername = 'a'.repeat(100);
      const url = userStreamApi.username({
        username: longUsername,
        viewer_id: mockViewerId,
      });

      expect(url).toContain(`username=${encodeURIComponent(longUsername)}`);
    });

    it('should handle username with spaces', () => {
      const usernameWithSpaces = 'user name with spaces';
      const url = userStreamApi.username({
        username: usernameWithSpaces,
        viewer_id: mockViewerId,
      });

      // URLSearchParams uses + for spaces, not %20
      expect(url).toContain('username=user+name+with+spaces');
    });
  });

  describe('Users by IDs endpoint error handling', () => {
    it('should handle empty user IDs array', () => {
      const request = userStreamApi.usersByIds({
        user_ids: [],
      });

      expect(request.url).toMatch('v0/stream/users/by_ids');
      expect(request.body.user_ids).toEqual([]);
      expect(request.body).not.toHaveProperty('viewer_id');
      expect(request.body).not.toHaveProperty('depth');
    });

    it('should handle large array of user IDs', () => {
      const largeUserIds = Array.from({ length: 1000 }, (_, i) => `user-${i}-pubky`);
      const request = userStreamApi.usersByIds({
        user_ids: largeUserIds,
        viewer_id: mockViewerId,
        depth: 3,
      });

      expect(request.url).toMatch('v0/stream/users/by_ids');
      expect(request.body.user_ids).toHaveLength(1000);
      expect(request.body.viewer_id).toBe(mockViewerId);
      expect(request.body.depth).toBe(3);
    });

    it('should handle depth parameter validation', () => {
      const request = userStreamApi.usersByIds({
        user_ids: mockUserIds,
        depth: 0,
      });

      expect(request.body.depth).toBe(0);
    });

    it('should handle negative depth values', () => {
      const request = userStreamApi.usersByIds({
        user_ids: mockUserIds,
        depth: -1,
      });

      expect(request.body.depth).toBe(-1);
    });

    it('should handle very large depth values', () => {
      const request = userStreamApi.usersByIds({
        user_ids: mockUserIds,
        depth: 999,
      });

      expect(request.body.depth).toBe(999);
    });
  });

  describe('URL structure validation', () => {
    it('should generate correct URL prefixes', () => {
      const followersUrl = userStreamApi.followers({ user_id: mockUserId });
      const usernameUrl = userStreamApi.username({ username: mockUsername });
      const usersByIdsRequest = userStreamApi.usersByIds({ user_ids: mockUserIds });

      expect(followersUrl).toMatch(/stream\/users\/ids\?/);
      expect(usernameUrl).toMatch(/stream\/users\/username\?/);
      expect(usersByIdsRequest.url).toMatch(/stream\/users\/by_ids$/);
    });

    it('should handle special characters in parameters', () => {
      const specialUserId = 'user@domain.com#special';
      const url = userStreamApi.followers({
        user_id: specialUserId,
        viewer_id: mockViewerId,
      });

      expect(url).toContain(`user_id=${encodeURIComponent(specialUserId)}`);
    });
  });

  describe('Edge cases and boundary conditions', () => {
    it('should handle maximum numeric values', () => {
      const url = userStreamApi.followers({
        user_id: mockUserId,
        skip: Number.MAX_SAFE_INTEGER,
        limit: Number.MAX_SAFE_INTEGER,
      });

      expect(url).toContain(`skip=${Number.MAX_SAFE_INTEGER}`);
      expect(url).toContain(`limit=${Number.MAX_SAFE_INTEGER}`);
    });

    it('should handle zero values', () => {
      const url = userStreamApi.followers({
        user_id: mockUserId,
        skip: 0,
        limit: 0,
      });

      expect(url).toContain('skip=0');
      expect(url).toContain('limit=0');
    });

    it('should handle negative numeric values (should be filtered out)', () => {
      const url = userStreamApi.followers({
        user_id: mockUserId,
        skip: -1,
        limit: -5,
      });

      // Negative values should be filtered out by the buildUserStreamUrl function
      expect(url).not.toContain('skip=');
      expect(url).not.toContain('limit=');
    });
  });

  describe('Type safety validation', () => {
    it('should handle boolean preview parameter correctly', () => {
      const url = userStreamApi.followers({
        user_id: mockUserId,
        preview: true,
      });

      expect(url).toContain('preview=true');
    });

    it('should handle enum values correctly', () => {
      const url = userStreamApi.influencers({
        user_id: mockUserId,
        reach: UserStreamReach.FOLLOWERS,
        timeframe: UserStreamTimeframe.THIS_MONTH,
      });

      expect(url).toContain('reach=followers');
      expect(url).toContain('timeframe=this_month');
    });
  });

  describe('buildUserStreamBodyUrl function', () => {
    it('should handle missing optional parameters', () => {
      const body = buildUserStreamBodyUrl({
        user_ids: mockUserIds,
      });

      expect(body).toEqual({
        user_ids: mockUserIds,
      });
      expect(body).not.toHaveProperty('viewer_id');
      expect(body).not.toHaveProperty('depth');
    });

    it('should handle all parameters provided', () => {
      const body = buildUserStreamBodyUrl({
        user_ids: mockUserIds,
        viewer_id: mockViewerId,
        depth: 2,
      });

      expect(body).toEqual({
        user_ids: mockUserIds,
        viewer_id: mockViewerId,
        depth: 2,
      });
    });

    it('should handle depth as 0', () => {
      const body = buildUserStreamBodyUrl({
        user_ids: mockUserIds,
        depth: 0,
      });

      expect(body.depth).toBe(0);
    });
  });

  describe('Query parameter encoding for special characters (username endpoint)', () => {
    // Note: username is handled as a query parameter, not a path segment
    // These tests verify URLSearchParams encoding behavior
    it('should encode spaces in username query param', () => {
      const url = userStreamApi.username({ username: 'user name' });
      // URLSearchParams uses + for spaces in query params
      expect(url).toContain('username=user+name');
    });

    it('should encode hash (#) in username query param', () => {
      const url = userStreamApi.username({ username: 'user#123' });
      expect(url).toContain('username=user%23123');
    });

    it('should encode ampersand (&) in username query param', () => {
      const url = userStreamApi.username({ username: 'rock&roll' });
      expect(url).toContain('username=rock%26roll');
    });

    it('should encode equals (=) in username query param', () => {
      const url = userStreamApi.username({ username: 'user=name' });
      expect(url).toContain('username=user%3Dname');
    });

    it('should encode percent (%) in username query param', () => {
      const url = userStreamApi.username({ username: '100%' });
      expect(url).toContain('username=100%25');
    });

    it('should encode forward slash (/) in username query param', () => {
      const url = userStreamApi.username({ username: 'user/name' });
      expect(url).toContain('username=user%2Fname');
    });
  });

  describe('UserStreamApiEndpoint type', () => {
    it('should have exactly 11 endpoints', () => {
      const endpointKeys = Object.keys(userStreamApi);
      expect(endpointKeys).toHaveLength(11);
      expect(endpointKeys).toContain('followers');
      expect(endpointKeys).toContain('following');
      expect(endpointKeys).toContain('friends');
      expect(endpointKeys).toContain('recommended');
      expect(endpointKeys).toContain('influencers');
      expect(endpointKeys).toContain('postReplies');
      expect(endpointKeys).toContain('friendsWithDepth');
      expect(endpointKeys).toContain('mostFollowed');
      expect(endpointKeys).toContain('starterPack');
      expect(endpointKeys).toContain('username');
      expect(endpointKeys).toContain('usersByIds');
    });
  });
});

describe('NexusUserStreamService.fetch', () => {
  const mockUserId = 'erztyis9oiaho93ckucetcf5xnxacecqwhbst5hnd7mmkf69dhby';

  describe('streamId parsing and routing', () => {
    it('should parse followers composite streamId correctly', () => {
      const streamId = buildUserCompositeId({ userId: 'user-123', reach: 'followers' });
      const streamParts = streamId.split(':');

      expect(streamParts[0]).toBe('user-123');
      expect(streamParts[1]).toBe('followers');
    });

    it('should parse following composite streamId correctly', () => {
      const streamId = buildUserCompositeId({ userId: 'user-456', reach: 'following' });
      const streamParts = streamId.split(':');

      expect(streamParts[0]).toBe('user-456');
      expect(streamParts[1]).toBe('following');
    });

    it('should parse friends composite streamId correctly', () => {
      const streamId = buildUserCompositeId({ userId: 'user-789', reach: 'friends' });
      const streamParts = streamId.split(':');

      expect(streamParts[0]).toBe('user-789');
      expect(streamParts[1]).toBe('friends');
    });

    it('should parse influencers enum streamId correctly', () => {
      const streamId = UserStreamTypes.TODAY_INFLUENCERS_ALL;
      const streamParts = streamId.split(':');

      expect(streamParts[0]).toBe('influencers');
      expect(streamParts[1]).toBe('today');
      expect(streamParts[2]).toBe('all');
    });
  });

  describe('URL generation via userStreamApi', () => {
    it('should generate correct followers URL', () => {
      const url = userStreamApi.followers({
        user_id: mockUserId,
        skip: 0,
        limit: 10,
      });

      expect(url).toContain('v0/stream/users/ids?');
      expect(url).toContain('source=followers');
      expect(url).toContain(`user_id=${mockUserId}`);
      expect(url).toContain('skip=0');
      expect(url).toContain('limit=10');
    });

    it('should generate correct following URL', () => {
      const url = userStreamApi.following({
        user_id: mockUserId,
        skip: 0,
        limit: 10,
      });

      expect(url).toContain('v0/stream/users/ids?');
      expect(url).toContain('source=following');
      expect(url).toContain(`user_id=${mockUserId}`);
      expect(url).toContain('skip=0');
      expect(url).toContain('limit=10');
    });

    it('should generate correct friends URL', () => {
      const url = userStreamApi.friends({
        user_id: mockUserId,
        skip: 5,
        limit: 20,
      });

      expect(url).toContain('source=friends');
      expect(url).toContain('skip=5');
      expect(url).toContain('limit=20');
    });

    it('should generate correct recommended URL', () => {
      const url = userStreamApi.recommended({
        user_id: mockUserId,
        skip: 0,
        limit: 10,
      });

      expect(url).toContain('source=recommended');
    });

    it('should generate correct starter pack URL with ordered comma-joined tags', () => {
      const url = userStreamApi.starterPack({
        tags: 'bitcoin,music',
        viewer_id: mockUserId,
        skip: 0,
        limit: 10,
      });

      expect(url).toContain('v0/stream/users/ids?');
      expect(url).toContain('source=starter_pack');
      // URLSearchParams encodes the comma; order must be preserved
      expect(url).toContain('tags=bitcoin%2Cmusic');
      expect(url).toContain(`viewer_id=${mockUserId}`);
      expect(url).toContain('skip=0');
      expect(url).toContain('limit=10');
    });

    it('should generate distinct starter pack URLs for reversed tag orders', () => {
      const forward = userStreamApi.starterPack({ tags: 'travel,music' });
      const reversed = userStreamApi.starterPack({ tags: 'music,travel' });

      expect(forward).toContain('tags=travel%2Cmusic');
      expect(reversed).toContain('tags=music%2Ctravel');
      expect(forward).not.toBe(reversed);
    });
  });

  describe('Parameter handling', () => {
    it('should handle pagination parameters', () => {
      const url = userStreamApi.followers({
        user_id: mockUserId,
        skip: 10,
        limit: 20,
      });

      expect(url).toContain('skip=10');
      expect(url).toContain('limit=20');
    });

    it('should handle zero skip', () => {
      const url = userStreamApi.followers({
        user_id: mockUserId,
        skip: 0,
        limit: 5,
      });

      expect(url).toContain('skip=0');
      expect(url).toContain('limit=5');
    });

    it('should handle optional viewer_id', () => {
      const viewerId = 'viewer-pubky-id';
      const url = userStreamApi.followers({
        user_id: mockUserId,
        viewer_id: viewerId,
        skip: 0,
        limit: 10,
      });

      expect(url).toContain(`viewer_id=${viewerId}`);
    });

    it('should handle undefined viewer_id', () => {
      const url = userStreamApi.followers({
        user_id: mockUserId,
        viewer_id: undefined,
        skip: 0,
        limit: 10,
      });

      expect(url).not.toContain('viewer_id=');
    });
  });

  describe('starter pack dispatch', () => {
    beforeEach(() => {
      vi.mocked(queryNexus).mockReset();
      vi.mocked(queryNexus).mockResolvedValue([]);
    });

    it('should dispatch starter pack IDs to source=starter_pack with ordered tags', async () => {
      await NexusUserStreamService.fetch({
        streamId: 'starter_pack:all:all:bitcoin,music' as UserStreamId,
        params: { skip: 0, limit: 10, viewer_id: 'viewer-abc' as Pubky },
      });

      expect(queryNexus).toHaveBeenCalledTimes(1);
      const { url } = vi.mocked(queryNexus).mock.calls[0][0];
      expect(url).toContain('source=starter_pack');
      expect(url).toContain('tags=bitcoin%2Cmusic');
      expect(url).toContain('viewer_id=viewer-abc');
    });

    it('should reject unsupported runtime sources without querying Nexus', async () => {
      await expect(
        NexusUserStreamService.fetch({
          streamId: 'unsupported:all:all' as UserStreamId,
          params: { skip: 0, limit: 10 },
        }),
      ).rejects.toMatchObject({
        category: ErrorCategory.Validation,
        code: ValidationErrorCode.INVALID_INPUT,
      });

      expect(queryNexus).not.toHaveBeenCalled();
    });
  });

  describe('URL structure validation', () => {
    it('should always start with v0/stream/users/ids?', () => {
      const url = userStreamApi.followers({
        user_id: mockUserId,
        skip: 0,
        limit: 10,
      });

      expect(url).toMatch(/v0\/stream\/users\/ids\?/);
    });

    it('should have proper query parameter format', () => {
      const url = userStreamApi.following({
        user_id: mockUserId,
        skip: 0,
        limit: 10,
      });

      expect(url).toMatch(/source=following/);
      expect(url).toMatch(/user_id=/);
      expect(url).toMatch(/skip=0/);
      expect(url).toMatch(/limit=10/);
    });
  });
});
