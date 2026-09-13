import { FileApplication } from '@/application/file/file';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { TagCacheApplication } from '@/application/tag/tag-cache';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { LocalTagCacheService, type TagEntity } from '@/services/local/tag/tag-cache';
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
    await LocalStreamPostsService.persistPosts({
      posts: postBatch,
      tagGuard: { revisions, isCurrent: params.isCurrent, viewerId: params.viewerId },
    });
    await this.refreshTagWindows(
      postBatch.map((post) =>
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
    });
    await this.refreshTagWindows(
      userBatch.map((user) =>
        TagCacheApplication.refreshExpanded(
          { kind: 'user', id: user.details.id, viewerId: params.viewerId, isCurrent: params.isCurrent },
          user.tags.length,
        ),
      ),
    );
    return params.isCurrent && !params.isCurrent() ? [] : userBatch.map((user) => user.details.id);
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
      ids.map((id) =>
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

  private static async refreshTagWindows(tasks: Promise<void>[]): Promise<void> {
    const results = await Promise.allSettled(tasks);
    for (const result of results) {
      if (result.status === 'rejected' && !isAppError(result.reason)) {
        Logger.warn('TTL tag window refresh failed; retained window remains stale', { error: result.reason });
      }
    }
  }
}
