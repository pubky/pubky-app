import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MigrationController } from './migration';
import * as Core from '@/core';
import { mockSettingsStore } from '@/test-utils';

vi.mock('pubky-app-specs', () => ({
  baseUriBuilder: (pubky: string) => `pubky://${pubky}/pub/pubky.app/`,
}));

vi.mock('@/libs/logger', () => ({
  Logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const TEST_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Core.Pubky;

describe('MigrationController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resync', () => {
    it('should call MigrationApplication.resync with local settings and apply remote settings to store', async () => {
      const mockLocalSettings = { version: 5, updatedAt: 500 } as Core.SettingsState;
      const mockRemoteSettings = { version: 6, updatedAt: 600 } as Core.SettingsState;
      const resyncSpy = vi.spyOn(Core.MigrationApplication, 'resync').mockResolvedValue(mockRemoteSettings);
      const loadFromHomeserverSpy = vi.fn();
      vi.spyOn(Core.useSettingsStore, 'getState').mockReturnValue(
        mockSettingsStore({ loadFromHomeserver: loadFromHomeserverSpy }),
      );
      vi.spyOn(Core.SettingsNormalizer, 'extractState').mockReturnValue(mockLocalSettings);

      await MigrationController.resync(TEST_PUBKY);

      expect(resyncSpy).toHaveBeenCalledExactlyOnceWith(TEST_PUBKY, mockLocalSettings);
      expect(loadFromHomeserverSpy).toHaveBeenCalledExactlyOnceWith(mockRemoteSettings);
    });

    it('should not apply settings to store when MigrationApplication.resync returns null', async () => {
      const mockLocalSettings = { version: 5, updatedAt: 500 } as Core.SettingsState;
      vi.spyOn(Core.MigrationApplication, 'resync').mockResolvedValue(null);
      const loadFromHomeserverSpy = vi.fn();
      vi.spyOn(Core.useSettingsStore, 'getState').mockReturnValue(
        mockSettingsStore({ loadFromHomeserver: loadFromHomeserverSpy }),
      );
      vi.spyOn(Core.SettingsNormalizer, 'extractState').mockReturnValue(mockLocalSettings);

      await MigrationController.resync(TEST_PUBKY);

      expect(loadFromHomeserverSpy).not.toHaveBeenCalled();
    });

    it('should propagate errors from MigrationApplication.resync', async () => {
      vi.spyOn(Core.MigrationApplication, 'resync').mockRejectedValue(new Error('homeserver-down'));

      await expect(MigrationController.resync(TEST_PUBKY)).rejects.toThrow('homeserver-down');
    });
  });
});
