import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsApplication } from './settings';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpStatusCodeToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import {
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  type SettingsState,
} from '@/stores/settings/settings.types';
// Mock the HomeserverService
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
  },
}));

// Mock the SettingsNormalizer
vi.mock('@/pipes/settings/settings.normalizer', () => ({
  SettingsNormalizer: {
    to: vi.fn(),
    from: vi.fn(),
    buildUrl: vi.fn(),
  },
}));

describe('SettingsApplication', () => {
  const testPubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;

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

  const createMockNormalizerResult = (settings: SettingsState) => ({
    settings: {
      notifications: settings.notifications,
      privacy: settings.privacy,
      language: settings.language,
      updatedAt: settings.updatedAt,
      version: settings.version,
    },
    meta: {
      url: `pubky://${testPubky}/pub/pubky.app/settings.json`,
      path: 'pub/pubky.app/settings.json',
    },
  });

  // Helper functions
  const setupMocks = () => {
    // Spy on Logger methods
    vi.spyOn(Logger, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger, 'info').mockImplementation(() => {});
    vi.spyOn(Logger, 'error').mockImplementation(() => {});

    return {
      requestSpy: vi.spyOn(HomeserverService, 'request'),
      normalizerToSpy: vi.spyOn(SettingsNormalizer, 'to'),
      normalizerFromSpy: vi.spyOn(SettingsNormalizer, 'from'),
      normalizerBuildUrlSpy: vi.spyOn(SettingsNormalizer, 'buildUrl'),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('commitUpdate', () => {
    it('should sync settings to homeserver successfully', async () => {
      const settings = createMockSettingsState();
      const normalizerResult = createMockNormalizerResult(settings);
      const { requestSpy, normalizerToSpy } = setupMocks();

      normalizerToSpy.mockReturnValue(normalizerResult);
      requestSpy.mockResolvedValue(undefined);

      await SettingsApplication.commitUpdate(settings, testPubky);

      expect(normalizerToSpy).toHaveBeenCalledWith(settings, testPubky);
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: normalizerResult.meta.url,
        bodyJson: expect.any(Object),
      });
    });

    it('should throw error when homeserver request fails', async () => {
      const settings = createMockSettingsState();
      const normalizerResult = createMockNormalizerResult(settings);
      const { requestSpy, normalizerToSpy } = setupMocks();

      normalizerToSpy.mockReturnValue(normalizerResult);
      requestSpy.mockRejectedValue(new Error('Network error'));

      await expect(SettingsApplication.commitUpdate(settings, testPubky)).rejects.toThrow('Network error');
    });
  });

  describe('fetchFromHomeserver', () => {
    it('should fetch and return settings from homeserver', async () => {
      const remoteSettings = createMockSettingsState({ language: 'fr' });
      const { requestSpy, normalizerBuildUrlSpy, normalizerFromSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(`pubky://${testPubky}/pub/pubky.app/settings.json`);
      requestSpy.mockResolvedValue({
        notifications: remoteSettings.notifications,
        privacy: remoteSettings.privacy,
        language: 'fr',
        updatedAt: remoteSettings.updatedAt,
        version: remoteSettings.version,
      });
      normalizerFromSpy.mockReturnValue(remoteSettings);

      const result = await SettingsApplication.fetchFromHomeserver(testPubky);

      expect(normalizerBuildUrlSpy).toHaveBeenCalledWith(testPubky);
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.GET,
        url: `pubky://${testPubky}/pub/pubky.app/settings.json`,
      });
      expect(result).toEqual(remoteSettings);
    });

    it('should return null when homeserver returns empty response', async () => {
      const { requestSpy, normalizerBuildUrlSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(`pubky://${testPubky}/pub/pubky.app/settings.json`);
      requestSpy.mockResolvedValue(undefined);

      const result = await SettingsApplication.fetchFromHomeserver(testPubky);

      expect(result).toBeNull();
    });

    it('should return null on 404 error', async () => {
      const { requestSpy, normalizerBuildUrlSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(`pubky://${testPubky}/pub/pubky.app/settings.json`);
      const notFoundError = httpStatusCodeToError(
        404,
        'Not found',
        ErrorService.Homeserver,
        'request',
        `pubky://${testPubky}/pub/pubky.app/settings.json`,
      );
      requestSpy.mockRejectedValue(notFoundError);

      const result = await SettingsApplication.fetchFromHomeserver(testPubky);

      expect(result).toBeNull();
    });

    it('should throw on non-404 errors', async () => {
      const { requestSpy, normalizerBuildUrlSpy } = setupMocks();
      const serverError = Err.server(ServerErrorCode.INTERNAL_ERROR, 'Server error', {
        service: ErrorService.Homeserver,
        operation: 'request',
        context: { statusCode: 500 },
      });

      normalizerBuildUrlSpy.mockReturnValue(`pubky://${testPubky}/pub/pubky.app/settings.json`);
      requestSpy.mockRejectedValue(serverError);

      await expect(SettingsApplication.fetchFromHomeserver(testPubky)).rejects.toThrow('Server error');
    });
  });

  describe('initializeSettings', () => {
    it('should create settings on homeserver when none exist remotely and return timestamped settings', async () => {
      const localSettings = createMockSettingsState({ updatedAt: 0 });
      const { requestSpy, normalizerBuildUrlSpy, normalizerToSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(`pubky://${testPubky}/pub/pubky.app/settings.json`);
      requestSpy.mockResolvedValueOnce(undefined); // fetchFromHomeserver returns null
      normalizerToSpy.mockReturnValue(createMockNormalizerResult(localSettings));
      requestSpy.mockResolvedValueOnce(undefined); // commitUpdate succeeds

      const before = Date.now();
      const result = await SettingsApplication.initializeSettings(testPubky, localSettings);
      const after = Date.now();

      expect(result).not.toBeNull();
      expect(result!.updatedAt).toBeGreaterThanOrEqual(before);
      expect(result!.updatedAt).toBeLessThanOrEqual(after);
      expect(normalizerToSpy).toHaveBeenCalledWith(
        expect.objectContaining({ updatedAt: expect.any(Number) }),
        testPubky,
      );
      // Should push local settings to homeserver (calling commitUpdate())
      expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.PUT }));
    });

    it('should return remote settings when they are newer (higher version)', async () => {
      const localSettings = createMockSettingsState({ version: 1, updatedAt: 1700000000000 });
      const remoteSettings = createMockSettingsState({ version: 2, updatedAt: 1700000000000, language: 'fr' });
      const { requestSpy, normalizerBuildUrlSpy, normalizerFromSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(`pubky://${testPubky}/pub/pubky.app/settings.json`);
      requestSpy.mockResolvedValue(remoteSettings);
      normalizerFromSpy.mockReturnValue(remoteSettings);

      const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

      expect(result).toEqual(remoteSettings);
    });

    it('should return remote settings when they are newer (same version, newer timestamp)', async () => {
      const localSettings = createMockSettingsState({ version: 1, updatedAt: 1700000000000 });
      const remoteSettings = createMockSettingsState({ version: 1, updatedAt: 1800000000000, language: 'de' });
      const { requestSpy, normalizerBuildUrlSpy, normalizerFromSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(`pubky://${testPubky}/pub/pubky.app/settings.json`);
      requestSpy.mockResolvedValue(remoteSettings);
      normalizerFromSpy.mockReturnValue(remoteSettings);

      const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

      expect(result).toEqual(remoteSettings);
    });

    it('should sync local settings when they are newer', async () => {
      const localSettings = createMockSettingsState({ version: 2, updatedAt: 1800000000000 });
      const remoteSettings = createMockSettingsState({ version: 1, updatedAt: 1700000000000 });
      const normalizerResult = createMockNormalizerResult(localSettings);
      const { requestSpy, normalizerBuildUrlSpy, normalizerFromSpy, normalizerToSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(`pubky://${testPubky}/pub/pubky.app/settings.json`);
      requestSpy.mockResolvedValueOnce(remoteSettings); // fetchFromHomeserver
      normalizerFromSpy.mockReturnValue(remoteSettings);
      normalizerToSpy.mockReturnValue(normalizerResult);
      requestSpy.mockResolvedValueOnce(undefined); // commitUpdate

      const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

      expect(result).toBeNull();
      expect(normalizerToSpy).toHaveBeenCalledWith(localSettings, testPubky);
    });

    it('should throw on error', async () => {
      const localSettings = createMockSettingsState();
      const { normalizerBuildUrlSpy, requestSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(`pubky://${testPubky}/pub/pubky.app/settings.json`);
      requestSpy.mockRejectedValue(new Error('Network error'));

      await expect(SettingsApplication.initializeSettings(testPubky, localSettings)).rejects.toThrow('Network error');
    });
  });
});
