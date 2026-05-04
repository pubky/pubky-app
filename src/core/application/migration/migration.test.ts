import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MigrationApplication } from './migration';
import { FeedApplication } from '@/application/feed/feed';
import { MuteApplication } from '@/application/mute/mute';
import { SettingsApplication } from '@/application/settings/settings';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { Pubky } from '@/models/models.types';
import type { SettingsState } from '@/stores/settings/settings.types';
vi.mock('pubky-app-specs', () => ({
  baseUriBuilder: (pubky: string) => `pubky://${pubky}/pub/pubky.app/`,
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const TEST_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;

describe('MigrationApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resync', () => {
    it('should fetch muted users, feeds, and settings in parallel, and return settings', async () => {
      const mockMutedUsers = ['muted-1', 'muted-2'] as Pubky[];
      const mockFeeds = [{ id: 'feed-1' }] as FeedModelSchema[];
      const mockSettings = { version: 1, updatedAt: 123 } as SettingsState;
      const mockLocalSettings = { version: 5, updatedAt: 500 } as SettingsState;

      const fetchMutedSpy = vi.spyOn(MuteApplication, 'fetchMutedUsers').mockResolvedValue(mockMutedUsers);
      const fetchFeedsSpy = vi.spyOn(FeedApplication, 'fetchFeeds').mockResolvedValue(mockFeeds);
      const initSettingsSpy = vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(mockSettings);

      const result = await MigrationApplication.resync(TEST_PUBKY, mockLocalSettings);

      expect(fetchMutedSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY);
      expect(fetchFeedsSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY);
      expect(initSettingsSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY, mockLocalSettings);
      expect(result).toBe(mockSettings);
    });

    it('should return null when initializeSettings returns null', async () => {
      const mockLocalSettings = { version: 3, updatedAt: 300 } as SettingsState;
      vi.spyOn(MuteApplication, 'fetchMutedUsers').mockResolvedValue([]);
      vi.spyOn(FeedApplication, 'fetchFeeds').mockResolvedValue([]);
      vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(null);

      const result = await MigrationApplication.resync(TEST_PUBKY, mockLocalSettings);

      expect(result).toBeNull();
    });

    it('should call fetchMutedUsers (which persists internally) even when empty', async () => {
      const mockLocalSettings = { version: 3, updatedAt: 300 } as SettingsState;
      const fetchMutedSpy = vi.spyOn(MuteApplication, 'fetchMutedUsers').mockResolvedValue([]);
      vi.spyOn(FeedApplication, 'fetchFeeds').mockResolvedValue([]);
      vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(null);

      await MigrationApplication.resync(TEST_PUBKY, mockLocalSettings);

      expect(fetchMutedSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY);
    });

    it('should still call fetchMutedUsers when feeds fetch fails', async () => {
      const mockLocalSettings = { version: 3, updatedAt: 300 } as SettingsState;
      const mockMutedUsers = ['muted-1'] as Pubky[];
      const fetchMutedSpy = vi.spyOn(MuteApplication, 'fetchMutedUsers').mockResolvedValue(mockMutedUsers);
      vi.spyOn(FeedApplication, 'fetchFeeds').mockRejectedValue(new Error('feeds-500'));
      vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(null);

      const result = await MigrationApplication.resync(TEST_PUBKY, mockLocalSettings);

      expect(fetchMutedSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY);
      expect(result).toBeNull();
    });

    it('should not throw when muted users fetch fails, but still apply other successful results', async () => {
      const mockLocalSettings = { version: 3, updatedAt: 300 } as SettingsState;
      const mockSettings = { version: 2, updatedAt: 456 } as SettingsState;

      vi.spyOn(MuteApplication, 'fetchMutedUsers').mockRejectedValue(new Error('homeserver-down'));
      vi.spyOn(FeedApplication, 'fetchFeeds').mockResolvedValue([]);
      vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(mockSettings);

      const result = await MigrationApplication.resync(TEST_PUBKY, mockLocalSettings);

      expect(result).toBe(mockSettings);
    });
  });
});
