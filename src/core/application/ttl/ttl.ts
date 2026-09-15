import { FileApplication } from '@/application/file/file';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { TagCacheApplication } from '@/application/tag/tag-cache';
import { TAG_REFRESH_MAX_CONCURRENCY } from '@/config/tags';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { getTtlRetryDelayMs } from '@/libs/runtime-config/runtime-config';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { LocalPostService } from '@/services/local/post/post';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { LocalTagCacheService, type TagEntity } from '@/services/local/tag/tag-cache';
import { LocalUserService } from '@/services/local/user/user';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';

export class TtlApplication {
  private constructor() {}

  static async findStalePostsByIds(params: { postIds: string[]; ttlMs: number }): Promise<string[]> {
    const uniqueIds = Array.from(new Set(params.postIds));
    if (uniqueIds.length === 0) return [];

    try {
      const ttlRecords = await PostTtlModel.findByIds(uniqueIds);
      const ttlMap = new Map<string, number>(ttlRecords.map((r) => [r.id, r.lastUpdatedAt]));
      const now = Date.now();

      return uniqueIds.filter((id) => {
        const lastUpdatedAt = ttlMap.get(id);
        return lastUpdatedAt === undefined || now - lastUpdatedAt > params.ttlMs;
      });
    } catch (error) {
      Logger.warn('TtlApplication: Failed to check post TTL records', { error });
      throw error;
    }
  }

  static async findStaleUsersByIds(params: { userIds: Pubky[]; ttlMs: number }): Promise<Pubky[]> {
    const uniqueIds = Array.from(new Set(params.userIds));
    if (uniqueIds.length === 0) return [];

    try {
      const ttlRecords = await UserTtlModel.findByIds(uniqueIds);
      const ttlMap = new Map<Pubky, number>(ttlRecords.map((r) => [r.id, r.lastUpdatedAt]));
      const now = Date.now();

      return uniqueIds.filter((id) => {
        const lastUpdatedAt = ttlMap.get(id);
        return lastUpdatedAt === undefined || now - lastUpdatedAt > params.ttlMs;
      });
    } catch (error) {
      Logger.warn('TtlApplication: Failed to check user TTL records', { error });
      throw error;
    }
  }

  /**
   * Force refresh posts by fetching fresh data from Nexus.
   */
  static async forceRefreshPostsByIds(params: {
    postIds: string[];
    viewerId?: Pubky;
    isCurrent?: () => boolean;
  }): Promise<void> {
    const uniqueIds = Array.from(new Set(params.postIds));
    if (uniqueIds.length === 0) return;

    // Stamp before the first await: a local write during the revision read must
    // still count as "written since the fetch started" for the omitted-id cooldown.
    const fetchStartedAt = Date.now();
    const revisions = await LocalTagCacheService.captureRevisions('post', uniqueIds);
    const postBatch = await NexusPostStreamService.fetchByIds({
      post_ids: uniqueIds,
      force: true,
      viewer_id: params.viewerId,
    });

    if (params.isCurrent && !params.isCurrent()) return;

    Logger.debug('TtlApplication: Fetched posts from Nexus', {
      postCount: postBatch.length,
    });

    // Do not publish a fresh post/TTL until its attachment metadata is durable.
    // A failed file write leaves the existing batch eligible for the next tick.
    await FileApplication.persistFiles(postBatch.flatMap((post) => post.attachments_metadata ?? []));
    if (params.isCurrent && !params.isCurrent()) return;
    // The refresh guard keeps rows edited locally since the fetch started (or
    // not yet re-indexed by Nexus) from being clobbered; see persistPosts.
    await LocalStreamPostsService.persistPosts({
      posts: postBatch,
      tagGuard: { revisions, isCurrent: params.isCurrent, viewerId: params.viewerId },
      refreshGuard: { fetchStartedAt },
    });
    if (params.isCurrent && !params.isCurrent()) return;
    const returnedPostIds = postBatch.map((post) =>
      buildCompositeId({ pubky: post.details.author, id: post.details.id }),
    );
    await this.deferOmittedIds(uniqueIds, returnedPostIds, (id) =>
      LocalPostService.upsertTtlWithDelay(id, getTtlRetryDelayMs(), { unlessWrittenSince: fetchStartedAt }),
    );
    await this.refreshTagWindows(
      postBatch.map(
        (post) => () =>
          TagCacheApplication.refreshExpanded(
            {
              kind: 'post',
              id: buildCompositeId({ pubky: post.details.author, id: post.details.id }),
              viewerId: params.viewerId,
              isCurrent: params.isCurrent,
            },
            post.tags.length,
          ),
      ),
    );

    // Fetch original posts for any reposts (to display embedded repost content)
    const repostedUris = postBatch
      .map((post) => post.relationships.reposted)
      .filter((uri): uri is string => uri !== null);
    await PostStreamApplication.fetchOriginalPostsByUris({
      repostedUris,
      viewerId: params.viewerId,
      isCurrent: params.isCurrent,
    });
  }

