import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModerationApplication } from './moderation';
import type { Pubky } from '@/models/models.types';
import { ModerationType } from '@/models/moderation/moderation.schema';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { UserDetailsModelSchema } from '@/models/user/details/userDetails.schema';
import { LocalModerationService } from '@/services/local/moderation/moderation';
vi.mock('@/services/local/moderation/moderation', () => ({
  LocalModerationService: {
    setUnBlur: vi.fn(),
    getModerationRecords: vi.fn(),
    getModerationRecord: vi.fn(),
  },
}));

describe('ModerationApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setUnBlur', () => {
    it('should delegate to LocalModerationService', async () => {
      const id = 'author:post1';
      const spy = vi.spyOn(LocalModerationService, 'setUnBlur').mockResolvedValue(undefined);

      await ModerationApplication.setUnBlur(id);

      expect(spy).toHaveBeenCalledWith(id);
    });
  });

  describe('enrichPostsWithModeration', () => {
    it('should return not moderated when no record exists', async () => {
      const posts: PostDetailsModelSchema[] = [
        {
          id: 'author:post1',
          content: 'Test content',
          kind: 'short',
          indexed_at: 123456,
          uri: 'pubky://author/pub/pubky.app/posts/post1',
          attachments: [],
        },
      ];

      vi.spyOn(LocalModerationService, 'getModerationRecords').mockResolvedValue([]);

      const result = await ModerationApplication.enrichPostsWithModeration(posts, false);

      expect(result).toEqual([{ ...posts[0], is_moderated: false, is_blurred: false }]);
    });

    it('should return blurred when post is moderated and is_blurred is true', async () => {
      const posts: PostDetailsModelSchema[] = [
        {
          id: 'author:post1',
          content: 'Test content',
          kind: 'short',
          indexed_at: 123456,
          uri: 'pubky://author/pub/pubky.app/posts/post1',
          attachments: [],
        },
      ];

      vi.spyOn(LocalModerationService, 'getModerationRecords').mockResolvedValue([
        { id: posts[0].id, type: ModerationType.POST, is_blurred: true, created_at: Date.now() },
      ]);

      const result = await ModerationApplication.enrichPostsWithModeration(posts, false);

      expect(result).toEqual([{ ...posts[0], is_moderated: true, is_blurred: true }]);
    });

    it('should return not blurred when post is moderated but is_blurred is false', async () => {
      const posts: PostDetailsModelSchema[] = [
        {
          id: 'author:post1',
          content: 'Test content',
          kind: 'short',
          indexed_at: 123456,
          uri: 'pubky://author/pub/pubky.app/posts/post1',
          attachments: [],
        },
      ];

      vi.spyOn(LocalModerationService, 'getModerationRecords').mockResolvedValue([
        { id: posts[0].id, type: ModerationType.POST, is_blurred: false, created_at: Date.now() },
      ]);

      const result = await ModerationApplication.enrichPostsWithModeration(posts, false);

      expect(result).toEqual([{ ...posts[0], is_moderated: true, is_blurred: false }]);
    });

    it('should return not blurred when blur is disabled globally', async () => {
      const posts: PostDetailsModelSchema[] = [
        {
          id: 'author:post1',
          content: 'Test content',
          kind: 'short',
          indexed_at: 123456,
          uri: 'pubky://author/pub/pubky.app/posts/post1',
          attachments: [],
        },
      ];

      vi.spyOn(LocalModerationService, 'getModerationRecords').mockResolvedValue([
        { id: posts[0].id, type: ModerationType.POST, is_blurred: true, created_at: Date.now() },
      ]);

      const result = await ModerationApplication.enrichPostsWithModeration(posts, true); // blur disabled

      expect(result).toEqual([{ ...posts[0], is_moderated: true, is_blurred: false }]);
    });

    it('should use single batch query for multiple posts with POST type filter', async () => {
      const posts: PostDetailsModelSchema[] = [
        {
          id: 'author:post1',
          content: 'Content 1',
          kind: 'short',
          indexed_at: 123456,
          uri: 'pubky://author/pub/pubky.app/posts/post1',
          attachments: [],
        },
        {
          id: 'author:post2',
          content: 'Content 2',
          kind: 'short',
          indexed_at: 123457,
          uri: 'pubky://author/pub/pubky.app/posts/post2',
          attachments: [],
        },
      ];

      const getModerationRecordsSpy = vi
        .spyOn(LocalModerationService, 'getModerationRecords')
        .mockResolvedValue([
          { id: 'author:post1', type: ModerationType.POST, is_blurred: true, created_at: Date.now() },
        ]);

      const result = await ModerationApplication.enrichPostsWithModeration(posts, false);

      expect(getModerationRecordsSpy).toHaveBeenCalledWith(['author:post1', 'author:post2'], ModerationType.POST);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ ...posts[0], is_moderated: true, is_blurred: true });
      expect(result[1]).toEqual({ ...posts[1], is_moderated: false, is_blurred: false });
    });

    it('should return empty array for empty input', async () => {
      const result = await ModerationApplication.enrichPostsWithModeration([], false);

      expect(result).toEqual([]);
    });

    it('should handle mixed moderation states', async () => {
      const posts: PostDetailsModelSchema[] = [
        {
          id: 'author:post1',
          content: 'Moderated but unblurred',
          kind: 'short',
          indexed_at: 123456,
          uri: 'pubky://author/pub/pubky.app/posts/post1',
          attachments: [],
        },
        {
          id: 'author:post2',
          content: 'Moderated and blurred',
          kind: 'short',
          indexed_at: 123457,
          uri: 'pubky://author/pub/pubky.app/posts/post2',
          attachments: [],
        },
        {
          id: 'author:post3',
          content: 'Not moderated',
          kind: 'short',
          indexed_at: 123458,
          uri: 'pubky://author/pub/pubky.app/posts/post3',
          attachments: [],
        },
      ];

      vi.spyOn(LocalModerationService, 'getModerationRecords').mockResolvedValue([
        { id: 'author:post1', type: ModerationType.POST, is_blurred: false, created_at: Date.now() },
        { id: 'author:post2', type: ModerationType.POST, is_blurred: true, created_at: Date.now() },
      ]);

      const result = await ModerationApplication.enrichPostsWithModeration(posts, false);

      expect(result[0].is_moderated).toBe(true);
      expect(result[0].is_blurred).toBe(false);
      expect(result[1].is_moderated).toBe(true);
      expect(result[1].is_blurred).toBe(true);
      expect(result[2].is_moderated).toBe(false);
      expect(result[2].is_blurred).toBe(false);
    });
  });

  describe('enrichUsersWithModeration', () => {
    const createMockUser = (id: string): UserDetailsModelSchema => ({
      id: id as Pubky,
      name: 'Test User',
      bio: 'Test bio',
      image: null,
      links: [],
      status: null,
      indexed_at: 123456,
    });

    it('should return not moderated when no record exists', async () => {
      const users = [createMockUser('pk:user1')];

      vi.spyOn(LocalModerationService, 'getModerationRecords').mockResolvedValue([]);

      const result = await ModerationApplication.enrichUsersWithModeration(users, false);

      expect(result).toEqual([{ ...users[0], is_moderated: false, is_blurred: false }]);
    });

    it('should return blurred when user is moderated and is_blurred is true', async () => {
      const users = [createMockUser('pk:user1')];

      vi.spyOn(LocalModerationService, 'getModerationRecords').mockResolvedValue([
        { id: 'pk:user1', type: ModerationType.PROFILE, is_blurred: true, created_at: Date.now() },
      ]);

      const result = await ModerationApplication.enrichUsersWithModeration(users, false);

      expect(result).toEqual([{ ...users[0], is_moderated: true, is_blurred: true }]);
    });

    it('should return not blurred when user is moderated but is_blurred is false', async () => {
      const users = [createMockUser('pk:user1')];

      vi.spyOn(LocalModerationService, 'getModerationRecords').mockResolvedValue([
        { id: 'pk:user1', type: ModerationType.PROFILE, is_blurred: false, created_at: Date.now() },
      ]);

      const result = await ModerationApplication.enrichUsersWithModeration(users, false);

      expect(result).toEqual([{ ...users[0], is_moderated: true, is_blurred: false }]);
    });

    it('should return not blurred when blur is disabled globally', async () => {
      const users = [createMockUser('pk:user1')];

      vi.spyOn(LocalModerationService, 'getModerationRecords').mockResolvedValue([
        { id: 'pk:user1', type: ModerationType.PROFILE, is_blurred: true, created_at: Date.now() },
      ]);

      const result = await ModerationApplication.enrichUsersWithModeration(users, true); // blur disabled

      expect(result).toEqual([{ ...users[0], is_moderated: true, is_blurred: false }]);
    });

    it('should filter by PROFILE type when calling getModerationRecords', async () => {
      const users = [createMockUser('pk:user1'), createMockUser('pk:user2')];

      const getModerationRecordsSpy = vi.spyOn(LocalModerationService, 'getModerationRecords').mockResolvedValue([]);

      await ModerationApplication.enrichUsersWithModeration(users, false);

      expect(getModerationRecordsSpy).toHaveBeenCalledWith(['pk:user1', 'pk:user2'], ModerationType.PROFILE);
    });

    it('should return empty array for empty input', async () => {
      const result = await ModerationApplication.enrichUsersWithModeration([], false);

      expect(result).toEqual([]);
    });

    it('should handle mixed moderation states', async () => {
      const users = [createMockUser('pk:user1'), createMockUser('pk:user2'), createMockUser('pk:user3')];

      vi.spyOn(LocalModerationService, 'getModerationRecords').mockResolvedValue([
        { id: 'pk:user1', type: ModerationType.PROFILE, is_blurred: false, created_at: Date.now() },
        { id: 'pk:user2', type: ModerationType.PROFILE, is_blurred: true, created_at: Date.now() },
      ]);

      const result = await ModerationApplication.enrichUsersWithModeration(users, false);

      expect(result[0].is_moderated).toBe(true);
      expect(result[0].is_blurred).toBe(false);
      expect(result[1].is_moderated).toBe(true);
      expect(result[1].is_blurred).toBe(true);
      expect(result[2].is_moderated).toBe(false);
      expect(result[2].is_blurred).toBe(false);
    });
  });

  describe('getModerationStatus', () => {
    it('should return not moderated when no record exists', async () => {
      vi.spyOn(LocalModerationService, 'getModerationRecord').mockResolvedValue(null);

      const result = await ModerationApplication.getModerationStatus('author:post1', ModerationType.POST, false);

      expect(result).toEqual({ is_moderated: false, is_blurred: false });
    });

    it('should return moderated and blurred when record exists with is_blurred true', async () => {
      vi.spyOn(LocalModerationService, 'getModerationRecord').mockResolvedValue({
        id: 'author:post1',
        type: ModerationType.POST,
        is_blurred: true,
        created_at: Date.now(),
      });

      const result = await ModerationApplication.getModerationStatus('author:post1', ModerationType.POST, false);

      expect(result).toEqual({ is_moderated: true, is_blurred: true });
    });

    it('should return not blurred when blur is disabled globally', async () => {
      vi.spyOn(LocalModerationService, 'getModerationRecord').mockResolvedValue({
        id: 'author:post1',
        type: ModerationType.POST,
        is_blurred: true,
        created_at: Date.now(),
      });

      const result = await ModerationApplication.getModerationStatus(
        'author:post1',
        ModerationType.POST,
        true, // blur disabled
      );

      expect(result).toEqual({ is_moderated: true, is_blurred: false });
    });
  });
});
