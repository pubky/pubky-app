import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModerationController } from './moderation';
import { ModerationApplication } from '@/application/moderation/moderation';
import type { EnrichedPostDetails, EnrichedUserDetails } from '@/application/moderation/moderation.types';
import type { Pubky } from '@/models/models.types';
import { ModerationType } from '@/models/moderation/moderation.schema';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { UserDetailsModelSchema } from '@/models/user/details/userDetails.schema';
import { useSettingsStore } from '@/stores/settings/settings.store';
import type { SettingsStore } from '@/stores/settings/settings.types';
vi.mock('@/application/moderation/moderation', () => ({
  ModerationApplication: {
    setUnBlur: vi.fn(),
    enrichPostsWithModeration: vi.fn(),
    enrichUsersWithModeration: vi.fn(),
    getModerationStatus: vi.fn(),
  },
}));

describe('ModerationController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('unBlur', () => {
    it('should call ModerationApplication.setUnBlur', async () => {
      const id = 'author:post1';
      const spy = vi.spyOn(ModerationApplication, 'setUnBlur').mockResolvedValue(undefined);

      await ModerationController.unBlur(id);

      expect(spy).toHaveBeenCalledWith(id);
    });

    it('should work for both posts and profiles', async () => {
      const spy = vi.spyOn(ModerationApplication, 'setUnBlur').mockResolvedValue(undefined);

      await ModerationController.unBlur('author:post1');
      await ModerationController.unBlur('pk:user1');

      expect(spy).toHaveBeenCalledWith('author:post1');
      expect(spy).toHaveBeenCalledWith('pk:user1');
    });
  });

  describe('enrichPosts', () => {
    it('should pass isBlurDisabledGlobally from settings store', async () => {
      const posts: PostDetailsModelSchema[] = [
        {
          id: 'author:post1',
          content: 'Content 1',
          kind: 'short',
          indexed_at: 123456,
          uri: 'pubky://author/pub/pubky.app/posts/post1',
          attachments: [],
        },
      ];

      const enrichedPosts: EnrichedPostDetails[] = [{ ...posts[0], is_moderated: true, is_blurred: true }];

      vi.spyOn(useSettingsStore, 'getState').mockReturnValue({
        privacy: { blurCensored: true },
      } as Partial<SettingsStore> as SettingsStore);
      const enrichSpy = vi.spyOn(ModerationApplication, 'enrichPostsWithModeration').mockResolvedValue(enrichedPosts);

      const result = await ModerationController.enrichPosts(posts);

      expect(result).toEqual(enrichedPosts);
      expect(enrichSpy).toHaveBeenCalledWith(posts, false); // blurCensored: true means isBlurDisabledGlobally: false
    });

    it('should handle empty array', async () => {
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue({
        privacy: { blurCensored: true },
      } as Partial<SettingsStore> as SettingsStore);
      const enrichSpy = vi.spyOn(ModerationApplication, 'enrichPostsWithModeration').mockResolvedValue([]);

      const result = await ModerationController.enrichPosts([]);

      expect(result).toEqual([]);
      expect(enrichSpy).toHaveBeenCalledWith([], false);
    });
  });

  describe('enrichUsers', () => {
    it('should pass isBlurDisabledGlobally from settings store', async () => {
      const users: UserDetailsModelSchema[] = [
        {
          id: 'pk:user1' as Pubky,
          name: 'Test User',
          bio: 'Test bio',
          image: null,
          links: [],
          status: null,
          indexed_at: 123456,
        },
      ];

      const enrichedUsers: EnrichedUserDetails[] = [{ ...users[0], is_moderated: true, is_blurred: true }];

      vi.spyOn(useSettingsStore, 'getState').mockReturnValue({
        privacy: { blurCensored: true },
      } as Partial<SettingsStore> as SettingsStore);
      const enrichSpy = vi.spyOn(ModerationApplication, 'enrichUsersWithModeration').mockResolvedValue(enrichedUsers);

      const result = await ModerationController.enrichUsers(users);

      expect(result).toEqual(enrichedUsers);
      expect(enrichSpy).toHaveBeenCalledWith(users, false); // blurCensored: true means isBlurDisabledGlobally: false
    });

    it('should handle blur disabled globally', async () => {
      const users: UserDetailsModelSchema[] = [
        {
          id: 'pk:user1' as Pubky,
          name: 'Test User',
          bio: 'Test bio',
          image: null,
          links: [],
          status: null,
          indexed_at: 123456,
        },
      ];

      vi.spyOn(useSettingsStore, 'getState').mockReturnValue({
        privacy: { blurCensored: false },
      } as Partial<SettingsStore> as SettingsStore);
      const enrichSpy = vi.spyOn(ModerationApplication, 'enrichUsersWithModeration').mockResolvedValue([]);

      await ModerationController.enrichUsers(users);

      expect(enrichSpy).toHaveBeenCalledWith(users, true); // blurCensored: false means isBlurDisabledGlobally: true
    });

    it('should handle empty array', async () => {
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue({
        privacy: { blurCensored: true },
      } as Partial<SettingsStore> as SettingsStore);
      const enrichSpy = vi.spyOn(ModerationApplication, 'enrichUsersWithModeration').mockResolvedValue([]);

      const result = await ModerationController.enrichUsers([]);

      expect(result).toEqual([]);
      expect(enrichSpy).toHaveBeenCalledWith([], false);
    });
  });

  describe('getModerationStatus', () => {
    it('should call ModerationApplication.getModerationStatus with correct params for POST', async () => {
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue({
        privacy: { blurCensored: true },
      } as Partial<SettingsStore> as SettingsStore);
      const spy = vi
        .spyOn(ModerationApplication, 'getModerationStatus')
        .mockResolvedValue({ is_moderated: true, is_blurred: true });

      const result = await ModerationController.getModerationStatus('author:post1', ModerationType.POST);

      expect(spy).toHaveBeenCalledWith('author:post1', ModerationType.POST, false);
      expect(result).toEqual({ is_moderated: true, is_blurred: true });
    });

    it('should call ModerationApplication.getModerationStatus with correct params for PROFILE', async () => {
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue({
        privacy: { blurCensored: false },
      } as Partial<SettingsStore> as SettingsStore);
      const spy = vi
        .spyOn(ModerationApplication, 'getModerationStatus')
        .mockResolvedValue({ is_moderated: true, is_blurred: false });

      const result = await ModerationController.getModerationStatus('pk:user1', ModerationType.PROFILE);

      expect(spy).toHaveBeenCalledWith('pk:user1', ModerationType.PROFILE, true);
      expect(result).toEqual({ is_moderated: true, is_blurred: false });
    });

    it('should return not moderated status', async () => {
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue({
        privacy: { blurCensored: true },
      } as Partial<SettingsStore> as SettingsStore);
      vi.spyOn(ModerationApplication, 'getModerationStatus').mockResolvedValue({
        is_moderated: false,
        is_blurred: false,
      });

      const result = await ModerationController.getModerationStatus('pk:user1', ModerationType.PROFILE);

      expect(result).toEqual({ is_moderated: false, is_blurred: false });
    });
  });
});
