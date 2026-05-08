import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MigrationApplication } from '@/application/migration/migration';
import type { Pubky } from '@/models/models.types';
import { SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import { useSettingsStore } from '@/stores/settings/settings.store';
import type { SettingsState } from '@/stores/settings/settings.types';
import { mockSettingsStore } from '@/test-utils/stores';
import { MigrationController } from './migration';

vi.mock('pubky-app-specs', () => ({
  baseUriBuilder: (pubky: string) => `pubky://${pubky}/pub/pubky.app/`,
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const TEST_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;

describe('MigrationController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resync', () => {
    it('should call MigrationApplication.resync with local settings and apply remote settings to store', async () => {
      const mockLocalSettings = { version: 5, updatedAt: 500 } as SettingsState;
      const mockRemoteSettings = { version: 6, updatedAt: 600 } as SettingsState;
      const resyncSpy = vi.spyOn(MigrationApplication, 'resync').mockResolvedValue(mockRemoteSettings);
      const loadFromHomeserverSpy = vi.fn();
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue(
        mockSettingsStore({ loadFromHomeserver: loadFromHomeserverSpy }),
      );
      vi.spyOn(SettingsNormalizer, 'extractState').mockReturnValue(mockLocalSettings);

      await MigrationController.resync(TEST_PUBKY);

      expect(resyncSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY, mockLocalSettings);
      expect(loadFromHomeserverSpy).toHaveBeenCalledExactlyOnceWith(mockRemoteSettings);
    });

    it('should not apply settings to store when MigrationApplication.resync returns null', async () => {
      const mockLocalSettings = { version: 5, updatedAt: 500 } as SettingsState;
      vi.spyOn(MigrationApplication, 'resync').mockResolvedValue(null);
      const loadFromHomeserverSpy = vi.fn();
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue(
        mockSettingsStore({ loadFromHomeserver: loadFromHomeserverSpy }),
      );
      vi.spyOn(SettingsNormalizer, 'extractState').mockReturnValue(mockLocalSettings);

      await MigrationController.resync(TEST_PUBKY);

      expect(loadFromHomeserverSpy).not.toHaveBeenCalled();
    });

    it('should propagate errors from MigrationApplication.resync', async () => {
      vi.spyOn(MigrationApplication, 'resync').mockRejectedValue(new Error('homeserver-down'));

      await expect(MigrationController.resync(TEST_PUBKY)).rejects.toThrow('homeserver-down');
    });
  });
});
