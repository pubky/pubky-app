import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { SettingsApplication } from './settings';

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
  const otherPubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;

  const moderationBot = 'euwmq57zefw5ynnkhh37b3gcmhs7g3cptdbw1doaxj1pbmzp3wro' as Pubky;
  const settingsUrl = `pubky://${testPubky}/pub/pubky.app/settings.json`;

  // Test data factory. Defaults to a client that already knows the moderation-bot field,
  // so ordinary writes are a single PUT; stale-client cases override `privacy` explicitly.
  const createMockSettingsState = (overrides?: Partial<SettingsState>): SettingsState => ({
    notifications: defaultNotificationPreferences,
    privacy: { ...defaultPrivacyPreferences, moderationBot },
    muted: [],
    updatedAt: 1700000000000,
    version: 1,
    ...overrides,
  });

  const createMockNormalizerResult = (settings: SettingsState) => ({
    settings: {
      notifications: settings.notifications,
      privacy: settings.privacy,
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

    it('should serialize commits for the same account', async () => {
      const firstSettings = createMockSettingsState({ updatedAt: 1 });
      const secondSettings = createMockSettingsState({ updatedAt: 2 });
      const { requestSpy, normalizerToSpy } = setupMocks();
      let resolveFirst!: () => void;
      const firstRequest = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      const events: string[] = [];

      normalizerToSpy.mockImplementation((settings) => createMockNormalizerResult(settings));
      requestSpy
        .mockImplementationOnce(() => {
          events.push('first-start');
          return firstRequest;
        })
        .mockImplementationOnce(() => {
          events.push('second-start');
          return Promise.resolve(undefined);
        });

      const firstCommit = SettingsApplication.commitUpdate(firstSettings, testPubky);
      const secondCommit = SettingsApplication.commitUpdate(secondSettings, testPubky);

      await vi.waitFor(() => expect(requestSpy).toHaveBeenCalledOnce());
      expect(events).toEqual(['first-start']);

      resolveFirst();
      await Promise.all([firstCommit, secondCommit]);

      expect(events).toEqual(['first-start', 'second-start']);
      expect(normalizerToSpy).toHaveBeenNthCalledWith(1, firstSettings, testPubky);
      expect(normalizerToSpy).toHaveBeenNthCalledWith(2, secondSettings, testPubky);
    });

    it('should continue a same-account queue after a failed commit', async () => {
      const firstSettings = createMockSettingsState({ updatedAt: 1 });
      const secondSettings = createMockSettingsState({ updatedAt: 2 });
      const { requestSpy, normalizerToSpy } = setupMocks();
      const failure = new Error('first failed');

      normalizerToSpy.mockImplementation((settings) => createMockNormalizerResult(settings));
      requestSpy.mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);

      const firstCommit = SettingsApplication.commitUpdate(firstSettings, testPubky);
      const secondCommit = SettingsApplication.commitUpdate(secondSettings, testPubky);

      await expect(firstCommit).rejects.toBe(failure);
      await expect(secondCommit).resolves.toBeUndefined();
      expect(requestSpy).toHaveBeenCalledTimes(2);
    });

    it('should not block commits for different accounts', async () => {
      const settings = createMockSettingsState();
      const { requestSpy, normalizerToSpy } = setupMocks();
      let resolveFirst!: () => void;
      const firstRequest = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      normalizerToSpy.mockImplementation((state, pubky) => ({
        ...createMockNormalizerResult(state),
        meta: {
          url: `pubky://${pubky}/pub/pubky.app/settings.json`,
          path: 'pub/pubky.app/settings.json',
        },
      }));
      requestSpy.mockImplementation(({ url }) => (url.includes(testPubky) ? firstRequest : Promise.resolve(undefined)));

      const firstCommit = SettingsApplication.commitUpdate(settings, testPubky);
      const otherCommit = SettingsApplication.commitUpdate(settings, otherPubky);

      await expect(otherCommit).resolves.toBeUndefined();
      expect(requestSpy).toHaveBeenCalledTimes(2);

      resolveFirst();
      await firstCommit;
    });

    it('should skip an aborted commit when it reaches the front of the queue', async () => {
      const settings = createMockSettingsState();
      const { requestSpy, normalizerToSpy } = setupMocks();
      let resolveFirst!: () => void;
      const firstRequest = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      const controller = new AbortController();

      normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
      requestSpy.mockReturnValueOnce(firstRequest);

      const firstCommit = SettingsApplication.commitUpdate(settings, testPubky);
      const abortedCommit = SettingsApplication.commitUpdate(settings, testPubky, controller.signal);
      controller.abort();

      resolveFirst();
      await Promise.all([firstCommit, abortedCommit]);

      expect(requestSpy).toHaveBeenCalledOnce();
      expect(normalizerToSpy).toHaveBeenCalledOnce();
    });

    describe('stale client without moderation-bot state', () => {
      const staleSettings = () => createMockSettingsState({ privacy: defaultPrivacyPreferences });

      it('should carry the remote moderation bot into the write instead of erasing it', async () => {
        const settings = staleSettings();
        const remote = createMockSettingsState();
        const { requestSpy, normalizerToSpy, normalizerFromSpy, normalizerBuildUrlSpy } = setupMocks();
        const order: string[] = [];

        normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
        normalizerFromSpy.mockReturnValue(remote);
        normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
        requestSpy.mockImplementation(({ method }) => {
          order.push(method);
          return Promise.resolve(method === HttpMethod.GET ? remote : undefined);
        });

        await SettingsApplication.commitUpdate(settings, testPubky);

        expect(order).toEqual([HttpMethod.GET, HttpMethod.PUT]);
        expect(normalizerToSpy).toHaveBeenCalledWith(
          { ...settings, privacy: { ...settings.privacy, moderationBot } },
          testPubky,
        );
      });

      it('should write unchanged when the remote has no moderation bot either', async () => {
        const settings = staleSettings();
        const { requestSpy, normalizerToSpy, normalizerFromSpy, normalizerBuildUrlSpy } = setupMocks();

        normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
        normalizerFromSpy.mockReturnValue(staleSettings());
        normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
        requestSpy.mockImplementation(({ method }) =>
          Promise.resolve(method === HttpMethod.GET ? staleSettings() : undefined),
        );

        await SettingsApplication.commitUpdate(settings, testPubky);

        expect(requestSpy).toHaveBeenCalledTimes(2);
        expect(normalizerToSpy).toHaveBeenCalledWith(settings, testPubky);
      });

      it('should still write when the remote read fails', async () => {
        const settings = staleSettings();
        const { requestSpy, normalizerToSpy, normalizerBuildUrlSpy } = setupMocks();
        const loggerWarn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
        const failure = new Error('read failed');

        normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
        normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
        requestSpy.mockImplementation(({ method }) =>
          method === HttpMethod.GET ? Promise.reject(failure) : Promise.resolve(undefined),
        );

        await expect(SettingsApplication.commitUpdate(settings, testPubky)).resolves.toBeUndefined();

        expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.PUT }));
        expect(normalizerToSpy).toHaveBeenCalledWith(settings, testPubky);
        expect(loggerWarn).toHaveBeenCalledWith('[Settings] Could not read remote moderation-bot state before write', {
          error: failure,
        });
      });

      it('should not write when aborted during the remote read', async () => {
        const settings = staleSettings();
        const controller = new AbortController();
        const { requestSpy, normalizerToSpy, normalizerFromSpy, normalizerBuildUrlSpy } = setupMocks();

        normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
        normalizerFromSpy.mockReturnValue(createMockSettingsState());
        requestSpy.mockImplementation(() => {
          controller.abort();
          return Promise.resolve(createMockSettingsState());
        });

        await SettingsApplication.commitUpdate(settings, testPubky, controller.signal);

        expect(requestSpy).toHaveBeenCalledOnce();
        expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.GET }));
        expect(normalizerToSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('fetchFromHomeserver', () => {
    it('should fetch and return settings from homeserver', async () => {
      const remoteSettings = createMockSettingsState({ version: 2 });
      const { requestSpy, normalizerBuildUrlSpy, normalizerFromSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(`pubky://${testPubky}/pub/pubky.app/settings.json`);
      requestSpy.mockResolvedValue({
        notifications: remoteSettings.notifications,
        privacy: remoteSettings.privacy,
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
      const remoteSettings = createMockSettingsState({ version: 2, updatedAt: 1700000000000 });
      const { requestSpy, normalizerBuildUrlSpy, normalizerFromSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(`pubky://${testPubky}/pub/pubky.app/settings.json`);
      requestSpy.mockResolvedValue(remoteSettings);
      normalizerFromSpy.mockReturnValue(remoteSettings);

      const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

      expect(result).toEqual(remoteSettings);
    });

    it('should return remote settings when they are newer (same version, newer timestamp)', async () => {
      const localSettings = createMockSettingsState({ version: 1, updatedAt: 1700000000000 });
      const remoteSettings = createMockSettingsState({ version: 1, updatedAt: 1800000000000 });
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

    it('should carry remote moderation bot into newer local settings and return them for the store', async () => {
      const localSettings = createMockSettingsState({
        version: 2,
        updatedAt: 1800000000000,
        privacy: defaultPrivacyPreferences,
      });
      const remoteSettings = createMockSettingsState({ version: 1, updatedAt: 1700000000000 });
      const { requestSpy, normalizerBuildUrlSpy, normalizerFromSpy, normalizerToSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
      requestSpy.mockResolvedValueOnce(remoteSettings); // fetchFromHomeserver
      normalizerFromSpy.mockReturnValue(remoteSettings);
      normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
      requestSpy.mockResolvedValueOnce(undefined); // push

      const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

      const expected = { ...localSettings, privacy: { ...localSettings.privacy, moderationBot } };
      expect(result).toEqual(expected);
      expect(normalizerToSpy).toHaveBeenCalledWith(expected, testPubky);
      // The remote document was already read; no second probe before the push
      expect(requestSpy).toHaveBeenCalledTimes(2);
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
