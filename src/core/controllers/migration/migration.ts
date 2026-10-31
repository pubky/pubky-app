import { MigrationApplication } from '@/application/migration/migration';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
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
    // The resync is not cancelled when the caller stops waiting: a fetch that outlives a sign-out
    // or an account switch must write nothing into the next account's database.
    const remoteSettings = await MigrationApplication.resync(pubky, localSettings, {
      isCurrent: captureViewerSession(),
    });

    if (remoteSettings) {
      useSettingsStore.getState().loadFromHomeserver(remoteSettings);
      Logger.info('Settings loaded from homeserver during DB re-sync', { pubky });
    }
  }
}
