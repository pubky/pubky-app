import { BookmarkApplication } from '@/application/bookmark/bookmark';
import { FeedApplication } from '@/application/feed/feed';
import type { TResyncOptions } from '@/application/migration/migration.types';
import { MuteApplication } from '@/application/mute/mute';
import { SettingsApplication } from '@/application/settings/settings';
import { Logger } from '@/libs/logger/logger';
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
   * Calls MuteApplication, FeedApplication, SettingsApplication and BookmarkApplication in parallel.
   *
   * @param isCurrent - Whether the account the resync started for is still the current one; every
   *   private fetch checks it before its local write.
   * @returns Remote settings if available (for Controller to apply to Zustand store)
   */
  static async resync(
    pubky: Pubky,
    localSettings: SettingsState,
    { isCurrent }: TResyncOptions = {},
  ): Promise<SettingsState | null> {
    Logger.info('Starting post-DB-recreation re-sync', { pubky });

    // ADR-0009: MigrationApplication → leaf Applications (depth 1)
    // Mutes, feeds and bookmarks are private and account-scoped: the guard keeps a fetch that outlives
    // a sign-out from writing another account's rows (a feed listing run under the next session would
    // otherwise reconcile that account's feeds away).
    const [, , remoteSettingsResult] = await Promise.allSettled([
      MuteApplication.fetchMutedUsers(pubky, { isCurrent }),
      FeedApplication.fetchFeeds(pubky, { isCurrent }),
      SettingsApplication.initializeSettings(pubky, localSettings),
      BookmarkApplication.fetchBookmarks(pubky, { isCurrent }),
    ]);

    Logger.info('Post-DB-recreation re-sync completed', { pubky });

    if (remoteSettingsResult.status === 'rejected') {
      return null;
    }

    return remoteSettingsResult.value;
  }
}
