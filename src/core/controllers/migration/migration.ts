import { MigrationApplication } from '@/application/migration/migration';
import { setLocaleCookie } from '@/i18n/utils';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import { useSettingsStore } from '@/stores/settings/settings.store';

export class MigrationController {
  private constructor() {}

  /**
   * Orchestrates post-DB-recreation re-sync.
   * Delegates homeserver data fetching to MigrationApplication,
   * then applies settings to the Zustand store (state management stays in Controller layer).
   */
  static async resync(pubky: Pubky): Promise<void> {
    const localSettings = SettingsNormalizer.extractState(useSettingsStore.getState());
    const remoteSettings = await MigrationApplication.resync(pubky, localSettings);

    if (remoteSettings) {
      useSettingsStore.getState().loadFromHomeserver(remoteSettings);
      setLocaleCookie(remoteSettings.language);
      Logger.info('Settings loaded from homeserver during DB re-sync', { pubky });
    }
  }
}
