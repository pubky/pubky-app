import { Logger } from '@/libs/logger/logger';
import { FeedApplication } from '@/application/feed/feed';
import { MuteApplication } from '@/application/mute/mute';
import { SettingsApplication } from '@/application/settings/settings';
import type { Pubky } from '@/models/models.types';
import type { SettingsState } from '@/stores/settings/settings.types';
/**
 * MigrationApplication orchestrates post-DB-recreation re-sync of critical homeserver data.
 *
 * ADR-0009: MigrationApplication is a privileged root-node orchestrator (like BootstrapApplication).
 * It is a source node (in-degree 0) that fans out to multiple domain Applications for
 * post-migration data re-sync. No other Application class may call MigrationApplication.
 */
export class MigrationApplication {
  private constructor() {}

  /**
   * Fetches critical homeserver data that is not automatically re-fetched after DB recreation.
   * Calls MuteApplication, FeedApplication, and SettingsApplication in parallel.
   *
   * @returns Remote settings if available (for Controller to apply to Zustand store)
   */
  static async resync(pubky: Pubky, localSettings: SettingsState): Promise<SettingsState | null> {
    Logger.info('Starting post-DB-recreation re-sync', { pubky });

    // ADR-0009: MigrationApplication → leaf Applications (depth 1)
    const [, , remoteSettingsResult] = await Promise.allSettled([
      MuteApplication.fetchMutedUsers(pubky),
      FeedApplication.fetchFeeds(pubky),
      SettingsApplication.initializeSettings(pubky, localSettings),
    ]);

    Logger.info('Post-DB-recreation re-sync completed', { pubky });

    if (remoteSettingsResult.status === 'rejected') {
      return null;
    }

    return remoteSettingsResult.value;
  }
}
