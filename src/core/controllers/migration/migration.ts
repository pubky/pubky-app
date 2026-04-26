import * as Core from '@/core';
import { setLocaleCookie } from '@/i18n/utils';
import { Logger } from '@/libs/logger/logger';

export class MigrationController {
  private constructor() {}

  /**
   * Orchestrates post-DB-recreation re-sync.
   * Delegates homeserver data fetching to MigrationApplication,
   * then applies settings to the Zustand store (state management stays in Controller layer).
   */
  static async resync(pubky: Core.Pubky): Promise<void> {
    const localSettings = Core.SettingsNormalizer.extractState(Core.useSettingsStore.getState());
    const remoteSettings = await Core.MigrationApplication.resync(pubky, localSettings);

    if (remoteSettings) {
      Core.useSettingsStore.getState().loadFromHomeserver(remoteSettings);
      setLocaleCookie(remoteSettings.language);
      Logger.info('Settings loaded from homeserver during DB re-sync', { pubky });
    }
  }
}
