import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MigrationApplication } from './migration';
import * as Core from '@/core';

vi.mock('pubky-app-specs', () => ({
  baseUriBuilder: (pubky: string) => `pubky://${pubky}/pub/pubky.app/`,
}));

vi.mock('@/libs/logger', () => ({
  Logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const TEST_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Core.Pubky;

describe('MigrationApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resync', () => {
    it('should fetch muted users, feeds, and settings in parallel, and return settings', async () => {
      const mockMutedUsers = ['muted-1', 'muted-2'] as Core.Pubky[];
      const mockFeeds = [{ id: 'feed-1' }] as Core.FeedModelSchema[];
      const mockSettings = { version: 1, updatedAt: 123 } as Core.SettingsState;
      const mockLocalSettings = { version: 5, updatedAt: 500 } as Core.SettingsState;

      const fetchMutedSpy = vi.spyOn(Core.MuteApplication, 'fetchMutedUsers').mockResolvedValue(mockMutedUsers);
      const fetchFeedsSpy = vi.spyOn(Core.FeedApplication, 'fetchFeeds').mockResolvedValue(mockFeeds);
      const initSettingsSpy = vi.spyOn(Core.SettingsApplication, 'initializeSettings').mockResolvedValue(mockSettings);

      const result = await MigrationApplication.resync(TEST_PUBKY, mockLocalSettings);

      expect(fetchMutedSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY);
      expect(fetchFeedsSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY);
      expect(initSettingsSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY, mockLocalSettings);
      expect(result).toBe(mockSettings);
    });

    it('should return null when initializeSettings returns null', async () => {
      const mockLocalSettings = { version: 3, updatedAt: 300 } as Core.SettingsState;
      vi.spyOn(Core.MuteApplication, 'fetchMutedUsers').mockResolvedValue([]);
      vi.spyOn(Core.FeedApplication, 'fetchFeeds').mockResolvedValue([]);
      vi.spyOn(Core.SettingsApplication, 'initializeSettings').mockResolvedValue(null);

      const result = await MigrationApplication.resync(TEST_PUBKY, mockLocalSettings);

      expect(result).toBeNull();
    });

    it('should call fetchMutedUsers (which persists internally) even when empty', async () => {
      const mockLocalSettings = { version: 3, updatedAt: 300 } as Core.SettingsState;
      const fetchMutedSpy = vi.spyOn(Core.MuteApplication, 'fetchMutedUsers').mockResolvedValue([]);
      vi.spyOn(Core.FeedApplication, 'fetchFeeds').mockResolvedValue([]);
      vi.spyOn(Core.SettingsApplication, 'initializeSettings').mockResolvedValue(null);

      await MigrationApplication.resync(TEST_PUBKY, mockLocalSettings);

      expect(fetchMutedSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY);
    });

    it('should still call fetchMutedUsers when feeds fetch fails', async () => {
      const mockLocalSettings = { version: 3, updatedAt: 300 } as Core.SettingsState;
      const mockMutedUsers = ['muted-1'] as Core.Pubky[];
      const fetchMutedSpy = vi.spyOn(Core.MuteApplication, 'fetchMutedUsers').mockResolvedValue(mockMutedUsers);
      vi.spyOn(Core.FeedApplication, 'fetchFeeds').mockRejectedValue(new Error('feeds-500'));
      vi.spyOn(Core.SettingsApplication, 'initializeSettings').mockResolvedValue(null);

      const result = await MigrationApplication.resync(TEST_PUBKY, mockLocalSettings);

      expect(fetchMutedSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY);
      expect(result).toBeNull();
    });

    it('should not throw when muted users fetch fails, but still apply other successful results', async () => {
      const mockLocalSettings = { version: 3, updatedAt: 300 } as Core.SettingsState;
      const mockSettings = { version: 2, updatedAt: 456 } as Core.SettingsState;

      vi.spyOn(Core.MuteApplication, 'fetchMutedUsers').mockRejectedValue(new Error('homeserver-down'));
      vi.spyOn(Core.FeedApplication, 'fetchFeeds').mockResolvedValue([]);
      vi.spyOn(Core.SettingsApplication, 'initializeSettings').mockResolvedValue(mockSettings);

      const result = await MigrationApplication.resync(TEST_PUBKY, mockLocalSettings);

      expect(result).toBe(mockSettings);
    });
  });
});
