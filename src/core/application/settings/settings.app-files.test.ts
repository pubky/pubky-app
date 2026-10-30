import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsApplication } from '@/application/settings/settings';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import {
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  type SettingsState,
} from '@/stores/settings/settings.types';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';

const pubky = fakeOwner(1) as Pubky;
const V1_PATH = '/priv/app.pubky/v1/settings.json';
const LEGACY_PATH = '/pub/pubky.app/settings.json';

const settings = (overrides?: Partial<SettingsState>): SettingsState => ({
  notifications: defaultNotificationPreferences,
  privacy: { ...defaultPrivacyPreferences, moderationBot: fakeOwner(2) as Pubky },
  muted: [],
  updatedAt: 1_700_000_000_000,
  version: 1,
  ...overrides,
});

// The real normalizer and application against the in-memory homeserver.
describe('settings in the app private namespace', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  const file = async (path: string) =>
    (await homeserver.session.storage.exists(path))
      ? JSON.parse(new TextDecoder().decode(await homeserver.session.storage.getBytes(path)))
      : null;

  beforeEach(() => {
    homeserver = stubMemoryHomeserver(pubky);
    vi.spyOn(Logger, 'info').mockImplementation(() => {});
    vi.spyOn(Logger, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes settings to the v1 file', async () => {
    await SettingsApplication.commitUpdate(settings({ version: 2 }), pubky);

    expect(await file(V1_PATH)).toEqual(SettingsNormalizer.to(settings({ version: 2 }), pubky).settings);
    expect(await file(LEGACY_PATH)).toBeNull();
  });

  it('reads the v1 file and ignores a newer 0.x one once the v1 file exists', async () => {
    await homeserver.session.storage.putJson(V1_PATH, SettingsNormalizer.to(settings({ version: 2 }), pubky).settings);
    await homeserver.session.storage.putJson(
      LEGACY_PATH,
      SettingsNormalizer.to(settings({ version: 9 }), pubky).settings,
    );

    expect(await SettingsApplication.fetchFromHomeserver(pubky)).toMatchObject({ version: 2 });
    expect(homeserver.spies.request.mock.calls.map(([params]) => params.url)).toEqual([`pubky://${pubky}${V1_PATH}`]);
  });

  it('reads the 0.x file while the v1 file is absent, without writing it', async () => {
    await homeserver.session.storage.putJson(
      LEGACY_PATH,
      SettingsNormalizer.to(settings({ version: 3 }), pubky).settings,
    );

    expect(await SettingsApplication.fetchFromHomeserver(pubky)).toMatchObject({ version: 3 });
    expect(homeserver.spies.request).not.toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.PUT }));
    expect(await file(V1_PATH)).toBeNull();
  });

  it('reads nothing when neither file exists', async () => {
    expect(await SettingsApplication.fetchFromHomeserver(pubky)).toBeNull();
  });

  describe('the first sync after the migration gate', () => {
    it('copies newer 0.x settings into the v1 file and keeps the 0.x file', async () => {
      const legacy = SettingsNormalizer.to(settings({ version: 3, updatedAt: 1_800_000_000_000 }), pubky).settings;
      await homeserver.session.storage.putJson(LEGACY_PATH, legacy);

      const adopted = await SettingsApplication.initializeSettings(pubky, settings({ version: 1 }));

      expect(adopted).toMatchObject({ version: 3, updatedAt: 1_800_000_000_000 });
      expect(await file(V1_PATH)).toEqual(legacy);
      expect(await file(LEGACY_PATH)).toEqual(legacy);
    });

    it('writes newer local settings to the v1 file and keeps the 0.x file as it was', async () => {
      const legacy = SettingsNormalizer.to(settings({ version: 1 }), pubky).settings;
      await homeserver.session.storage.putJson(LEGACY_PATH, legacy);
      const local = settings({ version: 2, updatedAt: 1_900_000_000_000 });

      expect(await SettingsApplication.initializeSettings(pubky, local)).toBeNull();

      expect(await file(V1_PATH)).toEqual(SettingsNormalizer.to(local, pubky).settings);
      expect(await file(LEGACY_PATH)).toEqual(legacy);
    });

    it('creates the v1 file from the local settings when neither file exists', async () => {
      const created = await SettingsApplication.initializeSettings(pubky, settings({ updatedAt: 0 }));

      expect(created?.updatedAt).toBeGreaterThan(0);
      expect(await file(V1_PATH)).toMatchObject({ version: 1, updatedAt: created?.updatedAt });
      expect(await file(LEGACY_PATH)).toBeNull();
    });

    it('is forward only: a later sync reads the v1 file and never the 0.x one again', async () => {
      await homeserver.session.storage.putJson(
        LEGACY_PATH,
        SettingsNormalizer.to(settings({ version: 3 }), pubky).settings,
      );
      await SettingsApplication.initializeSettings(pubky, settings({ version: 1 }));
      await homeserver.session.storage.putJson(
        LEGACY_PATH,
        SettingsNormalizer.to(settings({ version: 8 }), pubky).settings,
      );
      homeserver.spies.request.mockClear();

      const adopted = await SettingsApplication.initializeSettings(pubky, settings({ version: 1 }));

      expect(adopted).toMatchObject({ version: 3 });
      expect(homeserver.spies.request.mock.calls.map(([params]) => params.url)).toEqual([`pubky://${pubky}${V1_PATH}`]);
    });
  });
});
