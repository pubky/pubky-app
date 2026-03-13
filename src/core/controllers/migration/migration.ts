import { Logger } from '@/libs/logger';
import { setLocaleCookie } from '@/i18n';
import * as Core from '@/core';

export class MigrationController {
  private constructor() {}

  /**
   * Orchestrates post-DB-recreation re-sync.
   * Delegates homeserver data fetching to MigrationApplication,
   * then applies settings to the Zustand store (state management stays in Controller layer).
   */
  static async resync(pubky: Core.Pubky): Promise<void> {
    const remoteSettings = await Core.MigrationApplication.resync(pubky);

    if (remoteSettings) {
      Core.useSettingsStore.getState().loadFromHomeserver(remoteSettings);
      setLocaleCookie(remoteSettings.language);
      Logger.info('Settings loaded from homeserver during DB re-sync', { pubky });
    }
  }
}
