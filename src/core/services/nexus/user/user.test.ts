import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEXUS_URL } from '@/config/nexus';
import type { Pubky } from '@/models/models.types';
import type { NexusTag, NexusUserDetails, TUserId } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { NexusUserService } from '@/services/nexus/user/user';
import { buildUrlWithQuery } from '../nexus.utils';
import { userApi } from './user.api';
import {
  TUserPaginationParams,
  TUserRelationshipParams,
  TUserTaggersParams,
  TUserTagsParams,
  TUserViewParams,
  USER_PATH_PARAMS,
} from './user.types';

vi.mock('@/services/nexus/nexus.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/nexus/nexus.utils')>();
  return {
    ...actual,
    queryNexus: vi.fn(),
  };
});

const mockQueryNexus = vi.mocked(queryNexus);

const testUserId = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';
const testViewerId = 'viewer123';

describe('User API', () => {
  describe('buildUrlWithQuery (used by user API)', () => {
    it('should build URL with basic parameters', () => {
      const params: TUserViewParams = {
        user_id: testUserId,
        depth: 2,
        viewer_id: testViewerId,
      };
      const baseRoute = 'v0/user/test';

      const result = buildUrlWithQuery({ baseRoute, params, excludeKeys: USER_PATH_PARAMS });
      expect(result).toBe(`${NEXUS_URL}/v0/user/test?depth=2&viewer_id=${testViewerId}`);
    });

    it('should exclude path parameters from query string', () => {
      const params: TUserViewParams = {
        user_id: testUserId,
        depth: 1,
      };
      const baseRoute = 'v0/user/test';

      const result = buildUrlWithQuery({ baseRoute, params, excludeKeys: USER_PATH_PARAMS });
      expect(result).not.toContain('user_id=');
      expect(result).toContain('depth=1');
    });
  });

  describe('USER_API endpoints', () => {
    it('should generate correct URLs for basic endpoints', () => {
      const params: TUserId = { user_id: testUserId };

      expect(userApi.counts(params)).toBe(`${NEXUS_URL}/v0/user/${testUserId}/counts`);
      expect(userApi.details(params)).toBe(`${NEXUS_URL}/v0/user/${testUserId}/details`);
    });

    it('should generate correct URLs for view endpoints', () => {
      const params: TUserViewParams = {
        user_id: testUserId,
        depth: 2,
        viewer_id: testViewerId,
      };

      expect(userApi.view(params)).toBe(`${NEXUS_URL}/v0/user/${testUserId}?depth=2&viewer_id=${testViewerId}`);
      expect(userApi.followers(params)).toBe(
        `${NEXUS_URL}/v0/user/${testUserId}/followers?depth=2&viewer_id=${testViewerId}`,
      );
      expect(userApi.following(params)).toBe(
        `${NEXUS_URL}/v0/user/${testUserId}/following?depth=2&viewer_id=${testViewerId}`,
      );
    });

    it('should generate correct URLs for relationship endpoint', () => {
      const params: TUserRelationshipParams = {
        user_id: testUserId,
        viewer_id: testViewerId,
      };

      expect(userApi.relationship(params)).toBe(`${NEXUS_URL}/v0/user/${testUserId}/relationship/${testViewerId}`);
    });

    it('should generate correct URL for friends endpoint', () => {
      const params: TUserViewParams = {
        user_id: testUserId,
        depth: 2,
        viewer_id: testViewerId,
      };

      expect(userApi.friends(params)).toBe(
        `${NEXUS_URL}/v0/user/${testUserId}/friends?depth=2&viewer_id=${testViewerId}`,
      );
    });

    it('should generate correct URL for muted endpoint', () => {
      const params: TUserViewParams = {
        user_id: testUserId,
        depth: 2,
        viewer_id: testViewerId,
      };

      expect(userApi.muted(params)).toBe(`${NEXUS_URL}/v0/user/${testUserId}/muted?depth=2&viewer_id=${testViewerId}`);
    });

    it('should generate correct URL for notifications endpoint', () => {
      const params: TUserPaginationParams = {
        user_id: testUserId,
        skip: 0,
        limit: 10,
        start: 1000,
        end: 2000,
      };

      expect(userApi.notifications(params)).toBe(
        `${NEXUS_URL}/v0/user/${testUserId}/notifications?skip=0&limit=10&start=1000&end=2000`,
      );
    });

    it('should generate correct URL for taggers endpoint', () => {
      const params: TUserTaggersParams = {
        user_id: testUserId,
        label: 'test-tag',
        skip: 0,
        limit: 10,
      };

      expect(userApi.taggers(params)).toBe(`${NEXUS_URL}/v0/user/${testUserId}/taggers/test-tag?skip=0&limit=10`);
    });

    it('should generate correct URL for tags endpoint', () => {
      const params: TUserTagsParams = {
        user_id: testUserId,
        skip_tags: 0,
        limit_tags: 10,
      };

      expect(userApi.tags(params)).toBe(`${NEXUS_URL}/v0/user/${testUserId}/tags?skip_tags=0&limit_tags=10`);
    });
  });

  describe('UserApiEndpoint type', () => {
    it('should have exactly 11 endpoints', () => {
      const endpointKeys = Object.keys(userApi);
      expect(endpointKeys).toHaveLength(11);
      expect(endpointKeys).toContain('view');
      expect(endpointKeys).toContain('counts');
      expect(endpointKeys).toContain('details');
      expect(endpointKeys).toContain('followers');
      expect(endpointKeys).toContain('following');
      expect(endpointKeys).toContain('friends');
      expect(endpointKeys).toContain('muted');
      expect(endpointKeys).toContain('notifications');
      expect(endpointKeys).toContain('relationship');
      expect(endpointKeys).toContain('taggers');
      expect(endpointKeys).toContain('tags');
    });
  });
});

