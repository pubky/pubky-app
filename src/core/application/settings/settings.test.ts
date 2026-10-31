import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpStatusCodeToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import type { THomeserverBytesResult } from '@/services/homeserver/homeserver.types';
import {
  HOMESERVER_PUBLISH_CONFLICT_MESSAGE,
  installHomeserverWriteRetryDependenciesForTests,
} from '@/services/homeserver/write-retry';
import {
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  type SettingsState,
} from '@/stores/settings/settings.types';
import { SettingsApplication } from './settings';

// Mock the HomeserverService
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    createWriteFence: () => ({ enter: () => {}, assertCurrent: () => {} }),
    request: vi.fn(),
    getBytesIfExists: vi.fn(),
  },
}));

// Mock the SettingsNormalizer
vi.mock('@/pipes/settings/settings.normalizer', () => ({
  SettingsNormalizer: {
    to: vi.fn(),
    from: vi.fn(),
    buildUrl: vi.fn(),
    buildLegacyUrl: vi.fn(),
  },
}));

describe('SettingsApplication', () => {
  const testPubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;
  const otherPubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;

  const moderationBot = 'euwmq57zefw5ynnkhh37b3gcmhs7g3cptdbw1doaxj1pbmzp3wro' as Pubky;
  const settingsUrl = `pubky://${testPubky}/priv/app.pubky/v1/settings.json`;
  const legacySettingsUrl = `pubky://${testPubky}/pub/pubky.app/settings.json`;

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
      url: settingsUrl,
      path: '/priv/app.pubky/v1/settings.json',
    },
  });

  // Helper functions
  const setupMocks = () => {
    // Spy on Logger methods
    vi.spyOn(Logger, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger, 'info').mockImplementation(() => {});
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger, 'error').mockImplementation(() => {});

    return {
      requestSpy: vi.spyOn(HomeserverService, 'request'),
      // Reads answer 404 (absent) unless a test stores a document
      readSpy: vi.spyOn(HomeserverService, 'getBytesIfExists').mockReset().mockResolvedValue(null),
      normalizerToSpy: vi.spyOn(SettingsNormalizer, 'to'),
      normalizerFromSpy: vi.spyOn(SettingsNormalizer, 'from'),
      normalizerBuildUrlSpy: vi.spyOn(SettingsNormalizer, 'buildUrl').mockReturnValue(settingsUrl),
      normalizerBuildLegacyUrlSpy: vi.spyOn(SettingsNormalizer, 'buildLegacyUrl').mockReturnValue(legacySettingsUrl),
    };
  };
  type HomeserverSpies = Pick<ReturnType<typeof setupMocks>, 'readSpy' | 'requestSpy'>;
  /** `doc` stored as a JSON file, as the homeserver read returns it. */
  const storedJson = (doc: unknown): THomeserverBytesResult => ({
    bytes: new TextEncoder().encode(JSON.stringify(doc)),
    modifiedAt: null,
  });
  /** A stored file whose bytes are `text` as is. */
  const storedText = (text: string): THomeserverBytesResult => ({
    bytes: new TextEncoder().encode(text),
    modifiedAt: null,
  });
  /** A homeserver holding `files` by URL: a read answers from them (absent is null), a PUT stores into them. */
  const homeserverWith = ({ readSpy, requestSpy }: HomeserverSpies, files: Map<string, unknown>) => {
    readSpy.mockImplementation(async (url) => (files.has(url) ? storedJson(files.get(url)) : null));
    requestSpy.mockImplementation(async ({ url, bodyJson }) => {
      files.set(url, bodyJson);
      return undefined;
    });
  };
  /** Every homeserver call in order: `['read', url]` for a read, `[method, url]` for a request. */
  const homeserverCalls = ({ readSpy, requestSpy }: HomeserverSpies) =>
    [
      ...readSpy.mock.calls.map(([url], i) => ({ at: readSpy.mock.invocationCallOrder[i], call: ['read', url] })),
      ...requestSpy.mock.calls.map(([params], i) => ({
        at: requestSpy.mock.invocationCallOrder[i],
        call: [params.method, params.url],
      })),
    ]
      .sort((a, b) => a.at - b.at)
      .map(({ call }) => call);
  const readUrls = (readSpy: HomeserverSpies['readSpy']) => readSpy.mock.calls.map(([url]) => url);

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
        fence: expect.anything(),
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
          url: `pubky://${pubky}/priv/app.pubky/v1/settings.json`,
          path: '/priv/app.pubky/v1/settings.json',
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
        const spies = setupMocks();
        const { requestSpy, readSpy, normalizerToSpy, normalizerFromSpy, normalizerBuildUrlSpy } = spies;

        normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
        normalizerFromSpy.mockReturnValue(remote);
        normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
        readSpy.mockResolvedValue(storedJson(remote));
        requestSpy.mockResolvedValue(undefined);

        await SettingsApplication.commitUpdate(settings, testPubky);

        expect(homeserverCalls(spies)).toEqual([
          ['read', settingsUrl],
          [HttpMethod.PUT, settingsUrl],
        ]);
        expect(normalizerToSpy).toHaveBeenCalledWith(
          { ...settings, privacy: { ...settings.privacy, moderationBot } },
          testPubky,
        );
      });

      it('should write unchanged when the remote has no moderation bot either', async () => {
        const settings = staleSettings();
        const { requestSpy, readSpy, normalizerToSpy, normalizerFromSpy, normalizerBuildUrlSpy } = setupMocks();

        normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
        normalizerFromSpy.mockReturnValue(staleSettings());
        normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
        readSpy.mockResolvedValue(storedJson(staleSettings()));
        requestSpy.mockResolvedValue(undefined);

        await SettingsApplication.commitUpdate(settings, testPubky);

        expect(readSpy).toHaveBeenCalledOnce();
        expect(requestSpy).toHaveBeenCalledOnce();
        expect(normalizerToSpy).toHaveBeenCalledWith(settings, testPubky);
      });

      it('should reject the write without pushing when the remote read fails', async () => {
        const settings = staleSettings();
        const { requestSpy, readSpy, normalizerToSpy, normalizerBuildUrlSpy } = setupMocks();
        const failure = new Error('read failed');

        normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
        normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
        readSpy.mockRejectedValue(failure);
        requestSpy.mockResolvedValue(undefined);

        await expect(SettingsApplication.commitUpdate(settings, testPubky)).rejects.toBe(failure);

        expect(readSpy).toHaveBeenCalledOnce();
        expect(requestSpy).not.toHaveBeenCalled();
        expect(normalizerToSpy).not.toHaveBeenCalled();
      });

      it('should write when the remote document does not exist (404)', async () => {
        const settings = staleSettings();
        const { requestSpy, readSpy, normalizerToSpy, normalizerBuildUrlSpy } = setupMocks();

        normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
        normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
        readSpy.mockResolvedValue(null);
        requestSpy.mockResolvedValue(undefined);

        await expect(SettingsApplication.commitUpdate(settings, testPubky)).resolves.toBeUndefined();

        expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.PUT }));
        expect(normalizerToSpy).toHaveBeenCalledWith(settings, testPubky);
      });

      it('should not write when aborted during the remote read', async () => {
        const settings = staleSettings();
        const controller = new AbortController();
        const { requestSpy, readSpy, normalizerToSpy, normalizerFromSpy, normalizerBuildUrlSpy } = setupMocks();

        normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
        normalizerFromSpy.mockReturnValue(createMockSettingsState());
        readSpy.mockImplementation(async () => {
          controller.abort();
          return storedJson(createMockSettingsState());
        });

        await SettingsApplication.commitUpdate(settings, testPubky, controller.signal);

        expect(readSpy).toHaveBeenCalledExactlyOnceWith(settingsUrl);
        expect(requestSpy).not.toHaveBeenCalled();
        expect(normalizerToSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('fetchFromHomeserver', () => {
    it('should fetch and return settings from homeserver', async () => {
      const remoteSettings = createMockSettingsState({ version: 2 });
      const settingsJson = {
        notifications: remoteSettings.notifications,
        privacy: remoteSettings.privacy,
        updatedAt: remoteSettings.updatedAt,
        version: remoteSettings.version,
      };
      const { requestSpy, readSpy, normalizerBuildUrlSpy, normalizerFromSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
      readSpy.mockResolvedValue(storedJson(settingsJson));
      normalizerFromSpy.mockReturnValue(remoteSettings);

      const result = await SettingsApplication.fetchFromHomeserver(testPubky);

      expect(normalizerBuildUrlSpy).toHaveBeenCalledWith(testPubky);
      expect(readSpy).toHaveBeenCalledExactlyOnceWith(settingsUrl);
      expect(requestSpy).not.toHaveBeenCalled();
      expect(normalizerFromSpy).toHaveBeenCalledWith(settingsJson);
      expect(result).toEqual(remoteSettings);
    });

    it('should not read the 0.x file when the v1 file exists', async () => {
      const remoteSettings = createMockSettingsState({ version: 2 });
      const spies = setupMocks();

      homeserverWith(
        spies,
        new Map<string, unknown>([
          [settingsUrl, {}],
          [legacySettingsUrl, {}],
        ]),
      );
      spies.normalizerFromSpy.mockReturnValue(remoteSettings);

      await SettingsApplication.fetchFromHomeserver(testPubky);

      expect(readUrls(spies.readSpy)).toEqual([settingsUrl]);
    });

    it('should fall back to the 0.x file while the v1 file is absent', async () => {
      const remoteSettings = createMockSettingsState({ version: 2 });
      const spies = setupMocks();
      const { normalizerFromSpy } = spies;

      homeserverWith(spies, new Map<string, unknown>([[legacySettingsUrl, { version: 2 }]]));
      normalizerFromSpy.mockReturnValue(remoteSettings);

      const result = await SettingsApplication.fetchFromHomeserver(testPubky);

      expect(readUrls(spies.readSpy)).toEqual([settingsUrl, legacySettingsUrl]);
      expect(normalizerFromSpy).toHaveBeenCalledWith({ version: 2 });
      expect(result).toEqual(remoteSettings);
    });

    it('should return null when the files hold empty bodies', async () => {
      const { readSpy } = setupMocks();

      readSpy.mockResolvedValue(storedText(''));

      const result = await SettingsApplication.fetchFromHomeserver(testPubky);

      expect(result).toBeNull();
      expect(readUrls(readSpy)).toEqual([settingsUrl, legacySettingsUrl]);
    });

    it('should return null when neither file exists (404)', async () => {
      const spies = setupMocks();

      homeserverWith(spies, new Map());

      const result = await SettingsApplication.fetchFromHomeserver(testPubky);

      expect(result).toBeNull();
      expect(readUrls(spies.readSpy)).toEqual([settingsUrl, legacySettingsUrl]);
    });

    it('should read a missing file (404) as absent without creating an error', async () => {
      const { readSpy, normalizerFromSpy } = setupMocks();

      readSpy.mockResolvedValue(null);

      const result = await SettingsApplication.fetchFromHomeserver(testPubky);

      expect(result).toBeNull();
      // Every Err.* factory logs through Logger.error before it reports
      expect(Logger.error).not.toHaveBeenCalled();
      expect(Logger.warn).not.toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith('[Settings] Pull complete, settings file not found (404)');
      expect(normalizerFromSpy).not.toHaveBeenCalled();
      expect(readUrls(readSpy)).toEqual([settingsUrl, legacySettingsUrl]);
    });

    it('should read a file that holds no JSON document as absent and warn', async () => {
      const { readSpy, normalizerFromSpy } = setupMocks();

      readSpy.mockImplementation(async (url) => (url === settingsUrl ? storedText('{"version": 2,') : null));

      const result = await SettingsApplication.fetchFromHomeserver(testPubky);

      expect(result).toBeNull();
      expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
        '[Settings] Pull complete, the settings file holds no JSON document',
        { url: settingsUrl },
      );
      expect(Logger.error).not.toHaveBeenCalled();
      expect(normalizerFromSpy).not.toHaveBeenCalled();
      expect(readUrls(readSpy)).toEqual([settingsUrl, legacySettingsUrl]);
    });

    it('should throw on non-404 errors', async () => {
      const { readSpy, normalizerBuildUrlSpy } = setupMocks();
      const serverError = Err.server(ServerErrorCode.INTERNAL_ERROR, 'Server error', {
        service: ErrorService.Homeserver,
        operation: 'getBytesIfExists',
        context: { statusCode: 500 },
      });

      normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
      readSpy.mockRejectedValue(serverError);

      await expect(SettingsApplication.fetchFromHomeserver(testPubky)).rejects.toThrow('Server error');
      expect(readSpy).toHaveBeenCalledOnce();
    });

    it('should reject with a 500 on the 0.x read instead of reading it as absent', async () => {
      const { readSpy, normalizerFromSpy } = setupMocks();
      const serverError = httpStatusCodeToError(
        500,
        'Internal server error',
        ErrorService.Homeserver,
        'getBytesIfExists',
        legacySettingsUrl,
      );

      readSpy.mockImplementation(async (url) => {
        if (url === legacySettingsUrl) throw serverError;
        return null;
      });

      await expect(SettingsApplication.fetchFromHomeserver(testPubky)).rejects.toBe(serverError);
      expect(readUrls(readSpy)).toEqual([settingsUrl, legacySettingsUrl]);
      expect(normalizerFromSpy).not.toHaveBeenCalled();
    });
  });

  describe('initializeSettings', () => {
    it('should create settings on homeserver when none exist remotely and return timestamped settings', async () => {
      const localSettings = createMockSettingsState({ updatedAt: 0 });
      const { requestSpy, readSpy, normalizerBuildUrlSpy, normalizerToSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
      readSpy.mockResolvedValue(null); // neither file exists
      requestSpy.mockResolvedValue(undefined); // the push succeeds
      normalizerToSpy.mockReturnValue(createMockNormalizerResult(localSettings));

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
      const { readSpy, normalizerBuildUrlSpy, normalizerFromSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
      readSpy.mockResolvedValue(storedJson(remoteSettings));
      normalizerFromSpy.mockReturnValue(remoteSettings);

      const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

      expect(result).toEqual(remoteSettings);
    });

    it('should return remote settings when they are newer (same version, newer timestamp)', async () => {
      const localSettings = createMockSettingsState({ version: 1, updatedAt: 1700000000000 });
      const remoteSettings = createMockSettingsState({ version: 1, updatedAt: 1800000000000 });
      const { readSpy, normalizerBuildUrlSpy, normalizerFromSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
      readSpy.mockResolvedValue(storedJson(remoteSettings));
      normalizerFromSpy.mockReturnValue(remoteSettings);

      const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

      expect(result).toEqual(remoteSettings);
    });

    it('should sync local settings when they are newer', async () => {
      const localSettings = createMockSettingsState({ version: 2, updatedAt: 1800000000000 });
      const remoteSettings = createMockSettingsState({ version: 1, updatedAt: 1700000000000 });
      const normalizerResult = createMockNormalizerResult(localSettings);
      const { requestSpy, readSpy, normalizerBuildUrlSpy, normalizerFromSpy, normalizerToSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
      readSpy.mockResolvedValue(storedJson(remoteSettings)); // fetchFromHomeserver
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
      const spies = setupMocks();
      const { requestSpy, readSpy, normalizerBuildUrlSpy, normalizerFromSpy, normalizerToSpy } = spies;

      normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
      readSpy.mockResolvedValue(storedJson(remoteSettings)); // fetchFromHomeserver
      normalizerFromSpy.mockReturnValue(remoteSettings);
      normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
      requestSpy.mockResolvedValueOnce(undefined); // push

      const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

      const expected = { ...localSettings, privacy: { ...localSettings.privacy, moderationBot } };
      expect(result).toEqual(expected);
      expect(normalizerToSpy).toHaveBeenCalledWith(expected, testPubky);
      // The remote document was already read; no second probe before the push
      expect(homeserverCalls(spies)).toEqual([
        ['read', settingsUrl],
        [HttpMethod.PUT, settingsUrl],
      ]);
    });

    it('should throw on error', async () => {
      const localSettings = createMockSettingsState();
      const { normalizerBuildUrlSpy, readSpy } = setupMocks();

      normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
      readSpy.mockRejectedValue(new Error('Network error'));

      await expect(SettingsApplication.initializeSettings(testPubky, localSettings)).rejects.toThrow('Network error');
    });

    describe('the first sync after the migration gate, when only the 0.x file exists', () => {
      it('writes the newer 0.x settings to the v1 file, adopts them and leaves the 0.x file alone', async () => {
        const localSettings = createMockSettingsState({ version: 1, updatedAt: 1700000000000 });
        const remoteSettings = createMockSettingsState({ version: 2, updatedAt: 1800000000000 });
        const legacyJson = { version: 2, updatedAt: 1800000000000 };
        const files = new Map<string, unknown>([[legacySettingsUrl, legacyJson]]);
        const spies = setupMocks();
        const { requestSpy, normalizerFromSpy, normalizerToSpy } = spies;

        homeserverWith(spies, files);
        normalizerFromSpy.mockReturnValue(remoteSettings);
        normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));

        const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

        expect(result).toEqual(remoteSettings);
        expect(normalizerToSpy).toHaveBeenCalledExactlyOnceWith(remoteSettings, testPubky);
        expect(homeserverCalls(spies)).toEqual([
          ['read', settingsUrl],
          ['read', legacySettingsUrl],
          [HttpMethod.PUT, settingsUrl],
        ]);
        expect(files.get(settingsUrl)).toMatchObject({ version: 2, updatedAt: 1800000000000 });
        expect(files.get(legacySettingsUrl)).toBe(legacyJson);
        expect(requestSpy).not.toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.DELETE }));
      });

      it('writes the newer local settings to the v1 file, never to the 0.x one', async () => {
        const localSettings = createMockSettingsState({ version: 3, updatedAt: 1900000000000 });
        const remoteSettings = createMockSettingsState({ version: 2, updatedAt: 1800000000000 });
        const files = new Map<string, unknown>([[legacySettingsUrl, { version: 2 }]]);
        const spies = setupMocks();
        const { normalizerFromSpy, normalizerToSpy } = spies;

        homeserverWith(spies, files);
        normalizerFromSpy.mockReturnValue(remoteSettings);
        normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));

        const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

        expect(result).toBeNull();
        expect(normalizerToSpy).toHaveBeenCalledExactlyOnceWith(localSettings, testPubky);
        expect(files.get(settingsUrl)).toMatchObject({ version: 3 });
        expect(files.get(legacySettingsUrl)).toEqual({ version: 2 });
      });

      it('adopts a v1 file another client wrote before the retried copy instead of overwriting it', async () => {
        installHomeserverWriteRetryDependenciesForTests({ sleep: async () => {}, random: () => 0 });
        const localSettings = createMockSettingsState({ version: 1, updatedAt: 1700000000000 });
        const legacyRemote = createMockSettingsState({ version: 2, updatedAt: 1800000000000 });
        const v1Remote = createMockSettingsState({ version: 4, updatedAt: 1950000000000 });
        const files = new Map<string, unknown>([[legacySettingsUrl, { version: 2 }]]);
        const spies = setupMocks();
        const { requestSpy, normalizerFromSpy, normalizerToSpy } = spies;

        normalizerFromSpy.mockImplementation((json) =>
          (json as { version: number }).version === 4 ? v1Remote : legacyRemote,
        );
        normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
        homeserverWith(spies, files);
        let puts = 0;
        requestSpy.mockImplementation(async ({ url }) => {
          puts += 1;
          // The copy is refused; meanwhile another client wrote the v1 file
          files.set(settingsUrl, { version: 4 });
          throw httpStatusCodeToError(429, 'Too many requests', ErrorService.Homeserver, 'request', url);
        });

        try {
          const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

          expect(result).toEqual(v1Remote);
          expect(puts).toBe(1);
          expect(homeserverCalls(spies)).toEqual([
            ['read', settingsUrl],
            ['read', legacySettingsUrl],
            [HttpMethod.PUT, settingsUrl],
            ['read', settingsUrl],
          ]);
        } finally {
          installHomeserverWriteRetryDependenciesForTests(null);
        }
      });
    });
  });

  describe('when the homeserver refuses the PUT with its publish conflict', () => {
    const publishConflict = () =>
      httpStatusCodeToError(
        409,
        `Request failed: Server responded with an error: 409 Conflict - ${HOMESERVER_PUBLISH_CONFLICT_MESSAGE}`,
        ErrorService.Homeserver,
        'request',
        settingsUrl,
      );
    const putBodies = (requestSpy: ReturnType<typeof setupMocks>['requestSpy']) =>
      requestSpy.mock.calls.filter(([params]) => params.method === HttpMethod.PUT).map(([params]) => params.bodyJson);

    beforeEach(() => {
      installHomeserverWriteRetryDependenciesForTests({ sleep: async () => {}, random: () => 0 });
    });

    afterEach(() => {
      installHomeserverWriteRetryDependenciesForTests(null);
    });

    it('re-reads the remote document before writing again when the write carried a remote value', async () => {
      const settings = createMockSettingsState({ privacy: defaultPrivacyPreferences });
      const otherBot = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;
      const remoteWithBot = createMockSettingsState({
        privacy: { ...defaultPrivacyPreferences, moderationBot: otherBot },
      });
      const spies = setupMocks();
      const { requestSpy, readSpy, normalizerToSpy, normalizerFromSpy, normalizerBuildUrlSpy } = spies;

      normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
      normalizerFromSpy.mockReturnValueOnce(createMockSettingsState({ privacy: defaultPrivacyPreferences }));
      normalizerFromSpy.mockReturnValueOnce(remoteWithBot);
      normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
      readSpy.mockResolvedValue(storedJson({}));
      let puts = 0;
      requestSpy.mockImplementation(async () => {
        puts += 1;
        if (puts === 1) throw publishConflict();
        return undefined;
      });

      await SettingsApplication.commitUpdate(settings, testPubky);

      expect(homeserverCalls(spies)).toEqual([
        ['read', settingsUrl],
        [HttpMethod.PUT, settingsUrl],
        ['read', settingsUrl],
        [HttpMethod.PUT, settingsUrl],
      ]);
      expect(putBodies(requestSpy)[1]).toMatchObject({ privacy: { moderationBot: otherBot } });
    });

    it('writes again without a read when the write carried no remote value', async () => {
      const settings = createMockSettingsState();
      const { requestSpy, readSpy, normalizerToSpy } = setupMocks();

      normalizerToSpy.mockReturnValue(createMockNormalizerResult(settings));
      requestSpy.mockRejectedValueOnce(publishConflict()).mockResolvedValueOnce(undefined);

      await SettingsApplication.commitUpdate(settings, testPubky);

      expect(requestSpy.mock.calls.map(([params]) => params.method)).toEqual([HttpMethod.PUT, HttpMethod.PUT]);
      expect(readSpy).not.toHaveBeenCalled();
    });

    it('adopts remote settings that became newer instead of overwriting them on bootstrap', async () => {
      const localSettings = createMockSettingsState({ version: 2, updatedAt: 1800000000000 });
      const olderRemote = createMockSettingsState({ version: 1, updatedAt: 1700000000000 });
      const newerRemote = createMockSettingsState({ version: 3, updatedAt: 1900000000000 });
      const spies = setupMocks();
      const { requestSpy, readSpy, normalizerBuildUrlSpy, normalizerFromSpy, normalizerToSpy } = spies;

      normalizerBuildUrlSpy.mockReturnValue(settingsUrl);
      normalizerFromSpy.mockReturnValueOnce(olderRemote).mockReturnValueOnce(newerRemote);
      normalizerToSpy.mockImplementation((state) => createMockNormalizerResult(state));
      readSpy.mockResolvedValue(storedJson({}));
      requestSpy.mockRejectedValue(publishConflict());

      const result = await SettingsApplication.initializeSettings(testPubky, localSettings);

      expect(result).toEqual(newerRemote);
      expect(homeserverCalls(spies)).toEqual([
        ['read', settingsUrl],
        [HttpMethod.PUT, settingsUrl],
        ['read', settingsUrl],
      ]);
    });

    it('does not re-read or write again after a path collision', async () => {
      const settings = createMockSettingsState();
      const { requestSpy, readSpy, normalizerToSpy } = setupMocks();
      const collision = httpStatusCodeToError(
        409,
        'Request failed: Server responded with an error: 409 Conflict - File/folder path collision',
        ErrorService.Homeserver,
        'request',
        settingsUrl,
      );

      normalizerToSpy.mockReturnValue(createMockNormalizerResult(settings));
      requestSpy.mockRejectedValueOnce(collision);

      await expect(SettingsApplication.commitUpdate(settings, testPubky)).rejects.toBe(collision);
      expect(requestSpy).toHaveBeenCalledOnce();
      expect(readSpy).not.toHaveBeenCalled();
    });
  });
});
