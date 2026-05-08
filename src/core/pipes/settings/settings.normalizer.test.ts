import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import { type SettingsJson, SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import {
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  type SettingsState,
} from '@/stores/settings/settings.types';
import { buildPubkyUri, restoreMocks, TEST_PUBKY } from '../pipes.test-utils';

describe('SettingsNormalizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger, 'debug').mockImplementation(() => {});
  });

  afterEach(restoreMocks);

  // Test data factory
  const createMockSettingsState = (overrides?: Partial<SettingsState>): SettingsState => ({
    notifications: defaultNotificationPreferences,
    privacy: defaultPrivacyPreferences,
    muted: [],
    language: 'en',
    updatedAt: 1700000000000,
    version: 1,
    ...overrides,
  });

  describe('extractState', () => {
    it('should extract settings state from store object', () => {
      const input = createMockSettingsState({
        muted: ['user1', 'user2'],
        language: 'es',
      });

      const result = SettingsNormalizer.extractState(input);

      expect(result).toEqual({
        notifications: input.notifications,
        privacy: input.privacy,
        muted: ['user1', 'user2'],
        language: 'es',
        updatedAt: input.updatedAt,
        version: input.version,
      });
    });

    it('should create a new object (not reference)', () => {
      const input = createMockSettingsState();
      const result = SettingsNormalizer.extractState(input);

      expect(result).not.toBe(input);
      expect(result).toEqual(input);
    });

    it('should only include settings state properties', () => {
      // Simulate a store with actions
      const storeWithActions = {
        ...createMockSettingsState(),
        setLanguage: vi.fn(),
        syncToHomeserver: vi.fn(),
      };

      const result = SettingsNormalizer.extractState(storeWithActions);

      expect(result).not.toHaveProperty('setLanguage');
      expect(result).not.toHaveProperty('syncToHomeserver');
      expect(Object.keys(result)).toHaveLength(6);
    });
  });

  describe('buildUrl', () => {
    it('should generate correct URL format', () => {
      const result = SettingsNormalizer.buildUrl(TEST_PUBKY.USER_1);

      expect(result).toBe(buildPubkyUri(TEST_PUBKY.USER_1, 'settings.json'));
    });

    it('should include pubky in URL', () => {
      const result = SettingsNormalizer.buildUrl(TEST_PUBKY.USER_1);

      expect(result).toContain(TEST_PUBKY.USER_1);
    });

    it('should end with settings.json', () => {
      const result = SettingsNormalizer.buildUrl(TEST_PUBKY.USER_1);

      expect(result).toMatch(/settings\.json$/);
    });

    it('should handle different pubkys', () => {
      const result1 = SettingsNormalizer.buildUrl(TEST_PUBKY.USER_1);
      const result2 = SettingsNormalizer.buildUrl(TEST_PUBKY.USER_2);

      expect(result1).toContain(TEST_PUBKY.USER_1);
      expect(result2).toContain(TEST_PUBKY.USER_2);
      expect(result1).not.toBe(result2);
    });
  });

  describe('to', () => {
    it('should convert settings state to normalizer result', () => {
      const settings = createMockSettingsState();

      const result = SettingsNormalizer.to(settings, TEST_PUBKY.USER_1);

      expect(result).toHaveProperty('settings');
      expect(result).toHaveProperty('meta');
    });

    it('should include all settings fields in result', () => {
      const settings = createMockSettingsState({
        language: 'fr',
      });

      const result = SettingsNormalizer.to(settings, TEST_PUBKY.USER_1);

      expect(result.settings.notifications).toEqual(settings.notifications);
      expect(result.settings.privacy).toEqual(settings.privacy);
      expect(result.settings.language).toBe('fr');
      expect(result.settings.updatedAt).toBe(settings.updatedAt);
      expect(result.settings.version).toBe(settings.version);
    });

    it('should include correct meta URL', () => {
      const settings = createMockSettingsState();

      const result = SettingsNormalizer.to(settings, TEST_PUBKY.USER_1);

      expect(result.meta.url).toBe(buildPubkyUri(TEST_PUBKY.USER_1, 'settings.json'));
    });

    it('should include correct meta path', () => {
      const settings = createMockSettingsState();

      const result = SettingsNormalizer.to(settings, TEST_PUBKY.USER_1);

      expect(result.meta.path).toBe('pub/pubky.app/settings.json');
    });

    it('should log debug message', () => {
      const settings = createMockSettingsState();

      SettingsNormalizer.to(settings, TEST_PUBKY.USER_1);

      expect(Logger.debug).toHaveBeenCalledWith('Settings normalized for homeserver', expect.any(Object));
    });
  });

  describe('from', () => {
    it('should convert full JSON to settings state', () => {
      const json: SettingsJson = {
        notifications: {
          ...defaultNotificationPreferences,
          follow: false,
        },
        privacy: {
          ...defaultPrivacyPreferences,
          blurCensored: false,
        },
        language: 'de',
        updatedAt: 1700000000000,
        version: 2,
      };

      const result = SettingsNormalizer.from(json);

      expect(result.notifications.follow).toBe(false);
      expect(result.privacy.blurCensored).toBe(false);
      expect(result.muted).toEqual([]); // Muted is not synced, always empty from homeserver
      expect(result.language).toBe('de');
      expect(result.updatedAt).toBe(1700000000000);
      expect(result.version).toBe(2);
    });

    it('should apply default notification preferences for missing fields', () => {
      const json = {
        notifications: { follow: false },
      };

      const result = SettingsNormalizer.from(json);

      expect(result.notifications.follow).toBe(false);
      expect(result.notifications.newFriend).toBe(defaultNotificationPreferences.newFriend);
      expect(result.notifications.reply).toBe(defaultNotificationPreferences.reply);
    });

    it('should apply default privacy preferences for missing fields', () => {
      const json = {
        privacy: { showConfirm: false },
      };

      const result = SettingsNormalizer.from(json);

      expect(result.privacy.showConfirm).toBe(false);
      expect(result.privacy.blurCensored).toBe(defaultPrivacyPreferences.blurCensored);
    });

    it('should default language to en', () => {
      const result = SettingsNormalizer.from({});

      expect(result.language).toBe('en');
    });

    it('should default version to 1', () => {
      const result = SettingsNormalizer.from({});

      expect(result.version).toBe(1);
    });

    it('should set updatedAt to current time if missing', () => {
      const before = Date.now();
      const result = SettingsNormalizer.from({});
      const after = Date.now();

      expect(result.updatedAt).toBeGreaterThanOrEqual(before);
      expect(result.updatedAt).toBeLessThanOrEqual(after);
    });

    it('should handle empty object gracefully', () => {
      const result = SettingsNormalizer.from({});

      expect(result).toEqual({
        notifications: defaultNotificationPreferences,
        privacy: defaultPrivacyPreferences,
        muted: [],
        language: 'en',
        updatedAt: expect.any(Number),
        version: 1,
      });
    });

    it('should always return empty muted array (muted not synced to homeserver)', () => {
      const result = SettingsNormalizer.from({});

      expect(result.muted).toEqual([]);
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve data through to/from cycle (except muted which is not synced)', () => {
      const original = createMockSettingsState({
        notifications: { ...defaultNotificationPreferences, follow: false },
        privacy: { ...defaultPrivacyPreferences, showConfirm: false },
        muted: ['user1'], // This won't be preserved - muted is not synced to homeserver
        language: 'ja',
        version: 3,
      });

      const normalized = SettingsNormalizer.to(original, TEST_PUBKY.USER_1);
      const restored = SettingsNormalizer.from(normalized.settings);

      // Muted is not synced to homeserver, so it defaults to empty on restore
      expect(restored).toEqual({
        ...original,
        muted: [], // Muted is not preserved through homeserver sync
      });
    });

    it('should not include muted in homeserver JSON', () => {
      const original = createMockSettingsState({
        muted: ['user1', 'user2'],
      });

      const normalized = SettingsNormalizer.to(original, TEST_PUBKY.USER_1);

      expect(normalized.settings).not.toHaveProperty('muted');
    });
  });
});