describe('NexusUserService', () => {
  const testUserId = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry' as Pubky;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tags', () => {
    it('should construct correct URL and handle successful response', async () => {
      const mockTags = [
        { label: 'developer', taggers: [] as Pubky[], taggers_count: 0, relationship: false },
      ] as NexusTag[];

      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockTags);

      const result = await NexusUserService.tags({
        user_id: testUserId,
        skip_tags: 5,
        limit_tags: 20,
      });

      expect(result).toEqual(mockTags);
      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: `${NEXUS_URL}/v0/user/${testUserId}/tags?skip_tags=5&limit_tags=20`,
      });
    });
  });

  describe('taggers', () => {
    it('should construct correct URL with encoded label', async () => {
      const queryNexusSpy = mockQueryNexus.mockResolvedValue([]);

      await NexusUserService.taggers({
        user_id: testUserId,
        label: 'rust & wasm',
        skip: 10,
        limit: 5,
      });

      // Verify label is URL-encoded (& becomes %26)
      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringMatching(/\/taggers\/rust%20%26%20wasm\?skip=10&limit=5$/),
      });
    });
  });

  describe('details', () => {
    it('should construct correct URL and handle successful response', async () => {
      const mockUserDetails: NexusUserDetails = {
        id: testUserId,
        name: 'Test User',
        bio: 'Test bio',
        image: null,
        status: 'active',
        links: [],
        indexed_at: Date.now(),
      };

      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockUserDetails);

      const result = await NexusUserService.details({ user_id: testUserId });

      expect(result).toEqual(mockUserDetails);
      expect(queryNexusSpy).toHaveBeenCalledWith({ url: `${NEXUS_URL}/v0/user/${testUserId}/details` });
    });

    it('should handle user with complete profile data', async () => {
      const mockUserDetails: NexusUserDetails = {
        id: testUserId,
        name: 'Satoshi Nakamoto',
        bio: 'Bitcoin creator',
        image: '/path/to/avatar.jpg',
        status: 'Busy',
        links: [
          { title: 'Website', url: 'https://bitcoin.org' },
          { title: 'GitHub', url: 'https://github.com/bitcoin' },
        ],
        indexed_at: 1234567890,
      };

      mockQueryNexus.mockResolvedValue(mockUserDetails);

      const result = await NexusUserService.details({ user_id: testUserId });

      expect(result).toEqual(mockUserDetails);
      expect(result.name).toBe('Satoshi Nakamoto');
      expect(result.links).toHaveLength(2);
    });
  });
});
