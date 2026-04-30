import { Env } from '@/libs/env/env';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { AppError } from '@/libs/error/error';
import type { TBootstrapParams } from '@/application/bootstrap/bootstrap.types';
import { FeedApplication } from '@/application/feed/feed';
import { FileApplication } from '@/application/file/file';
import { MuteApplication } from '@/application/mute/mute';
import { NotificationApplication } from '@/application/notification/notification';
import { SettingsApplication } from '@/application/settings/settings';
import type { TBootstrapResponse } from '@/controllers/auth/auth.types';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';
import { buildHotTagsId } from '@/models/hot/hot.helper';
import type { Pubky } from '@/models/models.types';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { TagStreamTypes } from '@/models/stream/tag/tagStream.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalHotService } from '@/services/local/hot/hot';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamTagsService } from '@/services/local/stream/tags/tags';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { LocalUserService } from '@/services/local/user/user';
import { NexusBootstrapService } from '@/services/nexus/bootstrap/bootstrap';
import { UserStreamTimeframe } from '@/services/nexus/nexus.types';
import type { SettingsState } from '@/stores/settings/settings.types';
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
    params: TBootstrapParams & { localSettings: SettingsState },
    onProgress?: BootstrapProgressCallback,
  ): Promise<TBootstrapResponse> {
    const pubky = params.pubky;
    const [bootstrapData, userLastRead, remoteSettings] = await Promise.all([
      NexusBootstrapService.fetch(pubky),
      this.fetchOrPutLastRead(params),
      // Initialize settings from homeserver (non-blocking, errors are logged but don't fail bootstrap)
      this.syncSettings(pubky, params.localSettings),
      MuteApplication.fetchMutedUsers(pubky), // fetches and persists MUTED stream internally
      FeedApplication.fetchFeeds(pubky),
    ]);
    onProgress?.('bootstrapFetched'); // Step 3 complete (60%)

    if (!bootstrapData.indexed) {
      Logger.warn('User is not indexed in Nexus. Scheduling TTL retry', {
        pubky,
        retryDelayMs: Env.NEXT_PUBLIC_TTL_RETRY_DELAY_MS,
      });

      // Write TTL record to become stale after configured retry delay
      await LocalUserService.upsertTtlWithDelay(pubky, Env.NEXT_PUBLIC_TTL_RETRY_DELAY_MS);

      // Subscribe to TTL coordinator for periodic staleness checks
      TtlCoordinator.getInstance().subscribeUser({ pubky });
    }
    const [{ unread, nextPollCursor }] = await Promise.all([
      NotificationApplication.persistAndSummarize({
        notifications: bootstrapData.notifications,
        lastRead: userLastRead,
      }),
      LocalStreamUsersService.persistUsers(bootstrapData.users),
      LocalStreamPostsService.persistPosts({ posts: bootstrapData.posts }),
      LocalStreamPostsService.upsert({
        streamId: PostStreamTypes.TIMELINE_ALL_ALL,
        stream: bootstrapData.ids.stream,
      }),
      LocalStreamUsersService.upsert({
        streamId: UserStreamTypes.TODAY_INFLUENCERS_ALL,
        stream: bootstrapData.ids.influencers,
      }),
      LocalStreamUsersService.upsert({
        streamId: UserStreamTypes.RECOMMENDED,
        stream: bootstrapData.ids.recommended,
      }),
      FileApplication.persistFiles(bootstrapData.files),
      // Both features: hot tags and tag streams
      LocalHotService.upsert(buildHotTagsId(UserStreamTimeframe.TODAY, 'all'), bootstrapData.ids.hot_tags),
      LocalStreamTagsService.upsert(TagStreamTypes.TODAY_ALL, bootstrapData.ids.hot_tags),
    ]);
    onProgress?.('dataPersisted'); // Step 4 complete (80%)
    // TODO: We will not have that step, but we will add HomeserverSignIn step before step 1 to catch errors
    onProgress?.('homeserverSynced'); // Step 5 complete (100%)

    const notification = { unread, lastRead: userLastRead, lastPolledTimestamp: nextPollCursor };

    return { notification, remoteSettings: remoteSettings ?? null };
  }

  /**
   * Syncs user settings with the homeserver.
   * Returns remote settings if newer, null otherwise.
   * Errors are caught and logged — settings failure must not block bootstrap.
   *
   * @private
   * @param pubky - The user's public key identifier
   * @param localSettings - Current local settings state (passed from Controller layer)
   */
  private static async syncSettings(pubky: Pubky, localSettings: SettingsState): Promise<SettingsState | null> {
    try {
      return await SettingsApplication.initializeSettings(pubky, localSettings);
    } catch (error) {
      // Log but don't throw, settings sync failure shouldn't block bootstrap
      Logger.error('Failed to initialize settings during bootstrap', { error, pubky });
      return null;
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
  private static async fetchOrPutLastRead({ pubky, lastReadUrl }: TBootstrapParams): Promise<number> {
    try {
      const { timestamp } = await HomeserverService.request<{ timestamp: number }>({
        method: HttpMethod.GET,
        url: lastReadUrl,
      });
      return timestamp;
    } catch (error) {
      // Only handle 404 errors (resource not found), rethrow everything else
      if (error instanceof AppError && error.context?.statusCode === HttpStatusCode.NOT_FOUND) {
        Logger.info('Last read file not found, creating new one...', { pubky });
        const lastRead = LastReadNormalizer.to(pubky);
        void HomeserverService.request({
          method: HttpMethod.PUT,
          url: lastRead.meta.url,
          bodyJson: lastRead.last_read.toJson(),
        });
        return Number(lastRead.last_read.timestamp);
      } else {
        // Network errors, timeouts, server errors, etc. should bubble up
        Logger.error('Failed to fetch last read timestamp', error);
        // TODO: TO harsh, we should handle this error better
        throw error;
      }
    }
  }
}
