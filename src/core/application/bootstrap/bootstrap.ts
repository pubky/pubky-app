import { Env } from '@/libs/env';
import { Logger } from '@/libs/logger';
import { AppError } from '@/libs/error';
import { HttpMethod, HttpStatusCode } from '@/libs/http';
import * as Core from '@/core';
import * as Config from '@/config';

/**
 * Callback type for reporting bootstrap progress to the Controller layer.
 * This allows the Controller to update stores without violating architecture rules.
 */
export type BootstrapProgressCallback = (step: 'bootstrapFetched' | 'dataPersisted' | 'homeserverSynced') => void;

export class BootstrapApplication {
  private constructor() {}

  /**
   * Initialize application state from Nexus and notifications in parallel.
   *
   * @param params, Bootstrap parameters
   * @param params.pubky, The user's public key identifier
   * @param params.lastReadUrl, URL to fetch user's last read timestamp from homeserver
   * @param onProgress, Optional callback to report progress to the Controller layer
   * @returns Promise resolving to notification state with unread count and last read timestamp
   */
  static async initialize(
    params: Core.TBootstrapParams,
    onProgress?: BootstrapProgressCallback,
  ): Promise<Core.TBootstrapResponse> {
    const data = await Core.NexusBootstrapService.fetch(params.pubky);
    onProgress?.('bootstrapFetched'); // Step 3 complete (60%)

    if (!data.indexed) {
      Logger.warn('User is not indexed in Nexus. Scheduling TTL retry', {
        pubky: params.pubky,
        retryDelayMs: Env.NEXT_PUBLIC_TTL_RETRY_DELAY_MS,
      });

      // Write TTL record to become stale after configured retry delay
      await Core.LocalUserService.upsertTtlWithDelay(params.pubky, Env.NEXT_PUBLIC_TTL_RETRY_DELAY_MS);

      // Subscribe to TTL coordinator for periodic staleness checks
      Core.TtlCoordinator.getInstance().subscribeUser({ pubky: params.pubky });
    }
    await Promise.all([
      Core.LocalStreamUsersService.persistUsers(data.users),
      Core.LocalStreamPostsService.persistPosts({ posts: data.posts }),
      Core.LocalStreamPostsService.upsert({
        streamId: Core.PostStreamTypes.TIMELINE_ALL_ALL,
        stream: data.ids.stream,
      }),
      Core.LocalStreamUsersService.upsert({
        streamId: Core.UserStreamTypes.TODAY_INFLUENCERS_ALL,
        stream: data.ids.influencers,
      }),
      Core.LocalStreamUsersService.upsert({
        streamId: Core.UserStreamTypes.RECOMMENDED,
        stream: data.ids.recommended,
      }),
      Core.LocalStreamUsersService.upsert({
        streamId: Core.UserStreamTypes.MUTED,
        stream: data.ids.muted,
      }),
      // Both features: hot tags and tag streams
      Core.LocalHotService.upsert(Core.buildHotTagsId(Core.UserStreamTimeframe.TODAY, 'all'), data.ids.hot_tags),
      Core.LocalStreamTagsService.upsert(Core.TagStreamTypes.TODAY_ALL, data.ids.hot_tags),
    ]);
    onProgress?.('dataPersisted'); // Step 4 complete (80%)

    // Bootstrap posts don't include attachments_metadata, so collect URIs and fetch separately
    const fileUris = data.posts.flatMap((post) => post.details.attachments ?? []);

    const [_, notification] = await Promise.all([
      Core.FileApplication.fetchFiles(fileUris),
      this.fetchNotifications(params),
      // Initialize settings from homeserver (non-blocking, errors are logged but don't fail bootstrap)
      this.initializeSettings(params.pubky),
    ]);
    onProgress?.('homeserverSynced'); // Step 5 complete (100%)

    return { notification };
  }

  /**
   * Initializes user settings from homeserver.
   * If remote settings are newer, updates the local store.
   * If local settings are newer, syncs to homeserver.
   * Errors are logged but don't fail bootstrap.
   *
   * @private
   * @param pubky, The user's public key identifier
   */
  private static async initializeSettings(pubky: Core.Pubky): Promise<void> {
    try {
      const remoteSettings = await Core.SettingsApplication.initializeSettings(pubky);

      // If remote settings were returned and are newer, update the local store
      if (remoteSettings) {
        Core.useSettingsStore.getState().loadFromHomeserver(remoteSettings);
        Logger.info('Settings loaded from homeserver', { pubky });
      }
    } catch (error) {
      // Log but don't throw, settings sync failure shouldn't block bootstrap
      Logger.error('Failed to initialize settings during bootstrap', { error, pubky });
    }
  }

  /**
   * Retrieves user's last read timestamp from homeserver, fetches notification data from Nexus
   * and persists the notifications to the cache.
   *
   * @private
   * @param params, Bootstrap parameters
   * @param params.pubky, The user's public key identifier
   * @param params.lastReadUrl, URL to fetch user's last read timestamp from homeserver
   * @returns Promise resolving to notification list and last read timestamp
   */
  private static async fetchNotifications({
    pubky,
    lastReadUrl,
  }: Core.TBootstrapParams): Promise<Core.NotificationState> {
    let userLastRead: number;
    try {
      const { timestamp } = await Core.HomeserverService.request<{ timestamp: number }>({
        method: HttpMethod.GET,
        url: lastReadUrl,
      });
      userLastRead = timestamp;
    } catch (error) {
      // Only handle 404 errors (resource not found), rethrow everything else
      if (error instanceof AppError && error.context?.statusCode === HttpStatusCode.NOT_FOUND) {
        Logger.info('Last read file not found, creating new one...', { pubky });
        const lastRead = Core.LastReadNormalizer.to(pubky);
        void Core.HomeserverService.request({
          method: HttpMethod.PUT,
          url: lastRead.meta.url,
          bodyJson: lastRead.last_read.toJson(),
        });
        userLastRead = Number(lastRead.last_read.timestamp);
      } else {
        // Network errors, timeouts, server errors, etc. should bubble up
        Logger.error('Failed to fetch last read timestamp', error);
        // TODO: TO harsh, we should handle this error better
        throw error;
      }
    }

    // Get the latest notifications
    const notificationList = await Core.NexusUserService.notifications({
      user_id: pubky,
      limit: Config.NEXUS_NOTIFICATIONS_LIMIT,
    });

    // TODO: Temporal fix.This is an anti-pattern, we should fetch notifications also from nexus, like this we just need to persist and get the unread count.
    // Nexus will manage which parts of notifications are missings like Users and Posts.
    const flatNotifications = await Core.NotificationApplication.fetchMissingEntities({
      notifications: notificationList,
      viewerId: pubky,
    });
    const { unread, nextPollCursor } = await Core.NotificationApplication.persistAndSummarize({
      notifications: notificationList,
      flatNotifications,
      lastRead: userLastRead,
    });
    return { unread, lastRead: userLastRead, lastPolledTimestamp: nextPollCursor };
  }
}
