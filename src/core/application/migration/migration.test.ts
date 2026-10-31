import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkApplication } from '@/application/bookmark/bookmark';
import { FeedApplication } from '@/application/feed/feed';
import { MuteApplication } from '@/application/mute/mute';
import { SettingsApplication } from '@/application/settings/settings';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { Pubky } from '@/models/models.types';
import type { SettingsState } from '@/stores/settings/settings.types';
import { MigrationApplication } from './migration';

vi.mock('pubky-app-specs', () => ({
  baseUriBuilder: (pubky: string) => `pubky://${pubky}/pub/pubky.app/`,
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const TEST_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;

describe('MigrationApplication', () => {
  let fetchBookmarksSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchBookmarksSpy = vi.spyOn(BookmarkApplication, 'fetchBookmarks').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resync', () => {
    it('should fetch muted users, feeds, settings and bookmarks in parallel, and return settings', async () => {
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
      expect(fetchBookmarksSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY);
      expect(result).toBe(mockSettings);
    });

    it('still returns the settings when the bookmarks fetch fails', async () => {
      const mockSettings = { version: 2, updatedAt: 456 } as SettingsState;
      vi.spyOn(MuteApplication, 'fetchMutedUsers').mockResolvedValue([]);
      vi.spyOn(FeedApplication, 'fetchFeeds').mockResolvedValue([]);
      vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(mockSettings);
      fetchBookmarksSpy.mockRejectedValue(new Error('bookmarks-500'));

      const result = await MigrationApplication.resync(TEST_PUBKY, { version: 3, updatedAt: 300 } as SettingsState);

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
