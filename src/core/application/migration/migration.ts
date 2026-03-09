import { Logger } from '@/libs/logger';
import * as Core from '@/core';

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
   * Calls MuteApplication, FeedApplication, and SettingsApplication in parallel,
   * then persists muted users to the user_streams table.
   *
   * @returns Remote settings if available (for Controller to apply to Zustand store)
   */
  static async resync(pubky: Core.Pubky): Promise<Core.SettingsState | null> {
    Logger.info('Starting post-DB-recreation re-sync', { pubky });

    // ADR-0009: MigrationApplication → leaf Applications (depth 1)
    const [mutedUsers, , remoteSettings] = await Promise.all([
      Core.MuteApplication.fetchMutedUsers(pubky),
      Core.FeedApplication.fetchFeeds(pubky),
      Core.SettingsApplication.initializeSettings(pubky),
    ]);

    // Persist muted users to user_streams table
    await Core.LocalStreamUsersService.upsert({
      streamId: Core.UserStreamTypes.MUTED,
      stream: mutedUsers,
    });

    Logger.info('Post-DB-recreation re-sync completed', { pubky });

    return remoteSettings;
  }
}