  /**
   * Force refresh users by fetching fresh data from Nexus.
   */
  static async forceRefreshUsersByIds(params: {
    userIds: Pubky[];
    viewerId?: Pubky;
    isCurrent?: () => boolean;
  }): Promise<Pubky[]> {
    const uniqueIds = Array.from(new Set(params.userIds));
    if (uniqueIds.length === 0) return [];

    const fetchStartedAt = Date.now();
    const revisions = await LocalTagCacheService.captureRevisions('user', uniqueIds);
    const userBatch = await NexusUserStreamService.fetchByIds({
      user_ids: uniqueIds,
      force: true,
      viewer_id: params.viewerId,
    });

    if (params.isCurrent && !params.isCurrent()) return [];
    await LocalStreamUsersService.persistUsers(userBatch, {
      revisions,
      isCurrent: params.isCurrent,
      viewerId: params.viewerId,
      fetchStartedAt,
    });
    if (params.isCurrent && !params.isCurrent()) return [];
    const returnedUserIds = userBatch.map((user) => user.details.id);
    await this.deferOmittedIds(uniqueIds, returnedUserIds, (id) =>
      LocalUserService.upsertTtlWithDelay(id, getTtlRetryDelayMs(), { unlessWrittenSince: fetchStartedAt }),
    );
    await this.refreshTagWindows(
      userBatch.map(
        (user) => () =>
          TagCacheApplication.refreshExpanded(
            { kind: 'user', id: user.details.id, viewerId: params.viewerId, isCurrent: params.isCurrent },
            user.tags.length,
          ),
      ),
    );
    return params.isCurrent && !params.isCurrent() ? [] : returnedUserIds;
  }

  /** Retry stale tag windows without downloading healthy post/profile batches again. */
  static async refreshStaleTags(params: {
    kind: TagEntity['kind'];
    ids: string[];
    ttlMs: number;
    viewerId?: Pubky;
    isCurrent?: () => boolean;
  }): Promise<void> {
    if (params.ids.length === 0) return;
    const ids = await LocalTagCacheService.findStale(params.kind, [...new Set(params.ids)], params.ttlMs);
    if (params.isCurrent && !params.isCurrent()) return;
    await this.refreshTagWindows(
      ids.map(
        (id) => () =>
          TagCacheApplication.refreshStale(
            {
              kind: params.kind,
              id,
              viewerId: params.viewerId,
              isCurrent: params.isCurrent,
            },
            params.ttlMs,
          ),
      ),
    );
  }

  /**
   * An id Nexus omitted from a batch (deleted, or not indexed yet) gets no fresh TTL row and
   * would be re-flagged on every tick. Park it for the retry delay instead, so a missing entity
   * costs one request per delay rather than one per tick. The deferrer keeps rows written since
   * the fetch started, so a cooldown never shortens freshness a local edit or another refresh
   * just established.
   */
  private static async deferOmittedIds<T extends string>(
    requested: T[],
    returned: T[],
    defer: (id: T) => Promise<void>,
  ): Promise<void> {
    const returnedIds = new Set(returned);
    const omitted = requested.filter((id) => !returnedIds.has(id));
    if (omitted.length === 0) return;
    Logger.debug('TtlApplication: Deferring ids omitted from the batch response', {
      count: omitted.length,
      ids: omitted.slice(0, 5),
    });
    await Promise.all(omitted.map(defer));
  }

  /** Run per-entity tag refreshes with bounded concurrency; a failed window keeps its retained data. */
  private static async refreshTagWindows(tasks: (() => Promise<void>)[]): Promise<void> {
    const pending = [...tasks];
    const worker = async () => {
      for (let task = pending.shift(); task; task = pending.shift()) {
        try {
          await task();
        } catch (error) {
          if (!isAppError(error))
            Logger.warn('TTL tag window refresh failed; retained window remains stale', { error });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(TAG_REFRESH_MAX_CONCURRENCY, pending.length) }, worker));
  }
}
